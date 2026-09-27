import Image from 'next/image';
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
    <main className="manuscript-page flex-1 w-full overflow-y-auto px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl overflow-hidden border border-[#c5ac86] bg-[#fffdf8]">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="px-6 py-10 sm:px-12 sm:py-14">
        <Link
          href="/study"
          className="text-xs text-[#858c80] transition-colors hover:text-accent"
        >
          ← {tCommon('back')}
        </Link>

        <header className="mt-6 border-b border-[#dfd4c2] pb-8">
          <p className="eyebrow">{t('chapterLabel', { number: doc.chapter })}</p>
          <h1 className="font-cormorant mt-2 text-[2.4rem] leading-[1.1] text-[#173d56] sm:text-[3rem]">
            {doc.title[locale as Locale] ?? doc.title.en}
          </h1>
          {doc.titleSanskrit && (
            <p className="font-devanagari mt-2 text-base text-[#858c80]">{doc.titleSanskrit}</p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-[#858c80]">
            {t('verseCount', { count: doc.verses.length })}
          </p>
        </header>

        <div className="mt-8">
          <ChapterReader chapter={doc} defaultLocale={locale as Locale} />
        </div>

        <TrackProgress chapter={chapterNumber} />

        <nav className="mt-12 flex items-start justify-between gap-6 border-t border-[#dfd4c2] pt-8 text-sm">
          {prev ? (
            <Link
              href={`/study/${prev.chapter}`}
              className="group max-w-[45%] text-[#68766c] transition-colors hover:text-accent"
            >
              <span className="block text-xs text-[#858c80]">← {prev.chapter}</span>
              <span className="block">{prev.title[locale as Locale] ?? prev.title.en}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/study/${next.chapter}`}
              className="group max-w-[45%] text-end text-[#68766c] transition-colors hover:text-accent"
            >
              <span className="block text-xs text-[#858c80]">{next.chapter} →</span>
              <span className="block">{next.title[locale as Locale] ?? next.title.en}</span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
        </div>
        <aside className="hidden border-s border-[#c5ac86] bg-[#eee3d0] p-5 lg:block">
          <div className="sticky top-6">
            <div className="relative h-72 overflow-hidden border-[8px] border-[#173d56]">
              <Image src="/chat-wallpapers/mahabharata-chariot.jpg" alt="" fill sizes="272px" className="object-cover object-right" />
            </div>
            <p className="eyebrow mt-5">Bhagavad Gita · {doc.chapter}</p>
            <p className="font-literary mt-2 text-xs leading-relaxed text-[#52616a]">{doc.title[locale as Locale] ?? doc.title.en}</p>
          </div>
        </aside>
        </div>
      </div>
    </main>
  );
}
