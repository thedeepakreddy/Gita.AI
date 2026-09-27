'use client';

import { useEffect, useState } from 'react';

import { Link } from '@/i18n/navigation';

type LocaleProgress = {
  locale: string;
  total: number;
  reviewed: number;
  inReview: number;
  placeholder: number;
};

type Stats = {
  corpus: { chapters: number; verses: number };
  usage: { users: number; conversations: number; repliesGenerated: number };
  trial: {
    configured: boolean;
    perAccountLimit: number;
    spentToday: number;
    spentAllTime: number;
    dailyCap: number;
  };
  voiceGuard: { violations: number };
  translation: LocaleProgress[];
  retrieval: Record<string, unknown>;
  reviewers: { id: string; name: string | null; email: string | null; role: string }[];
};

const CARD = 'rounded-xl border border-[#c5ac86] bg-[#f4ecda] p-5 ';

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-[#7c8891]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[#173d56]">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-[#7c8891]">{hint}</p>}
    </div>
  );
}

function ProgressBar({ p }: { p: LocaleProgress }) {
  const pct = (n: number) => (p.total ? (n / p.total) * 100 : 0);
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium uppercase text-[#173d56]">{p.locale}</span>
        <span className="tabular-nums text-[#6b7780]">
          {p.reviewed} reviewed · {p.inReview} in review · {p.placeholder} placeholder
        </span>
      </div>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded bg-[#eadcc4]">
        <div className="bg-[#5b8a67]" style={{ width: `${pct(p.reviewed)}%` }} />
        <div className="bg-accent" style={{ width: `${pct(p.inReview)}%` }} />
      </div>
    </div>
  );
}

export function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/stats')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-[#9b3a2f]">Could not load: {error}</p>;
  if (!stats) return <p className="text-sm text-[#6b7780]">Loading…</p>;

  const trialPct = stats.trial.dailyCap
    ? Math.round((stats.trial.spentToday / stats.trial.dailyCap) * 100)
    : 0;

  return (
    <div className="space-y-6 pb-12">
      <section className={CARD}>
        <h2 className="text-lg font-medium text-[#173d56]">Translation review</h2>
        <p className="mt-1 text-sm text-[#6b7780]">
          Everything shipped is a public-domain placeholder until a reviewer approves it.
          This is the number that decides whether the application is ready to be given away.
        </p>
        <div className="mt-5 space-y-4">
          {stats.translation.map((p) => (
            <ProgressBar key={p.locale} p={p} />
          ))}
        </div>
        <Link
          href="/admin/review"
          className="mt-5 inline-block rounded bg-[#f1e7d5] px-3 py-1.5 text-sm text-[#173d56] hover:bg-[#eadcc4]"
        >
          Open the review queue
        </Link>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className={CARD}>
          <h2 className="text-lg font-medium text-[#173d56]">Use</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Stat label="Accounts" value={stats.usage.users} />
            <Stat label="Conversations" value={stats.usage.conversations} />
            <Stat label="Replies given" value={stats.usage.repliesGenerated} />
            <Stat
              label="Corpus"
              value={stats.corpus.verses}
              hint={`${stats.corpus.chapters} chapters`}
            />
          </div>
        </section>

        <section className={CARD}>
          <h2 className="text-lg font-medium text-[#173d56]">Voice guard</h2>
          <p className="mt-1 text-sm text-[#6b7780]">
            Replies refused for speaking in Krishna&rsquo;s own voice. Nothing was shown
            or saved.
          </p>
          <div className="mt-4">
            <Stat
              label="Refused, all time"
              value={stats.voiceGuard.violations}
              hint={
                stats.voiceGuard.violations === 0
                  ? 'The guard has never had to fire.'
                  : undefined
              }
            />
          </div>
          <Link
            href="/admin/violations"
            className="mt-4 inline-block text-sm text-[#925b37] underline"
          >
            Read the log
          </Link>
        </section>

        <section className={CARD}>
          <h2 className="text-lg font-medium text-[#173d56]">Trial spend</h2>
          {stats.trial.configured ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Stat
                  label="Today"
                  value={`${stats.trial.spentToday} / ${stats.trial.dailyCap}`}
                  hint={`${trialPct}% of the daily cap`}
                />
                <Stat label="All time" value={stats.trial.spentAllTime} />
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded bg-[#eadcc4]">
                <div
                  className={trialPct > 80 ? 'h-full bg-[#b4564a]' : 'h-full bg-[#5b8a67]'}
                  style={{ width: `${Math.min(100, trialPct)}%` }}
                />
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-[#52616a]">
              The trial is switched off (no <code className="text-[#925b37]">TRIAL_API_KEY</code>).
              Everyone brings their own provider key.
            </p>
          )}
        </section>

        <section className={CARD}>
          <h2 className="text-lg font-medium text-[#173d56]">Retrieval</h2>
          <dl className="mt-4 space-y-1 text-sm">
            {Object.entries(stats.retrieval).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-[#7c8891]">{k}</dt>
                <dd className="truncate text-[#2c4a5e]" title={String(v)}>
                  {String(v)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-[#7c8891]">
            Run <code className="text-[#925b37]">npm run embed:verify</code> after changing
            any of this.
          </p>
        </section>
      </div>

      <section className={CARD}>
        <h2 className="text-lg font-medium text-[#173d56]">Reviewers</h2>
        {stats.reviewers.length === 0 ? (
          <p className="mt-2 text-sm text-[#6b7780]">Nobody appointed yet.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {stats.reviewers.map((r) => (
              <li key={r.id} className="flex justify-between gap-4">
                <span className="text-[#2c4a5e]">{r.name ?? r.email}</span>
                <span className="text-[#925b37]">{r.role}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-[#7c8891]">
          Appoint someone by setting their role — they must have signed in once first.
          Addresses in <code className="text-[#925b37]">ADMIN_EMAILS</code> are always admin.
        </p>
      </section>
    </div>
  );
}
