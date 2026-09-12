import { NextResponse } from 'next/server';

import { isLocale, type Locale } from '@/i18n/locales';
import { clientKey, rateLimit, tooManyRequests } from '@/lib/http/rateLimit';
import { EmbeddingUnavailableError } from '@/lib/retrieval/embedder';
import { IndexMissingError, searchVerses } from '@/lib/retrieval/search';

export const runtime = 'nodejs';

/**
 * Semantic verse search.
 *
 * Public, and deliberately so: finding the verse that speaks to a situation is
 * the most useful thing this corpus does, it costs no AI credit, and gating it
 * behind sign-in would put a login wall in front of public-domain scripture.
 *
 * It was previously disabled in production because an open endpoint that runs
 * an embedding model on arbitrary input is a free denial-of-service lever.
 * That concern was right; closing the endpoint was the blunt answer. The limits
 * below are the sharp one — a short query cap, a small top-k, and a per-client
 * rate limit. See src/lib/http/rateLimit.ts for what that limiter does and
 * does not protect against.
 *
 *   curl 'http://localhost:3000/api/search?q=I+cannot+decide&k=5'
 */

const MAX_QUERY_CHARS = 500;
const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 20;

export async function GET(request: Request) {
  const limit = rateLimit(clientKey(request, 'search'), REQUESTS_PER_WINDOW, WINDOW_MS);
  if (!limit.ok) return tooManyRequests(limit);

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY_CHARS);
  const topK = Math.min(Math.max(Number(url.searchParams.get('k') ?? 5), 1), 10);
  const localeParam = url.searchParams.get('locale') ?? 'en';
  const locale: Locale = isLocale(localeParam) ? localeParam : 'en';

  if (!query) {
    return NextResponse.json({ error: 'missing_query', hint: 'pass ?q=' }, { status: 400 });
  }

  try {
    const hits = await searchVerses(query, { topK, locale, includeVerseData: true });
    return NextResponse.json(
      {
        query,
        locale,
        count: hits.length,
        results: hits.map((h) => ({
          verseId: h.verseId,
          ref: `${h.chapter}.${h.verse}`,
          chapter: h.chapter,
          verse: h.verse,
          score: Number(h.score.toFixed(4)),
          matchedLocale: h.matchedLocale,
          // Prefer the reader's own language when the corpus has it; the
          // matched text may be in another, since retrieval is cross-lingual.
          text: h.verse_data?.translations?.[locale] ?? h.text,
          status: h.verse_data?.translation_meta?.[locale]?.status ?? 'placeholder',
        })),
      },
      { headers: { 'X-RateLimit-Remaining': String(limit.remaining) } }
    );
  } catch (err) {
    if (err instanceof EmbeddingUnavailableError || err instanceof IndexMissingError) {
      return NextResponse.json({ error: err.name, message: err.message }, { status: 503 });
    }
    throw err;
  }
}
