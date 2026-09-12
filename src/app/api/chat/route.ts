import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

import { isLocale, type Locale } from '@/i18n/locales';
import { authOptions } from '@/lib/auth';
import {
  buildSystemPrompt,
  buildUserMessage,
  extractCitations,
  findDivineFirstPerson,
} from '@/lib/chat/prompt';
import { consumeTrialMessage, resolveKey } from '@/lib/chat/keyResolution';
import { complete, ProviderError } from '@/lib/chat/providers';
import { prisma } from '@/lib/db';
import { EmbeddingUnavailableError } from '@/lib/retrieval/embedder';
import { IndexMissingError, searchVerses } from '@/lib/retrieval/search';

export const runtime = 'nodejs';

const TOP_K = 5;

/**
 * Prior exchanges replayed to the provider.
 *
 * History is the only term in the prompt that grows without bound, and the
 * user is re-billed for all of it on every message. Measured: 8 exchanges of
 * full transcript added ~2,500 tokens per turn, roughly tripling the cost of a
 * request whose own content is ~1,000.
 *
 * Three exchanges keeps a conversation coherent — enough for "what you said
 * earlier" to work — without paying for the whole thread forever.
 */
const HISTORY_TURNS = 3;

/**
 * Assistant replies are replayed truncated. The model needs the gist of what
 * it already said for continuity, not a verbatim copy, and full replies are
 * the single largest thing in the history budget. User messages are never
 * truncated — those are the person's own words and are short anyway.
 */
