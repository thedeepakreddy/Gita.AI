import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Locale } from '@/i18n/locales';
import { getVerse } from '@/lib/verses/store';
import type { Verse } from '@/lib/verses/types';

import { embedOne } from './embedder';

/**
 * Semantic retrieval over the verse corpus.
 *
 * Vectors are L2-normalized at index time, so cosine similarity is just a dot
 * product. At 700 verses a linear scan takes well under a millisecond — an ANN
 * index would be pure complexity here. Revisit past ~100k vectors.
 */

const STORE_PATH = join(process.cwd(), 'data', 'embeddings', 'vectors.json');

type StoreEntry = {
  verseId: string;
  scripture: string;
  chapter: number;
  verse: number;
  locale: string;
  text: string;
  vector: number[];
};

type VectorStore = {
  model: string;
  dimensions: number;
  normalized: boolean;
  count: number;
  entries: StoreEntry[];
};

export type SearchHit = {
  verseId: string;
  scripture: string;
  chapter: number;
  verse: number;
  /** Cosine similarity in [-1, 1]; in practice ~0.3–0.8 for real matches. */
  score: number;
  /** The locale of the text that actually matched. */
  matchedLocale: string;
  /** The matched translation text. */
  text: string;
  /** Full verse record, for prompt building and display. */
  verse_data?: Verse;
};

export class IndexMissingError extends Error {
  constructor() {
    super(
      'No vector index found. Build it with:  .venv/bin/python scripts/embed.py index'
    );
    this.name = 'IndexMissingError';
  }
}

let storePromise: Promise<VectorStore> | null = null;

async function loadStore(): Promise<VectorStore> {
  let raw: string;
  try {
    raw = await readFile(STORE_PATH, 'utf8');
  } catch {
    throw new IndexMissingError();
  }
  const store = JSON.parse(raw) as VectorStore;
  if (!store.entries?.length) throw new IndexMissingError();
  return store;
}

export function getStore(): Promise<VectorStore> {
  // A *rejected* promise must not be memoized. The documented first-run order
  // is "start the app, then build the index", so the very first search can
  // legitimately fail — caching that failure made every later request report
  // a missing index until the server was restarted.
  storePromise ??= loadStore().catch((err) => {
    storePromise = null;
    throw err;
  });
  return storePromise;
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export type SearchOptions = {
  topK?: number;
  /** Preferred language; used to pick which translation to show, not to filter. */
  locale?: Locale;
  /** Restrict to one scripture, e.g. "bhagavad-gita". */
  scripture?: string;
  /** Drop hits below this similarity. */
  minScore?: number;
  /** Attach the full verse record to each hit. */
  includeVerseData?: boolean;
};

/**
 * Embed `query` and return the best-matching verses.
 *
 * All locales are searched, not just the user's — the indexing model
 * (multilingual-e5-base by default) is cross-lingual, so
 * a Hungarian question matches English verse text meaningfully. That matters
 * while hu/hi translations are still unseeded: a Hungarian speaker would
 * otherwise get nothing back at all.
 *
 * A verse indexed in several languages produces several entries; they are
 * collapsed to the single best-scoring one so top-k means k *verses*.
 */
export async function searchVerses(
  query: string,
  options: SearchOptions = {}
): Promise<SearchHit[]> {
  const {
    topK = 5,
    locale,
    scripture,
    minScore = 0,
    includeVerseData = true,
  } = options;

  const trimmed = query.trim();
  if (!trimmed) return [];

  const [store, queryVector] = await Promise.all([getStore(), embedOne(trimmed)]);

  if (queryVector.length !== store.dimensions) {
    throw new Error(
      `Query vector has ${queryVector.length} dimensions but the index has ` +
        `${store.dimensions}. The embedding service and the index were built with ` +
        `different models — re-run \`scripts/embed.py index\`.`
    );
  }

  const bestByVerse = new Map<string, SearchHit>();

  for (const entry of store.entries) {
    if (scripture && entry.scripture !== scripture) continue;

    const score = dot(queryVector, entry.vector);
    if (score < minScore) continue;

    const existing = bestByVerse.get(entry.verseId);
    // Prefer a higher score; on a near-tie prefer the user's own language.
    const preferred =
      !existing ||
      score > existing.score + 1e-6 ||
      (Math.abs(score - existing.score) <= 1e-6 &&
        locale != null &&
        entry.locale === locale &&
        existing.matchedLocale !== locale);

    if (preferred) {
      bestByVerse.set(entry.verseId, {
        verseId: entry.verseId,
        scripture: entry.scripture,
        chapter: entry.chapter,
        verse: entry.verse,
        score,
        matchedLocale: entry.locale,
        text: entry.text,
      });
    }
  }

  const hits = [...bestByVerse.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (includeVerseData) {
    for (const hit of hits) {
      hit.verse_data = await getVerse(hit.verseId);
    }
  }

  return hits;
}
