import type { Locale } from '@/i18n/locales';
import { isLocale } from '@/i18n/locales';
import { prisma } from '@/lib/db';

import type { Verse, Chapter, TranslationMeta, TranslationStatus } from './types';

/**
 * Reviewed translations, layered over the corpus on disk.
 *
 * WHY A LAYER AND NOT AN EDIT. data/verses/**.json ships public-domain
 * placeholders. A reviewer's replacement is stored in the database and applied
 * at read time rather than written back into the file, for two reasons:
 *
 *   1. a deployed app may have no writable filesystem, and a review workflow
 *      that only works on a laptop is not a review workflow;
 *   2. the original stays recoverable. Reverting a bad edit is a DELETE, not a
 *      restore from backup — which matters when the text is scripture and the
 *      reviewer is a volunteer learning the tool.
 *
 * `npm run data:export` folds approved revisions back into the JSON, so the
 * corpus can be re-embedded and handed on as plain files with no database.
 *
 * FAIL-SOFT ON PURPOSE. If the database is unreachable this returns the corpus
 * unchanged and logs. A broken review system must never take /study down.
 */

export type Revision = {
  verseId: string;
  locale: Locale;
  text: string;
  status: TranslationStatus;
  translator: string | null;
  source: string | null;
  license: string | null;
  note: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
};

type RevisionIndex = Map<string, Partial<Record<Locale, Revision>>>;

const CACHE_MS = 15_000;
let cache: { at: number; index: RevisionIndex } | null = null;

/** Call after any write, so a reviewer sees their own edit immediately. */
export function invalidateRevisions(): void {
  cache = null;
}

async function loadIndex(): Promise<RevisionIndex> {
  const rows = await prisma.translationRevision.findMany({
    include: { reviewedBy: { select: { name: true, email: true } } },
  });

  const index: RevisionIndex = new Map();
  for (const row of rows) {
    if (!isLocale(row.locale)) continue;
    const entry = index.get(row.verseId) ?? {};
    entry[row.locale] = {
      verseId: row.verseId,
      locale: row.locale,
      text: row.text,
      status: row.status === 'reviewed' ? 'reviewed' : 'in-review',
      translator: row.translator,
      source: row.source,
      license: row.license,
      note: row.note,
      reviewedByName: row.reviewedBy?.name ?? row.reviewedBy?.email ?? null,
      reviewedAt: row.reviewedAt,
    };
    index.set(row.verseId, entry);
  }
  return index;
}

export async function getRevisionIndex(): Promise<RevisionIndex> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.index;
  try {
    const index = await loadIndex();
    cache = { at: Date.now(), index };
    return index;
  } catch (err) {
    console.error('[revisions] could not read revisions; serving the corpus as shipped:', err);
    return cache?.index ?? new Map();
  }
}

function merge(verse: Verse, revisions: Partial<Record<Locale, Revision>> | undefined): Verse {
  if (!revisions) return verse;

  const translations = { ...verse.translations };
  const translation_meta = { ...verse.translation_meta };

  for (const [locale, rev] of Object.entries(revisions) as [Locale, Revision][]) {
    translations[locale] = rev.text;
    const meta: TranslationMeta = {
      status: rev.status,
      translator: rev.translator,
      source: rev.source,
      license: rev.license,
    };
    translation_meta[locale] = meta;
  }

  return { ...verse, translations, translation_meta };
}

export async function withRevisions(verse: Verse | undefined): Promise<Verse | undefined> {
  if (!verse) return verse;
  const index = await getRevisionIndex();
  return merge(verse, index.get(verse.id));
}

export async function withRevisionsMany(verses: Verse[]): Promise<Verse[]> {
  const index = await getRevisionIndex();
  return verses.map((v) => merge(v, index.get(v.id)));
}

export async function chapterWithRevisions(chapter: Chapter): Promise<Chapter> {
  const index = await getRevisionIndex();
  return { ...chapter, verses: chapter.verses.map((v) => merge(v, index.get(v.id))) };
}

export async function chaptersWithRevisions(chapters: Chapter[]): Promise<Chapter[]> {
  const index = await getRevisionIndex();
  return chapters.map((c) => ({
    ...c,
    verses: c.verses.map((v) => merge(v, index.get(v.id))),
  }));
}

/** Counts for the review dashboard: how far each language has come. */
export async function reviewProgress(locale: Locale, totalVerses: number) {
  const index = await getRevisionIndex();
  let reviewed = 0;
  let inReview = 0;
  for (const entry of index.values()) {
    const rev = entry[locale];
    if (!rev) continue;
    if (rev.status === 'reviewed') reviewed++;
    else inReview++;
  }
  return {
    locale,
    total: totalVerses,
    reviewed,
    inReview,
    placeholder: Math.max(0, totalVerses - reviewed - inReview),
  };
}
