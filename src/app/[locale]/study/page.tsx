import Image from 'next/image';
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
  const tApp = await getTranslations({ locale, namespace: 'app' });
  const chapters = await getChapters();
  const verseTotal = chapters.reduce((n, c) => n + c.verses.length, 0);

  return (
    <main className="manuscript-page w-full flex-1 overflow-y-auto px-5 pb-16 pt-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1280px]">
        <header className="grid items-center gap-9 border-b border-[#b99c73] pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)] lg:gap-16">
          <div className="max-w-2xl">
            <p className="manuscript-kicker">{t('chapterCount', { count: chapters.length })} <span className="mx-2 text-[#ad9271]">/</span> {t('verseCount', { count: verseTotal })}</p>
            <h1 className="font-cormorant mt-5 text-[3.8rem] leading-[0.96] text-[#173d56] sm:text-[5rem]">{tApp('name')}</h1>
            <div className="mt-6 h-px w-20 bg-[#ad865a]" aria-hidden="true" />
            <p className="font-literary mt-6 max-w-[55ch] text-[0.9rem] leading-[1.9] text-[#52616a]">{tDisc('placeholderDataLong')}</p>
            <div className="mt-7"><ContinueReading /></div>
          </div>
          <div className="relative mx-auto hidden w-full max-w-[430px] border border-[#b99c73] bg-[#eadcc4] p-2.5 lg:me-0 lg:block">
            <div className="relative aspect-[1.7] overflow-hidden border border-[#a48359]">
              <Image src="/chat-wallpapers/mahabharata-peace.jpg" alt="" fill sizes="(max-width: 1024px) 90vw, 430px" className="object-cover object-center" />
            </div>
          </div>
        </header>

        <div className="flex items-center gap-4 py-7">
          <Image src="/manuscript/cutout-20-28de926f7874.png" alt="" width={25} height={25} />
          <p className="manuscript-kicker">{t('chapterCount', { count: chapters.length })}</p>
          <span className="h-px flex-1 bg-[#c5ac86]" aria-hidden="true" />
        </div>
        <ul className="grid border-t border-[#c5ac86] lg:grid-cols-2 lg:gap-x-12">
          {chapters.map((chapter) => (
            <li key={chapter.chapter}>
              <Link href={`/study/${chapter.chapter}`} className="group flex min-h-28 items-center gap-5 border-b border-[#c5ac86] px-1 py-5 transition-colors hover:bg-[#f1e7d5]/70 sm:gap-7">
                <span className="font-cormorant w-10 shrink-0 text-[2rem] tabular-nums text-[#9a704a]">{String(chapter.chapter).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-cormorant block text-[1.65rem] leading-tight text-[#173d56] transition-colors group-hover:text-[#9a6039]">{chapter.title[locale as Locale] ?? chapter.title.en}</span>
                  {chapter.titleSanskrit && <span className="font-devanagari mt-0.5 block text-xs text-[#67727a]">{chapter.titleSanskrit}</span>}
                  <span className="font-literary mt-1 block text-[0.7rem] text-[#786f62]">{t('verseCount', { count: chapter.verses.length })}</span>
                </span>
                <span aria-hidden="true" className="font-cormorant text-[1.4rem] text-[#9a704a] transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
