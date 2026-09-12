'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { BookmarksProvider, BookmarkNotice } from '@/components/BookmarksProvider';
import { VerseCard } from '@/components/VerseCard';
import { localeMeta, locales, type Locale } from '@/i18n/locales';
import type { Chapter } from '@/lib/verses/types';

/**
 * A chapter, read.
 *
 * WHAT THIS REPLACED. Every verse used to carry its own language switcher and
 * its own "sign in to save" note. On chapter 2 that came to 216 buttons and the
 * same sentence 72 times — and two of the three languages had nothing to offer
 * but "this verse has not been translated yet", because only English is seeded.
 *
 * Controls that repeat once per row are not a feature, they are furniture. The
 * language choice is now made once for the chapter, and only appears when there
 * is actually more than one translation to choose between. When hu/hi are
 * seeded it will appear on its own.
 */
export function ChapterReader({
  chapter,
  defaultLocale,
}: {
  chapter: Chapter;
  defaultLocale: Locale;
}) {
  const t = useTranslations('study');

  // Which languages this chapter can actually show. Offering a language that
  // resolves to "not translated yet" on every verse is worse than offering
  // nothing: it looks like a broken feature rather than an honest gap.
  const available = useMemo(
    () =>
      locales.filter((l) =>
        chapter.verses.some((v) => (v.translations[l] ?? '').trim().length > 0)
      ),
    [chapter]
  );

  const [active, setActive] = useState<Locale>(
    available.includes(defaultLocale) ? defaultLocale : (available[0] ?? defaultLocale)
  );

  // The translator and licence actually in force for the selected language.
  const activeSource = useMemo(() => {
    const meta = chapter.verses
      .map((v) => v.translation_meta?.[active])
      .find((m) => m?.translator || m?.source);
    if (!meta) return null;
    return [meta.translator, meta.source, meta.license].filter(Boolean).join(' · ');
  }, [chapter, active]);

  return (
    <BookmarksProvider>
      {(available.length > 1 || true) && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <BookmarkNotice />

          {available.length > 1 && (
            <div className="flex items-center gap-1">
              <span className="me-2 text-xs text-white/40">{t('languageForVerse')}</span>
              {available.map((l) => (
                <button
                  key={l}
                  onClick={() => setActive(l)}
                  aria-pressed={active === l}
                  className={`rounded-md px-2.5 py-1 text-xs transition ${
                    active === l
                      ? 'bg-accent/20 text-accent'
                      : 'text-white/45 hover:bg-white/5 hover:text-white/80'
                  }`}
                >
                  {localeMeta[l].nativeLabel}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Whose translation the reader is actually looking at. Taken from the
          verses themselves rather than the chapter's `sources` block, because
          that block only ever described the English and so credited Annie
          Besant on a page showing Schmidt's Hungarian. */}
      {activeSource && (
        <p className="-mt-4 mb-8 text-xs leading-relaxed text-white/30">{activeSource}</p>
      )}

      <div>
        {chapter.verses.map((verse) => (
          <VerseCard key={verse.id} verse={verse} locale={active} />
        ))}
      </div>
    </BookmarksProvider>
  );
}
