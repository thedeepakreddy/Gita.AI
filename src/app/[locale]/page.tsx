import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Link } from '@/i18n/navigation';
import { isLocale, type Locale } from '@/i18n/locales';
import { getVerseOfTheDay } from '@/lib/verses/verseOfTheDay';

export const revalidate = 3600;

export default async function HomePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'home' });
  const tApp = await getTranslations({ locale, namespace: 'app' });
  const tDisc = await getTranslations({ locale, namespace: 'disclaimer' });

  const daily = await getVerseOfTheDay(locale as Locale).catch(() => null);

  return (
    <main className="flex-1 w-full overflow-y-auto px-4 py-12 sm:px-6">
      <div className="surface-glass mx-auto w-full max-w-2xl rounded-2xl px-7 py-12 sm:px-14 sm:py-16">
        <p className="eyebrow text-center">{tApp('name')}</p>

        {/*
          Serif, and a step down in weight and size. The previous 5xl bold sans
          read as a marketing headline; this is the opening line of a book about
          not being able to act, which is a quieter thing.
        */}
        <h1 className="font-serif-text mt-6 text-balance text-center text-[2rem] font-semibold leading-[1.15] text-white sm:text-[2.6rem]">
          {t('heading')}
        </h1>

        <p className="font-serif-text mx-auto mt-7 max-w-xl text-pretty text-center text-[1.0625rem] leading-[1.7] text-stone-300">
          {t('intro')}
        </p>

        <div className="mt-11 grid gap-3 sm:grid-cols-2">
          {[
            { href: '/study', title: t('studyCta'), blurb: t('studyBlurb') },
            { href: '/chat', title: t('chatCta'), blurb: t('chatBlurb') },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:border-accent/40 hover:bg-white/[0.07]"
            >
              <span className="font-serif-text block text-[1.0625rem] text-white transition-colors group-hover:text-accent">
                {card.title}
              </span>
              <span className="mt-1.5 block text-[0.8125rem] leading-relaxed text-white/50">
                {card.blurb}
              </span>
            </Link>
          ))}
        </div>

        {daily && (
          <section className="mt-12 border-t border-white/10 pt-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="eyebrow">{t('dailyHeading')}</h2>
              <Link
                href={`/study/${daily.verse.chapter}#verse-${daily.verse.verse}`}
                className="text-xs tabular-nums text-white/40 transition-colors hover:text-accent"
              >
                {daily.verse.chapter}.{daily.verse.verse}
              </Link>
            </div>

            <p className="font-devanagari mt-5 whitespace-pre-line text-[1.15rem] leading-loose text-white/85">
              {daily.verse.sanskrit}
            </p>

            <p className="font-serif-text mt-5 text-[1.0625rem] leading-[1.7] text-stone-200">
              {daily.text}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link
                href={`/study/${daily.verse.chapter}#verse-${daily.verse.verse}`}
                className="text-xs text-white/50 transition-colors hover:text-accent"
              >
                {t('dailyCta')} →
              </Link>
              {daily.confidence !== 'reviewed' && (
                <span className="text-xs text-white/25">
                  {tDisc(daily.confidence === 'in-review' ? 'inReviewData' : 'placeholderData')}
                </span>
              )}
            </div>
          </section>
        )}

        <p className="mt-12 border-t border-white/10 pt-6 text-center text-xs leading-relaxed text-white/35">
          {t('reverenceNote')}
        </p>
      </div>
    </main>
  );
}
