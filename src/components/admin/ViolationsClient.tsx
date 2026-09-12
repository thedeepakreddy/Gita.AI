'use client';

import { useEffect, useState } from 'react';

/**
 * The voice-guard log.
 *
 * Reads as evidence, not as an error list: the headline is the RATE, because
 * "four refusals" is meaningless without "out of how many replies". A temple
 * asking whether this machine puts words in Krishna's mouth deserves a number
 * and the transcripts behind it, not a reassurance.
 */

type Violation = {
  id: string;
  provider: string;
  locale: string;
  pattern: string;
  matched: string;
  question: string;
  reply: string;
  createdAt: string;
};

type Payload = {
  violations: Violation[];
  summary: {
    total: number;
    last30Days: number;
    repliesGenerated: number;
    ratePerThousand: number;
    byPattern: { pattern: string; count: number }[];
  };
};

const CARD = 'rounded-xl border border-white/10 bg-black/40 backdrop-blur-md';

export function ViolationsClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/violations')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-red-300">Could not load: {error}</p>;
  if (!data) return <p className="text-sm text-white/50">Loading…</p>;

  const { summary, violations } = data;

  return (
    <div className="space-y-6 pb-16">
      <section className={`${CARD} p-5`}>
        <h2 className="text-lg font-medium text-white">
          The guard has fired {summary.total} time{summary.total === 1 ? '' : 's'}
        </h2>
        <p className="mt-1 text-sm text-white/50">
          Each of these replies spoke in Krishna&rsquo;s own voice and was refused. None was
          shown to the person who asked, and none was saved to a conversation.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/40">Rate</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
              {summary.ratePerThousand}
            </p>
            <p className="text-xs text-white/40">per 1,000 replies</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-white/40">Last 30 days</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
              {summary.last30Days}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-white/40">Replies generated</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
              {summary.repliesGenerated}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-white/40">Delivered clean</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-400">
              {summary.repliesGenerated - summary.total}
            </p>
          </div>
        </div>
      </section>

      {summary.byPattern.length > 0 && (
        <section className={`${CARD} p-5`}>
          <h3 className="font-medium text-white">Which rule caught it</h3>
          <p className="mt-1 text-sm text-white/50">
            A pattern that fires far more than the others is either a real drift worth
            tightening the prompt against, or a rule that is too broad and is catching
            legitimate third-person writing. Read the transcripts before deciding which.
          </p>
          <ul className="mt-4 space-y-1.5 text-sm">
            {summary.byPattern.map((p) => (
              <li key={p.pattern} className="flex items-baseline justify-between gap-4">
                <code className="truncate text-xs text-white/60" title={p.pattern}>
                  {p.pattern}
                </code>
                <span className="tabular-nums text-accent">{p.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${CARD} p-5`}>
        <h3 className="font-medium text-white">Transcripts</h3>
        {violations.length === 0 ? (
          <p className="mt-2 text-sm text-white/50">
            Nothing logged. The guard has never had to refuse a reply.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10">
            {violations.map((v) => (
              <li key={v.id} className="py-3">
                <button
                  onClick={() => setOpen(open === v.id ? null : v.id)}
                  className="flex w-full items-baseline justify-between gap-3 text-start"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white/80">
                      &ldquo;{v.matched}&rdquo;
                    </span>
                    <span className="block truncate text-xs text-white/40">{v.question}</span>
                  </span>
                  <span className="shrink-0 text-xs text-white/40">
                    {v.provider} · {v.locale} · {new Date(v.createdAt).toLocaleString()}
                  </span>
                </button>

                {open === v.id && (
                  <div className="mt-3 space-y-3 rounded bg-black/40 p-3 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-white/40">Asked</p>
                      <p className="mt-1 whitespace-pre-wrap text-white/70">{v.question}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-white/40">
                        Refused reply (never shown)
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-white/70">{v.reply}</p>
                    </div>
                    <p className="text-xs text-white/40">
                      Matched <code className="text-accent">{v.pattern}</code>
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
