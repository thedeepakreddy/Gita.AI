import type { Locale } from '@/i18n/locales';

/**
 * Scripture-agnostic verse schema.
 *
 * Field names deliberately avoid Gita-specific vocabulary (no "shloka",
 * "adhyaya", "purport") so the same shape can carry other scriptures later.
 *
 * NOTE: `sanskrit` is the one field that still names a specific language. It is
 * kept because it is unambiguous for the corpus we actually have today; the
 * generic descriptors live alongside it on the chapter (`sourceLanguage`,
 * `script`). If a non-Sanskrit scripture is ever added, this is the single
 * field to rename.
 */

/** A single word-level gloss, in source-text order. */
export type WordMeaning = {
  /** The word as it appears in the source text (Devanagari or transliterated). */
  word: string;
  /** Its meaning, in the language of the surrounding entry. */
  meaning: string;
};

/**
 * How far a given translation has come. Everything seeded today is
 * `placeholder` — public-domain text standing in until reviewed copy exists.
 */
export type TranslationStatus = 'placeholder' | 'in-review' | 'reviewed';

export type TranslationMeta = {
  status: TranslationStatus;
  /** Human-readable translator credit, e.g. "Annie Besant". */
  translator: string | null;
  /** Where the text came from, for audit. */
  source: string | null;
  /** e.g. "public-domain". Never leave unset on shipped text. */
  license: string | null;
};

export type Verse = {
  /** Stable global id: `${scripture}:${chapter}:${verse}`. Used as vector-store key. */
  id: string;
  scripture: string;
  chapter: number;
  verse: number;
  /** Source text in its original script. */
  sanskrit: string;
  /** IAST romanization. */
  transliteration: string;
  /** Word-by-word glosses; empty when not yet sourced. */
  word_meanings: WordMeaning[];
  /** Translation text keyed by locale. A locale may be absent. */
  translations: Partial<Record<Locale, string>>;
  /** Provenance per locale, parallel to `translations`. */
  translation_meta: Partial<Record<Locale, TranslationMeta>>;
};

export type Chapter = {
  scripture: string;
  chapter: number;
  /** Chapter name per locale. */
  title: Partial<Record<Locale, string>>;
  /** Traditional chapter name in the source script, e.g. "सांख्ययोग". */
  titleSanskrit: string | null;
  /** BCP-47 code of the source text, e.g. "sa". */
  sourceLanguage: string;
  /** Script of the source text, e.g. "Devanagari". */
  script: string;
  /** Free-form provenance notes shown in the UI and kept for the eventual handover. */
  sources: {
    sanskrit: string;
    transliteration: string;
    translations: Partial<Record<Locale, string>>;
  };
  generatedAt: string;
  verses: Verse[];
};

export function verseId(scripture: string, chapter: number, verse: number): string {
  return `${scripture}:${chapter}:${verse}`;
}

/** Human-facing citation, e.g. "Bhagavad Gita 2.47". */
export function verseRef(verse: Pick<Verse, 'chapter' | 'verse'>): string {
  return `${verse.chapter}.${verse.verse}`;
}
