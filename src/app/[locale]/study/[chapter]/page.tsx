import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { ChapterReader } from '@/components/ChapterReader';
import { TrackProgress } from '@/components/TrackProgress';
import { Link } from '@/i18n/navigation';
import { isLocale, type Locale } from '@/i18n/locales';
import { getChapter, getChapters } from '@/lib/verses/store';

export async function generateStaticParams() {
  const chapters = await getChapters();
  return chapters.map((c) => ({ chapter: String(c.chapter) }));
}

export default async function ChapterPage({
  params: { locale, chapter },
}: {
  params: { locale: string; chapter: string };
}) {
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const chapterNumber = Number(chapter);
  if (!Number.isInteger(chapterNumber)) notFound();

  const doc = await getChapter('bhagavad-gita', chapterNumber);
  if (!doc) notFound();

  const t = await getTranslations({ locale, namespace: 'study' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  const all = await getChapters();
  const prev = all.find((c) => c.chapter === chapterNumber - 1);
  const next = all.find((c) => c.chapter === chapterNumber + 1);

  return (
    <main className="flex-1 w-full overflow-y-auto px-4 py-10 sm:px-6">
      {/* Reading happens on its own surface, not directly on the artwork —
          see the `.surface` note in globals.css. */}
      <div className="surface mx-auto max-w-2xl rounded-2xl px-6 py-10 sm:px-12 sm:py-14">
        <Link
          href="/study"
          className="text-xs text-white/40 transition-colors hover:text-accent"
        >
          ← {tCommon('back')}
        </Link>

        <header className="mt-6 border-b border-white/10 pb-8">
          <p className="eyebrow">{t('chapterLabel', { number: doc.chapter })}</p>
          <h1 className="font-serif-text mt-2 text-[1.75rem] font-semibold leading-tight text-white sm:text-[2rem]">
            {doc.title[locale as Locale] ?? doc.title.en}
          </h1>
          {doc.titleSanskrit && (
            <p className="font-devanagari mt-2 text-base text-white/45">{doc.titleSanskrit}</p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-white/35">
            {t('verseCount', { count: doc.verses.length })}
          </p>
        </header>

        <div className="mt-8">
          <ChapterReader chapter={doc} defaultLocale={locale as Locale} />
        </div>

        <TrackProgress chapter={chapterNumber} />

        <nav className="mt-12 flex items-start justify-between gap-6 border-t border-white/10 pt-8 text-sm">
          {prev ? (
            <Link
              href={`/study/${prev.chapter}`}
              className="group max-w-[45%] text-white/55 transition-colors hover:text-accent"
            >
              <span className="block text-xs text-white/30">← {prev.chapter}</span>
              <span className="block">{prev.title[locale as Locale] ?? prev.title.en}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/study/${next.chapter}`}
              className="group max-w-[45%] text-end text-white/55 transition-colors hover:text-accent"
            >
              <span className="block text-xs text-white/30">{next.chapter} →</span>
              <span className="block">{next.title[locale as Locale] ?? next.title.en}</span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </main>
  );
}
