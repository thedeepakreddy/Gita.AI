'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/locales';

/**
 * Public verse search.
 *
 * No sign-in and no AI key: this is the corpus answering for itself. It is the
 * most useful thing the app can do for someone who has not decided whether to
 * trust it with a question yet.
 */

type Result = {
  verseId: string;
  ref: string;
  chapter: number;
  verse: number;
  score: number;
  text: string;
  matchedLocale: string;
  status: string;
};

export function SearchClient({ locale }: { locale: Locale }) {
  const t = useTranslations('search');
  const tDisc = useTranslations('disclaimer');
  const tApp = useTranslations('app');

  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || busy) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&k=8&locale=${locale}`
      );
      if (res.status === 429) {
        setError(t('rateLimited'));
        return;
      }
      if (!res.ok) {
        setError(t('error'));
        return;
      }
      const data = await res.json();
      setResults(data.results ?? []);
      setSubmitted(q);
    } catch {
      setError(t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="manuscript-page w-full flex-1 overflow-y-auto px-5 pb-16 pt-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1230px]">
        <div className="grid items-center gap-10 border-b border-[#b99c73] pb-7 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-16 lg:pb-10">
          <div className="max-w-2xl">
            <p className="manuscript-kicker">{tApp('name')} <span className="mx-2 text-[#ad9271]">/</span> {t('button')}</p>
            <h1 className="font-cormorant mt-5 text-[3.1rem] leading-[0.98] text-[#173d56] sm:text-[4.8rem]">{t('heading')}</h1>
            <div className="mt-6 h-px w-20 bg-[#ad865a]" aria-hidden="true" />
            <p className="font-literary mt-6 max-w-[55ch] text-[0.9rem] leading-[1.8] text-[#52616a] sm:text-[0.95rem] sm:leading-[1.9]">{t('intro')}</p>
          </div>
          <div className="relative mx-auto hidden w-full max-w-[380px] border border-[#b99c73] bg-[#eadcc4] p-2.5 lg:me-0 lg:block">
            <div className="relative aspect-[1.75] overflow-hidden border border-[#a48359]">
              <Image src="/chat-wallpapers/mahabharata-lake.jpg" alt="" fill sizes="(max-width: 1024px) 90vw, 380px" className="object-cover" />
            </div>
          </div>
        </div>

        <form onSubmit={run} className="mt-7 flex max-w-[840px] flex-col gap-3 sm:mt-10 sm:flex-row sm:items-end sm:gap-5">
          <label htmlFor="verse-search" className="sr-only">{t('heading')}</label>
          <input
            id="verse-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('placeholder')}
            maxLength={500}
            className="font-literary min-w-0 flex-1 border-0 border-b border-[#a99072] bg-transparent px-0 py-3 text-[0.95rem] text-[#173d56] placeholder:text-[#837c70] transition-colors hover:border-[#173d56] focus:border-[#173d56]"
          />
          <button type="submit" disabled={busy || !query.trim()} className="font-literary self-start border-b border-[#a99072] py-3 text-[0.85rem] text-[#173d56] transition-colors hover:border-[#173d56] hover:text-[#9a6039] disabled:cursor-not-allowed disabled:opacity-40 sm:self-auto">
            {busy ? t('searching') : t('button')} <span aria-hidden="true">→</span>
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-5 max-w-[840px] border-s-2 border-[#ad6a54] bg-[#f5e9dd] px-4 py-3 text-sm text-[#703a2d]">
            {error}
          </p>
        )}

        {results && !error && (
          <section className="mt-12 max-w-[940px] border-t border-[#b99c73] pt-7" aria-live="polite">
            <h2 className="manuscript-kicker">{t('resultsFor', { query: submitted })}</h2>

            {results.length === 0 ? (
              <p className="font-literary mt-5 text-sm leading-relaxed text-[#52616a]">{t('noResults')}</p>
            ) : (
              <ul className="mt-2">
                {results.map((r) => (
                  <li key={r.verseId} className="border-b border-[#c5ac86] py-7 last:border-b-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link
                        href={`/study/${r.chapter}#verse-${r.verse}`}
                        className="manuscript-kicker tabular-nums transition-opacity hover:opacity-75"
                      >
                        {r.ref}
                      </Link>
                      <span className="font-literary text-[0.68rem] tabular-nums text-[#7b776f]">
                        {t('relevance')} {r.score.toFixed(2)}
                        {r.matchedLocale !== locale && ` · ${r.matchedLocale}`}
                      </span>
                    </div>

                    <p className="font-literary mt-4 max-w-[70ch] text-[1rem] leading-[1.85] text-[#2d4756]">
                      {r.text}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <Link
                        href={`/study/${r.chapter}#verse-${r.verse}`}
                        className="font-literary text-xs text-[#67727a] underline decoration-[#b99c73] underline-offset-4 transition-colors hover:text-[#9a6039]"
                      >
                        {t('openChapter')} →
                      </Link>
                      {r.status !== 'reviewed' && (
                        <span className="font-literary text-[0.68rem] text-[#78766d]">
                          {tDisc(r.status === 'in-review' ? 'inReviewData' : 'placeholderData')}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
