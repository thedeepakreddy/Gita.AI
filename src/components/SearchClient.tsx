'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

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
    <main className="flex-1 w-full overflow-y-auto px-4 py-10 sm:px-6">
      <div className="surface mx-auto max-w-2xl rounded-2xl px-6 py-10 sm:px-12 sm:py-14">
        <h1 className="font-serif-text text-[1.75rem] font-semibold leading-tight text-white">
          {t('heading')}
        </h1>
        <p className="mt-3 max-w-xl text-[0.875rem] leading-relaxed text-white/45">{t('intro')}</p>

        <form onSubmit={run} className="mt-8 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('placeholder')}
            maxLength={500}
            className="flex-1 rounded-lg border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-[0.9375rem] text-white placeholder-white/30 transition-colors hover:border-white/20"
          />
          <button type="submit" disabled={busy || !query.trim()} className="btn btn-primary">
            {busy ? t('searching') : t('button')}
          </button>
        </form>

        {error && (
          <p className="mt-5 rounded-lg border border-red-500/20 bg-red-950/30 px-3.5 py-2.5 text-sm text-red-300/90">
            {error}
          </p>
        )}

        {results && !error && (
          <section className="mt-10 border-t border-white/10 pt-8">
            <h2 className="eyebrow">{t('resultsFor', { query: submitted })}</h2>

            {results.length === 0 ? (
              <p className="mt-5 text-sm text-white/50">{t('noResults')}</p>
            ) : (
              <ul className="mt-2">
                {results.map((r) => (
                  <li key={r.verseId} className="border-b border-white/[0.06] py-6 last:border-b-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link
                        href={`/study/${r.chapter}#verse-${r.verse}`}
                        className="text-sm tabular-nums text-accent transition-opacity hover:opacity-75"
                      >
                        {r.ref}
                      </Link>
                      <span className="text-xs tabular-nums text-white/25">
                        {t('relevance')} {r.score.toFixed(2)}
                        {r.matchedLocale !== locale && ` · ${r.matchedLocale}`}
                      </span>
                    </div>

                    <p className="font-serif-text mt-3 text-[1.0625rem] leading-[1.7] text-stone-200">
                      {r.text}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <Link
                        href={`/study/${r.chapter}#verse-${r.verse}`}
                        className="text-xs text-white/40 transition-colors hover:text-accent"
                      >
                        {t('openChapter')} →
                      </Link>
                      {r.status !== 'reviewed' && (
                        <span className="text-xs text-white/25">
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
