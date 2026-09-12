'use client';

import { useCallback, useEffect, useState } from 'react';

import { locales, localeMeta, type Locale } from '@/i18n/locales';

/**
 * The translation review workflow.
 *
 * One verse at a time, with the Sanskrit, the English reference and the text
 * as shipped all visible while editing. A reviewer working into Hungarian is
 * translating *something specific* — showing them only an empty box and a verse
 * number is how you get inconsistent renderings.
 *
 * Saving and approving are separate actions on purpose. "Reviewed" records a
 * name and a timestamp against the text, and that attribution should mean
 * somebody stood behind it rather than that somebody typed in the box.
 */

type ReviewVerse = {
  id: string;
  chapter: number;
  verse: number;
  sanskrit: string;
  transliteration: string;
  shipped: string | null;
  shippedMeta: { status?: string; translator?: string | null } | null;
  english: string | null;
  revision: {
    text: string;
    status: string;
    translator: string | null;
    source: string | null;
    license: string | null;
    note: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
  } | null;
};

type Overview = {
  locales: { locale: string; total: number; reviewed: number; inReview: number; placeholder: number }[];
  chapters: { chapter: number; title: Record<string, string>; verses: number }[];
};

const CARD = 'rounded-xl border border-white/10 bg-black/40 backdrop-blur-md';

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    reviewed: 'bg-emerald-900/60 text-emerald-300 border-emerald-500/30',
    'in-review': 'bg-accent/12 text-accent border-accent/25',
    placeholder: 'bg-white/10 text-white/50 border-white/20',
  };
  return (
    <span className={`rounded border px-2 py-0.5 text-xs ${styles[status] ?? styles.placeholder}`}>
      {status}
    </span>
  );
}

