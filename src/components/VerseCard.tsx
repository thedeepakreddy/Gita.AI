'use client';

import { useTranslations } from 'next-intl';

import { BookmarkButton } from '@/components/BookmarksProvider';
import { caveatKey } from '@/lib/verses/confidence';
import type { Locale } from '@/i18n/locales';
import type { Verse } from '@/lib/verses/types';

/**
 * One verse.
 *
 * Purely presentational now — the language choice belongs to the chapter (see
 * ChapterReader), not to each of 72 rows. What is left is the verse itself and
 * the one control that genuinely is per-verse: saving it.
 */
export function VerseCard({ verse, locale }: { verse: Verse; locale: Locale }) {
  const t = useTranslations('study');
  const tDisc = useTranslations('disclaimer');

  const translation = verse.translations[locale];
  const meta = verse.translation_meta[locale];

  return (
    <article
      id={`verse-${verse.verse}`}
      className="group scroll-mt-24 border-b border-white/[0.07] py-10 last:border-b-0"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="eyebrow">{t('verseLabel', { number: verse.verse })}</h2>
        {/* Present but recessive until the row is hovered or focused: the
            reader came to read, not to be offered an action on every verse. */}
        <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <BookmarkButton verseId={verse.id} />
        </div>
      </div>

      <p className="font-devanagari mt-5 whitespace-pre-line text-[1.35rem] leading-loose text-white/90">
        {verse.sanskrit}
      </p>

      <p className="font-iast mt-3 whitespace-pre-line text-[0.8rem] leading-relaxed text-white/35">
        {verse.transliteration}
      </p>

      {translation ? (
        <>
          <p className="font-serif-text mt-6 text-[1.0625rem] leading-[1.75] text-stone-200">
            {translation}
          </p>
          {/* Only `reviewed` text is shown bare. See lib/verses/confidence.ts. */}
          {caveatKey(meta?.status) && (
            <p className="mt-3 text-xs text-white/30">
              {tDisc(caveatKey(meta?.status) as 'placeholderData' | 'inReviewData')}
              {meta?.translator ? ` · ${meta.translator}` : ''}
            </p>
          )}
        </>
      ) : (
        <p className="mt-6 text-sm italic text-white/35">{t('translationMissing')}</p>
      )}

      {verse.word_meanings.length > 0 && (
        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {verse.word_meanings.map((wm, i) => (
            <div key={i} className="contents">
              <dt className="font-devanagari text-white/50">{wm.word}</dt>
              <dd className="text-white/75">{wm.meaning}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}
