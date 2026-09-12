import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';

import { authOptions } from '@/lib/auth';
import {
  TRIAL_MESSAGE_LIMIT,
  trialConfigured,
  trialRemainingFor,
} from '@/lib/chat/keyResolution';
import { isProvider, validateKey, ProviderError } from '@/lib/chat/providers';
import { encryptSecret, inspectKey, keyHint, normalisePastedKey } from '@/lib/crypto/secrets';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs'; // node:crypto and Prisma both need it

/**
 * Which providers this user has a key saved for, plus their trial standing.
 * Never returns key material.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const [keys, trialRemaining] = await Promise.all([
    prisma.apiKey.findMany({
      where: { userId: session.user.id },
      select: { provider: true, keyHint: true, updatedAt: true },
      // Newest first: the chat UI defaults to the most recently saved key, and
      // resolveKey falls back the same way.
      orderBy: { updatedAt: 'desc' },
    }),
    trialRemainingFor(session.user.id),
  ]);

  return NextResponse.json({
    keys,
    trial: {
      configured: trialConfigured,
      remaining: trialRemaining,
      limit: TRIAL_MESSAGE_LIMIT,
    },
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  let body: { provider?: string; apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const provider = String(body.provider ?? '');
  // A paste routinely drags in a zero-width space or the curly quotes an editor
  // wrapped around it. Silently failing on characters the user cannot see is
  // hostile, so clean them and say we did.
  const { key: apiKey, cleaned } = normalisePastedKey(String(body.apiKey ?? ''));

  if (!isProvider(provider)) {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: 'missing_key' }, { status: 400 });
  }

  // The shape check is ADVISORY. It is a guess about formats providers change
  // without notice, and it must never be the thing that refuses a key.
  //
  // It used to refuse one. Google issues both `AIza…` and the newer `AQ.…`,
  // and anything not matching the older pattern was rejected in ~20ms with
  // "not accepted by the provider" — about a provider that was never asked.
  // The cost of a wrong guess here is a valid key with no way round; the cost
  // of no guess is one API call that comes back "no". Only the provider knows.
  const shape = inspectKey(provider, apiKey);

  // Confirm the key works before storing it — a saved key that silently fails
  // at chat time is a much worse experience than a failure here.
  try {
    await validateKey(provider, apiKey);
  } catch (err) {
    const kind = err instanceof ProviderError ? err.kind : 'unknown';
    return NextResponse.json(
      {
        error: 'key_rejected',
        kind,
        message: (err as Error).message,
        /** This one really did come back from the provider. */
        contactedProvider: true,
        // The shape hint rides along, because when a key is genuinely wrong
        // "it does not start with AIza" is often the more actionable half.
        ...(shape.ok
          ? {}
          : {
              issue: shape.issue,
              detectedProvider: shape.detectedProvider,
              expectedPrefix: shape.expectedPrefix,
              minLength: shape.minLength,
              actualLength: shape.actualLength,
            }),
      },
      { status: 400 }
    );
  }

  // Accepted by the provider but not by our pattern: the pattern is out of
  // date, not the key. Logged loudly, because that is the signal that
  // KEY_SHAPES needs updating and nobody would otherwise ever see it.
  if (!shape.ok) {
    console.warn(
      `[keys] ${provider} key accepted by the provider but did not match KEY_SHAPES ` +
        `(${shape.issue}). The pattern in src/lib/crypto/secrets.ts is probably stale.`
    );
  }

  const encrypted = encryptSecret(apiKey, session.user.id, provider);

  await prisma.apiKey.upsert({
    where: { userId_provider: { userId: session.user.id, provider } },
    create: {
      userId: session.user.id,
      provider,
      ...encrypted,
      keyHint: keyHint(apiKey),
    },
    update: { ...encrypted, keyHint: keyHint(apiKey) },
  });

  return NextResponse.json({
    ok: true,
    provider,
    keyHint: keyHint(apiKey),
    cleaned,
    /** True when the provider accepted a key our pattern did not recognise. */
    unrecognisedFormat: !shape.ok,
  });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const provider = new URL(request.url).searchParams.get('provider') ?? '';
  if (!isProvider(provider)) {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 400 });
  }

  await prisma.apiKey.deleteMany({ where: { userId: session.user.id, provider } });
  return NextResponse.json({ ok: true });
}