export function ReviewClient() {
  const [locale, setLocale] = useState<Locale>('hu');
  const [chapter, setChapter] = useState<number>(1);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [verses, setVerses] = useState<ReviewVerse[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [translator, setTranslator] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);

  const loadOverview = useCallback(async () => {
    const res = await fetch('/api/admin/review');
    if (res.ok) setOverview(await res.json());
  }, []);

  const loadChapter = useCallback(async () => {
    const res = await fetch(`/api/admin/review?locale=${locale}&chapter=${chapter}`);
    if (!res.ok) {
      setNotice({ tone: 'bad', text: `Could not load chapter ${chapter}.` });
      return;
    }
    const data = await res.json();
    setVerses(data.verses ?? []);
    setDrafts(
      Object.fromEntries(
        (data.verses ?? []).map((v: ReviewVerse) => [v.id, v.revision?.text ?? v.shipped ?? ''])
      )
    );
  }, [locale, chapter]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);
  useEffect(() => {
    void loadChapter();
  }, [loadChapter]);

  async function save(verse: ReviewVerse, status: 'in-review' | 'reviewed') {
    const text = (drafts[verse.id] ?? '').trim();
    if (!text) {
      setNotice({ tone: 'bad', text: 'Nothing to save — the translation is empty.' });
      return;
    }
    setBusy(verse.id);
    try {
      const res = await fetch('/api/admin/review', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verseId: verse.id,
          locale,
          text,
          status,
          translator: translator || undefined,
          source: source || undefined,
          license: translator ? undefined : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotice({ tone: 'bad', text: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setNotice({
        tone: 'ok',
        text: `${verse.chapter}.${verse.verse} ${status === 'reviewed' ? 'approved' : 'saved'}.`,
      });
      await Promise.all([loadChapter(), loadOverview()]);
    } finally {
      setBusy(null);
    }
  }

  async function revert(verse: ReviewVerse) {
    setBusy(verse.id);
    try {
      await fetch(`/api/admin/review?verseId=${encodeURIComponent(verse.id)}&locale=${locale}`, {
        method: 'DELETE',
      });
      setNotice({ tone: 'ok', text: `${verse.chapter}.${verse.verse} reverted to the shipped text.` });
      await Promise.all([loadChapter(), loadOverview()]);
    } finally {
      setBusy(null);
    }
  }

  const progress = overview?.locales.find((l) => l.locale === locale);
  const shown = onlyUnreviewed
    ? verses.filter((v) => v.revision?.status !== 'reviewed')
    : verses;

  return (
    <div className="space-y-5 pb-16">
      {/* Controls */}
      <section className={`${CARD} p-4`}>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-white/40">Language</span>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="mt-1 rounded border border-white/20 bg-black/40 px-2 py-1.5 text-white"
            >
              {locales.map((l) => (
                <option key={l} value={l}>
                  {localeMeta[l].label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-white/40">Chapter</span>
            <select
              value={chapter}
              onChange={(e) => setChapter(Number(e.target.value))}
              className="mt-1 max-w-xs rounded border border-white/20 bg-black/40 px-2 py-1.5 text-white"
            >
              {(overview?.chapters ?? []).map((c) => (
                <option key={c.chapter} value={c.chapter}>
                  {c.chapter}. {c.title?.en ?? ''} ({c.verses})
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 pb-1.5 text-sm text-white/70">
            <input
              type="checkbox"
              checked={onlyUnreviewed}
              onChange={(e) => setOnlyUnreviewed(e.target.checked)}
              className="accent-[hsl(45_86%_62%)]"
            />
            Only show what still needs review
          </label>

          {progress && (
            <p className="ms-auto pb-1.5 text-sm tabular-nums text-white/50">
              {progress.reviewed}/{progress.total} approved
            </p>
          )}
        </div>

        <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-white/40">
              Translator credit (applied to what you save)
            </span>
            <input
              value={translator}
              onChange={(e) => setTranslator(e.target.value)}
              placeholder="e.g. Bhaktivedanta Book Trust"
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-white placeholder-white/30"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-white/40">Source</span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Edition, permission reference…"
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-white placeholder-white/30"
            />
          </label>
        </div>
      </section>

      {notice && (
        <p
          className={`rounded px-3 py-2 text-sm ${
            notice.tone === 'ok'
              ? 'bg-emerald-950/50 text-emerald-300'
              : 'bg-red-950/50 text-red-300'
          }`}
        >
          {notice.text}
        </p>
      )}

      {shown.length === 0 && (
        <p className="text-sm text-white/50">
          {verses.length === 0 ? 'Loading…' : 'Every verse in this chapter is approved.'}
        </p>
      )}

      {shown.map((verse) => {
        const status = verse.revision?.status ?? verse.shippedMeta?.status ?? 'placeholder';
        const dirty = (drafts[verse.id] ?? '') !== (verse.revision?.text ?? verse.shipped ?? '');
        return (
          <article key={verse.id} className={`${CARD} p-5`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium text-accent">
                {verse.chapter}.{verse.verse}
              </h3>
              <div className="flex items-center gap-2">
                <StatusChip status={status} />
                {verse.revision?.reviewedBy && (
                  <span className="text-xs text-white/40">
                    approved by {verse.revision.reviewedBy}
                  </span>
                )}
              </div>
            </div>

            <p className="font-devanagari mt-3 whitespace-pre-line text-lg leading-loose text-white/90">
              {verse.sanskrit}
            </p>
            <p className="font-iast mt-1 whitespace-pre-line text-xs text-white/40">
              {verse.transliteration}
            </p>

            {locale !== 'en' && verse.english && (
              <div className="mt-4 rounded border border-white/10 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-wide text-white/40">English reference</p>
                <p className="mt-1 text-sm text-white/70">{verse.english}</p>
              </div>
            )}

            {verse.shipped && verse.revision && verse.shipped !== verse.revision.text && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-xs uppercase tracking-wide text-white/40">
                  Text as shipped (being replaced)
                </summary>
                <p className="mt-1 text-white/50">{verse.shipped}</p>
              </details>
            )}

            <label className="mt-4 block">
              <span className="text-xs uppercase tracking-wide text-white/40">
                {localeMeta[locale].label} translation
              </span>
              <textarea
                value={drafts[verse.id] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [verse.id]: e.target.value }))}
                rows={3}
                placeholder={`Translation into ${localeMeta[locale].label}…`}
                className="mt-1 w-full resize-y rounded border border-white/20 bg-black/40 px-3 py-2 text-white placeholder-white/30 focus:border-accent/50"
              />
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => save(verse, 'in-review')}
                disabled={busy === verse.id || !dirty}
                className="rounded border border-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-40"
              >
                Save draft
              </button>
              <button
                onClick={() => save(verse, 'reviewed')}
                disabled={busy === verse.id}
                className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600 disabled:opacity-40"
              >
                Approve
              </button>
              {verse.revision && (
                <button
                  onClick={() => revert(verse)}
                  disabled={busy === verse.id}
                  className="text-sm text-red-400 underline disabled:opacity-40"
                >
                  Revert to shipped text
                </button>
              )}
              {dirty && <span className="text-xs text-accent">unsaved</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
