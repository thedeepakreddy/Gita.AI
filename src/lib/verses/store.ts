import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  chapterWithRevisions,
  chaptersWithRevisions,
  withRevisions,
  withRevisionsMany,
} from './revisions';
import type { Chapter, Verse } from './types';

/**
 * Reads the chapter JSON files off disk and indexes them by verse id.
 *
 * The corpus is small (700 verses, ~1MB) and immutable at runtime, so it is
 * loaded once per process and held in memory. If the corpus ever grows past a
 * few MB, this is the seam to replace with a database read.
 *
 * The FILES are immutable; what is served is not. Every public getter here
 * applies reviewed translations from the database on the way out (see
 * ./revisions.ts), so nothing downstream — /study, retrieval, the prompt — has
 * to remember to ask for approved text. `loadCorpus` stays raw: it is the
 * thing revisions are layered over.
 */

const VERSES_DIR = join(process.cwd(), 'data', 'verses');

type Corpus = {
  chapters: Chapter[];
  byId: Map<string, Verse>;
};

let corpusPromise: Promise<Corpus> | null = null;

async function loadCorpus(): Promise<Corpus> {
  const chapters: Chapter[] = [];

  const scriptures = await readdir(VERSES_DIR, { withFileTypes: true });
  for (const entry of scriptures) {
    if (!entry.isDirectory()) continue;
    const dir = join(VERSES_DIR, entry.name);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
    for (const file of files) {
      chapters.push(JSON.parse(await readFile(join(dir, file), 'utf8')) as Chapter);
    }
  }

  chapters.sort((a, b) => a.scripture.localeCompare(b.scripture) || a.chapter - b.chapter);

  const byId = new Map<string, Verse>();
  for (const chapter of chapters) {
    for (const verse of chapter.verses) byId.set(verse.id, verse);
  }

  return { chapters, byId };
}

export function getCorpus(): Promise<Corpus> {
  // Same reasoning as getStore(): a transient read failure (a half-written
  // chapter file mid-rebuild) must not be cached for the life of the process.
  corpusPromise ??= loadCorpus().catch((err) => {
    corpusPromise = null;
    throw err;
  });
  return corpusPromise;
}

export async function getChapters(): Promise<Chapter[]> {
  return chaptersWithRevisions((await getCorpus()).chapters);
}

/** The corpus exactly as it ships, with no reviewed text applied. */
export async function getChaptersRaw(): Promise<Chapter[]> {
  return (await getCorpus()).chapters;
}

export async function getChapter(
  scripture: string,
  chapter: number
): Promise<Chapter | undefined> {
  const found = (await getCorpus()).chapters.find(
    (c) => c.scripture === scripture && c.chapter === chapter
  );
  return found ? chapterWithRevisions(found) : undefined;
}

export async function getVerse(id: string): Promise<Verse | undefined> {
  return withRevisions((await getCorpus()).byId.get(id));
}

/** One verse exactly as it ships, for showing a reviewer what they are replacing. */
export async function getVerseRaw(id: string): Promise<Verse | undefined> {
  return (await getCorpus()).byId.get(id);
}

export async function getVerses(ids: string[]): Promise<Verse[]> {
  const { byId } = await getCorpus();
  return withRevisionsMany(
    ids.map((id) => byId.get(id)).filter((v): v is Verse => Boolean(v))
  );
}

/** Every verse in the corpus, in canonical order. */
export async function getAllVerses(): Promise<Verse[]> {
  const { chapters } = await getCorpus();
  return withRevisionsMany(chapters.flatMap((c) => c.verses));
}
