import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { ContinueReading } from '@/components/ContinueReading';
import { Link } from '@/i18n/navigation';
import { isLocale, type Locale } from '@/i18n/locales';
import { getChapters } from '@/lib/verses/store';

export default async function StudyIndex({
  params: { locale },
}: {
  params: { locale: string };
}) {
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const tDisc = await getTranslations({ locale, namespace: 'disclaimer' });
  const t = await getTranslations({ locale, namespace: 'study' });
  const chapters = await getChapters();
  const verseTotal = chapters.reduce((n, c) => n + c.verses.length, 0);

  return (
    <main className="flex-1 w-full overflow-y-auto px-4 py-10 sm:px-6">
      <div className="surface mx-auto max-w-2xl rounded-2xl px-6 py-10 sm:px-12 sm:py-14">
        <header className="border-b border-white/10 pb-8">
          <h1 className="font-serif-text text-[2rem] font-semibold leading-tight text-white">
            Bhagavad Gita
          </h1>
          <p className="mt-2 text-sm text-white/40">
            {t('chapterCount', { count: chapters.length })} ·{' '}
            {t('verseCount', { count: verseTotal })}
          </p>

          <div className="mt-6">
            <ContinueReading />
          </div>
        </header>

        <ul className="mt-2">
          {chapters.map((chapter) => (
            <li key={chapter.chapter}>
              <Link
                href={`/study/${chapter.chapter}`}
                className="group flex items-baseline gap-5 border-b border-white/[0.06] py-5 transition-colors last:border-b-0"
              >
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-white/25 transition-colors group-hover:text-accent">
                  {chapter.chapter}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-serif-text block text-[1.0625rem] leading-snug text-white/90 transition-colors group-hover:text-accent">
                    {chapter.title[locale as Locale] ?? chapter.title.en}
                  </span>
                  {chapter.titleSanskrit && (
                    <span className="font-devanagari mt-0.5 block text-sm text-white/35">
                      {chapter.titleSanskrit}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-white/25">
                  {chapter.verses.length}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/* Quiet. This was a filled amber-bordered box competing with the
            chapter list for attention; it is a caveat, not a warning. */}
        <p className="mt-10 border-t border-white/10 pt-6 text-xs leading-relaxed text-white/35">
          {tDisc('placeholderDataLong')}
        </p>
      </div>
    </main>
  );
}
