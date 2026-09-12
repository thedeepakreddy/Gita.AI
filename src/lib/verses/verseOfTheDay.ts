import type { Locale } from '@/i18n/locales';
import { confidenceOf } from './confidence';
import { getAllVerses } from './store';
import type { Verse } from './types';

/**
 * One verse a day, the same one for everybody.
 *
 * Deterministic from the calendar date rather than random, for three reasons:
 * two people can talk about "today's verse" and mean the same thing, a reload
 * does not reshuffle it, and it can be rendered on the server with no state.
 *
 * The whole corpus is in the pool. Curating a "best of" list would mean
 * deciding which verses are worth showing, and that is a judgement for the
 * temple, not for this file — if they ever want one, it becomes a list of ids
 * here and nothing else changes.
 */

/** Date as UTC days since the epoch, so the day turns over once globally. */
function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
}

/**
 * A cheap integer hash. Sequential days must not give sequential verses, or
 * the feature reads as "chapter 1 for a fortnight".
 */
function scramble(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = x ^ (x >>> 16);
  return Math.abs(x);
}

export type DailyVerse = {
  verse: Verse;
  /** The reader's language if the corpus has it, else the English fallback. */
  text: string;
  textLocale: Locale;
  /** 'reviewed' needs no caveat; anything else does. */
  confidence: 'reviewed' | 'placeholder' | 'in-review';
};

export async function getVerseOfTheDay(
  locale: Locale,
  date: Date = new Date()
): Promise<DailyVerse | null> {
  const verses = await getAllVerses();
  if (verses.length === 0) return null;

  const verse = verses[scramble(dayNumber(date)) % verses.length];

  const own = verse.translations[locale];
  const text = own ?? verse.translations.en ?? '';
  const textLocale: Locale = own ? locale : 'en';

  return {
    verse,
    text,
    textLocale,
    confidence: confidenceOf(verse.translation_meta[textLocale]?.status),
  };
}
