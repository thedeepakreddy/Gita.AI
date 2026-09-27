import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Link } from '@/i18n/navigation';
import { isLocale, type Locale } from '@/i18n/locales';
import { getVerseOfTheDay } from '@/lib/verses/verseOfTheDay';

export const revalidate = 3600;

const ornament = '/manuscript/cutout-20-28de926f7874.png';

export default async function HomePage({ params: { locale } }: { params: { locale: string } }) {
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'home' });
  const tApp = await getTranslations({ locale, namespace: 'app' });
  const tStudy = await getTranslations({ locale, namespace: 'study' });
  const tDisc = await getTranslations({ locale, namespace: 'disclaimer' });
  const daily = await getVerseOfTheDay(locale as Locale).catch(() => null);

  return (
    <main className="manuscript-page relative w-full flex-1 overflow-y-auto">
      <div className="pointer-events-none absolute left-0 top-14 hidden w-20 xl:block" aria-hidden="true">
        <Image src="/manuscript/cutout-1-b954c79aa9d9.png" alt="" width={88} height={588} className="h-auto w-full" />
      </div>
      <div className="pointer-events-none absolute bottom-20 left-6 hidden w-14 xl:block" aria-hidden="true">
        <Image src="/manuscript/cutout-2-ab81ccaa223d.png" alt="" width={68} height={170} className="h-auto w-full" />
      </div>

      <div className="mx-auto max-w-[1370px] px-5 pb-14 pt-8 sm:px-8 lg:px-12 xl:px-16">
        <section className="grid items-center gap-9 lg:grid-cols-[46%_1fr] lg:gap-[6%]" aria-labelledby="home-title">
          <figure className="mx-auto w-full max-w-[560px]">
            <Image
              src="/manuscript/crop-3-aa09d5aa35ee.png"
              alt="Original miniature-inspired illustration of Krishna and Arjuna in their chariot"
              width={562}
              height={596}
              priority
              sizes="(max-width: 1024px) 90vw, 42vw"
              className="h-auto w-full"
            />
          </figure>

          <div className="max-w-[580px] pb-2 lg:ps-1">
            <div className="flex items-center gap-3">
              <span className="h-px w-10 bg-[#ad865a]" aria-hidden="true" />
              <p className="manuscript-kicker">{tApp('name')} <span className="mx-2 text-[#aa9578]">/</span> {tStudy('chapterCount', { count: 18 })}</p>
            </div>
            <h1 id="home-title" className="font-cormorant mt-7 max-w-[12ch] text-balance text-[3.4rem] leading-[0.98] tracking-[-0.025em] text-[#173d56] sm:text-[4.25rem] lg:text-[4.65rem]">
              {t('heading')}
            </h1>
            <div className="mt-7 flex items-center gap-2" aria-hidden="true">
              <Image src={ornament} alt="" width={27} height={27} />
              <span className="h-px w-20 bg-[#ad865a]" />
            </div>
            <p className="font-literary mt-6 max-w-[36rem] text-pretty text-[0.97rem] leading-[1.95] text-[#304956] sm:text-[1.08rem]">
              {t('intro')}
            </p>
            <nav className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3" aria-label={tApp('name')}>
              <Link href="/study" className="manuscript-text-link">{t('studyCta')} <span aria-hidden="true">→</span></Link>
              <span className="hidden h-9 w-px bg-[#c9b596] sm:block" aria-hidden="true" />
              <Link href="/chat" className="manuscript-text-link">{t('chatCta')} <span aria-hidden="true">→</span></Link>
            </nav>
          </div>
        </section>

        <div className="mt-9 h-px w-full bg-[#ba9c71]/65" aria-hidden="true" />

        <section className="grid gap-8 pt-7 lg:grid-cols-[1.22fr_0.72fr] lg:gap-10" aria-label={tApp('name')}>
          <div className="flex flex-col justify-between">
            <div className="grid gap-8 sm:grid-cols-2 sm:gap-0">
              <Link href="/study" className="group flex items-start gap-4 py-2 pe-6 sm:border-e sm:border-[#c7ae88]/70">
                <Image src="/manuscript/cutout-30-d5135e6d235c.png" alt="" width={27} height={28} className="mt-0.5 shrink-0" />
                <span>
                  <span className="manuscript-kicker block">01 / {tApp('name')}</span>
                  <span className="font-cormorant mt-3 block text-[1.8rem] leading-tight text-[#21425a] underline decoration-[#b18b5f]/70 underline-offset-[7px] transition-colors group-hover:text-[#9a6039]">{t('studyCta')} →</span>
                  <span className="font-literary mt-3 block max-w-64 text-[0.8rem] leading-[1.8] text-[#52616a]">{t('studyBlurb')}</span>
                </span>
              </Link>
              <Link href="/chat" className="group flex items-start gap-4 border-t border-[#c7ae88]/70 py-6 sm:border-t-0 sm:py-2 sm:ps-8">
                <Image src="/manuscript/cutout-36-471d44e40735.png" alt="" width={27} height={28} className="mt-0.5 shrink-0" />
                <span>
                  <span className="manuscript-kicker block">02 / {tApp('name')}</span>
                  <span className="font-cormorant mt-3 block text-[1.8rem] leading-tight text-[#21425a] underline decoration-[#b18b5f]/70 underline-offset-[7px] transition-colors group-hover:text-[#9a6039]">{t('chatCta')} →</span>
                  <span className="font-literary mt-3 block max-w-64 text-[0.8rem] leading-[1.8] text-[#52616a]">{t('chatBlurb')}</span>
                </span>
              </Link>
            </div>
            <p className="font-literary mt-10 flex items-start gap-3 border-t border-[#c7ae88]/70 pt-5 text-[0.72rem] italic leading-relaxed text-[#777269]">
              <Image src="/manuscript/cutout-48-d2708a62d8a4.png" alt="" width={26} height={27} className="shrink-0" />
              {t('reverenceNote')}
            </p>
          </div>

          {daily && (
            <aside className="relative border border-[#b39a77]/45 bg-[#e8dac0]/20 px-6 py-6 pe-10 sm:px-8" aria-labelledby="daily-heading">
              <Image src="/manuscript/cutout-29-d65c1e90e302.png" alt="" width={33} height={282} className="pointer-events-none absolute inset-y-0 end-0 h-full w-8 object-fill" />
              <div className="flex items-start justify-between gap-3">
                <h2 id="daily-heading" className="manuscript-kicker">{t('dailyHeading')}</h2>
                <span className="font-literary text-[0.7rem] text-[#52616a]">{daily.verse.chapter}.{daily.verse.verse}</span>
              </div>
              <p className="font-literary mt-4 text-[0.85rem] leading-[1.8] text-[#29475a]">{daily.text}</p>
              <div className="mt-5 h-px w-12 bg-[#ad865a]" aria-hidden="true" />
              <Link href={`/study/${daily.verse.chapter}#verse-${daily.verse.verse}`} className="manuscript-text-link mt-3 inline-block text-[0.8rem]">{t('dailyCta')} →</Link>
              {daily.confidence !== 'reviewed' && <p className="font-literary mt-2 text-[0.68rem] italic leading-relaxed text-[#7d796f]">{tDisc(daily.confidence === 'in-review' ? 'inReviewData' : 'placeholderData')}</p>}
            </aside>
          )}
        </section>
      </div>
    </main>
  );
}