const HISTORY_ASSISTANT_CHARS = 500;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: {
    message?: string;
    conversationId?: string;
    locale?: string;
    provider?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const message = String(body.message ?? '').trim();
  if (!message) return NextResponse.json({ error: 'empty_message' }, { status: 400 });
  if (message.length > 4000) {
    return NextResponse.json({ error: 'message_too_long' }, { status: 400 });
  }

  const locale: Locale = isLocale(String(body.locale)) ? (body.locale as Locale) : 'en';

  // --- Load the conversation first: it may pin a provider, and an explicit
  // --- provider on this request overrides it (that is how a user switches).
  let conversation = body.conversationId
    ? await prisma.conversation.findFirst({
        where: { id: body.conversationId, userId }, // scoped: no cross-user reads
        include: {
          // Newest-first, then reversed below. `asc` + `take` returns the
          // OLDEST rows, which froze the model's memory at the opening of a
          // long thread — "what you said earlier" resolved to the first
          // exchange forever, no matter how far the conversation had moved.
          messages: { orderBy: { createdAt: 'desc' }, take: HISTORY_TURNS * 2 },
        },
      })
    : null;

  // --- Decide whose key pays: the user's own, or the operator trial pool.
  const resolution = await resolveKey(userId, body.provider ?? conversation?.provider ?? undefined);
  if (!resolution.ok) {
    const status = resolution.reason === 'key_undecryptable' ? 409 : 428;
    return NextResponse.json(
      {
        error: resolution.reason,
        trialRemaining: resolution.trialRemaining,
      },
      { status }
    );
  }
  const { provider, apiKey, source } = resolution.key;

  // --- Retrieve grounding verses.
  let hits;
  try {
    hits = await searchVerses(message, { topK: TOP_K, locale, includeVerseData: true });
  } catch (err) {
    if (err instanceof EmbeddingUnavailableError) {
      return NextResponse.json(
        { error: 'embedding_unavailable', message: err.message },
        { status: 503 }
      );
    }
    if (err instanceof IndexMissingError) {
      return NextResponse.json({ error: 'index_missing', message: err.message }, { status: 503 });
    }
    throw err;
  }

  const history = [...(conversation?.messages ?? [])]
    // Loaded newest-first above; providers want oldest-first.
    .reverse()
    .map((m) => {
      const role = m.role as 'user' | 'assistant';
      const content =
        role === 'assistant' && m.content.length > HISTORY_ASSISTANT_CHARS
          ? `${m.content.slice(0, HISTORY_ASSISTANT_CHARS).trimEnd()}…`
          : m.content;
      return { role, content };
    });

  // --- Call the user's provider.
  let reply: string;
  try {
    reply = await complete({
      provider,
      apiKey,
      system: buildSystemPrompt(locale),
      messages: [...history, { role: 'user', content: buildUserMessage({ question: message, hits, locale }) }],
    });
  } catch (err) {
    const kind = err instanceof ProviderError ? err.kind : 'unknown';
    const status = kind === 'auth' ? 401 : kind === 'quota' ? 429 : 502;
    return NextResponse.json(
      { error: 'provider_error', kind, message: (err as Error).message },
      { status }
    );
  }

  // --- Theological backstop. If the model spoke as Krishna despite the
  // --- system prompt, refuse the turn rather than rewriting it into something
  // --- that merely looks acceptable. The reply is never shown and never
  // --- stored as a Message.
  // ---
  // --- It IS recorded, on its own table. The guard firing silently was a gap:
  // --- an application donated to a temple has to be able to answer "how often
  // --- does this happen, and what did it say" with evidence rather than
  // --- assurance. VoiceViolation is that evidence, and it is admin-only.
  const violation = findDivineFirstPerson(reply);
  if (violation) {
    try {
      await prisma.voiceViolation.create({
        data: {
          userId,
          conversationId: conversation?.id ?? null,
          provider,
          locale,
          pattern: violation.pattern,
          matched: violation.matched,
          question: message,
          reply,
        },
      });
    } catch (err) {
      // Best-effort, like persistence below. Failing to write the audit line
      // must not turn a correctly-refused answer into a 500.
      console.error('[chat] voice violation caught but not logged:', err);
    }

    return NextResponse.json(
      {
        error: 'voice_violation',
        message:
          'The reply spoke in Krishna’s own voice, which this application does not do. Nothing was saved. Please rephrase and try again.',
      },
      { status: 422 }
    );
  }

  const citations = extractCitations(reply);

  // --- Persist. Best-effort, deliberately.
  //
  // By this point the provider has already been called and the user has
  // already paid for the answer — in quota, in credit, or from their trial
  // allowance. Letting a database error propagate would return a 500 and throw
  // away a reply they cannot get back for free. So: log it, return the answer
  // anyway, and tell the client it was not saved.
  //
  // This is not hypothetical. A stale Prisma client (the schema was migrated
  // while the dev server was running) discarded four real answers exactly this
  // way — each one already generated and already billed.
  let persisted = true;
  try {
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          userId,
          locale,
          title: message.slice(0, 80).replace(/\s+/g, ' ').trim() || 'Untitled',
          // Only pin when the user is paying — a trial conversation should not
          // be locked to the operator's provider, so that when they later add
          // their own key the thread simply continues on it.
          provider: source === 'user' ? provider : null,
        },
        include: { messages: true },
      });
    } else if (source === 'user' && conversation.provider !== provider) {
      // The user switched provider mid-thread; remember it for next time.
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { provider },
      });
    }

    await prisma.message.createMany({
      data: [
        { conversationId: conversation.id, role: 'user', content: message },
        {
          conversationId: conversation.id,
          role: 'assistant',
          content: reply,
          citations: JSON.stringify(citations),
          usedTrialKey: source === 'trial',
        },
      ],
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });
  } catch (err) {
    persisted = false;
    console.error('[chat] reply generated but could not be saved:', err);
  }

  // Charge the trial only now — after a reply exists. A provider failure
  // earlier in this handler must not cost the user a free message. A *storage*
  // failure still charges it: the provider call was made and billed either
  // way, and not charging would let a broken database hand out free messages.
  const trialRemaining =
    source === 'trial' ? await consumeTrialMessage(userId) : resolution.key.trialRemaining;

  return NextResponse.json({
    conversationId: conversation?.id ?? null,
    reply,
    citations,
    provider,
    keySource: source,
    trialRemaining,
    persisted,
    verses: hits.map((h) => ({
      ref: `${h.chapter}.${h.verse}`,
      chapter: h.chapter,
      verse: h.verse,
      score: Number(h.score.toFixed(4)),
      text: h.text,
      matchedLocale: h.matchedLocale,
    })),
  });
}
