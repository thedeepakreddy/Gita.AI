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

type Citation = {
  id: string;
  provider: string;
  locale: string;
  cited: string[];
  supplied: string[];
  afterRetry: boolean;
  question: string;
  reply: string;
  createdAt: string;
};

type Payload = {
  violations: Violation[];
  citations: Citation[];
  citationSummary: {
    total: number;
    last30Days: number;
    afterRetry: number;
    ratePerThousand: number;
  };
  summary: {
    total: number;
    last30Days: number;
    repliesGenerated: number;
    ratePerThousand: number;
    byPattern: { pattern: string; count: number }[];
  };
};

const CARD = 'border border-[#c5ac86] bg-[#fbf6ec]';

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

  if (error) return <p className="text-sm text-[#9b3a2f]">Could not load: {error}</p>;
  if (!data) return <p className="text-sm text-[#6b7780]">Loading…</p>;

  const { summary, violations } = data;

  return (
    <div className="space-y-6 pb-16">
      <section className={`${CARD} p-5`}>
        <h2 className="text-lg font-medium text-[#173d56]">
          The guard has fired {summary.total} time{summary.total === 1 ? '' : 's'}
        </h2>
        <p className="mt-1 text-sm text-[#6b7780]">
          Each of these replies spoke in Krishna&rsquo;s own voice and was refused. None was
          shown to the person who asked, and none was saved to a conversation.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#7c8891]">Rate</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[#173d56]">
              {summary.ratePerThousand}
            </p>
            <p className="text-xs text-[#7c8891]">per 1,000 replies</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[#7c8891]">Last 30 days</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[#173d56]">
              {summary.last30Days}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[#7c8891]">Replies generated</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[#173d56]">
              {summary.repliesGenerated}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[#7c8891]">Delivered clean</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[#3f6b4f]">
              {summary.repliesGenerated - summary.total}
            </p>
          </div>
        </div>
      </section>

      {summary.byPattern.length > 0 && (
        <section className={`${CARD} p-5`}>
          <h3 className="font-medium text-[#173d56]">Which rule caught it</h3>
          <p className="mt-1 text-sm text-[#6b7780]">
            A pattern that fires far more than the others is either a real drift worth
            tightening the prompt against, or a rule that is too broad and is catching
            legitimate third-person writing. Read the transcripts before deciding which.
          </p>
          <ul className="mt-4 space-y-1.5 text-sm">
            {summary.byPattern.map((p) => (
              <li key={p.pattern} className="flex items-baseline justify-between gap-4">
                <code className="truncate text-xs text-[#52616a]" title={p.pattern}>
                  {p.pattern}
                </code>
                <span className="tabular-nums text-[#925b37]">{p.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The grounding guard, beside the voice guard. Both answer the same
          shape of question, and a temple will ask both. */}
      <section className={`${CARD} p-5`}>
        <h2 className="text-lg font-medium text-[#173d56]">
          Invented citations: {data.citationSummary.total}
        </h2>
        <p className="mt-1 text-sm text-[#6b7780]">
          Replies that cited a verse never supplied to the model. Each was given one chance to
          correct itself and refused when it did not. None was shown or saved.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#7c8891]">Rate</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[#173d56]">
              {data.citationSummary.ratePerThousand}
            </p>
            <p className="text-xs text-[#7c8891]">per 1,000 replies</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[#7c8891]">Last 30 days</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[#173d56]">
              {data.citationSummary.last30Days}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[#7c8891]">Survived a correction</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[#173d56]">
              {data.citationSummary.afterRetry}
            </p>
            <p className="text-xs text-[#7c8891]">retry did not help</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-[#7c8891]">Corrected quietly</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[#3f6b4f]">
              {Math.max(0, data.citationSummary.total - data.citationSummary.afterRetry)}
            </p>
          </div>
        </div>

        {data.citations.length === 0 ? (
          <p className="mt-5 text-sm text-[#6b7780]">
            Nothing logged. No reply has cited a verse it was not given.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-[#ddd0b6] border-t border-[#ddd0b6]">
            {data.citations.map((c) => (
              <li key={c.id} className="py-3">
                <button
                  onClick={() => setOpen(open === c.id ? null : c.id)}
                  className="flex w-full items-baseline justify-between gap-3 text-start"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-[#2c4a5e]">
                      cited {c.cited.join(', ')}
                      <span className="text-[#7c8891]"> · supplied {c.supplied.join(', ') || 'none'}</span>
                    </span>
                    <span className="block truncate text-xs text-[#7c8891]">{c.question}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[#7c8891]">
                    {c.afterRetry && <span className="me-2 text-[#9b3a2f]">after retry</span>}
                    {c.provider} · {new Date(c.createdAt).toLocaleString()}
                  </span>
                </button>

                {open === c.id && (
                  <div className="mt-3 space-y-3 bg-[#f4ecda] p-3 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[#7c8891]">Asked</p>
                      <p className="mt-1 whitespace-pre-wrap text-[#2c4a5e]">{c.question}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[#7c8891]">
                        Refused reply (never shown)
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-[#2c4a5e]">{c.reply}</p>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${CARD} p-5`}>
        <h3 className="font-medium text-[#173d56]">Transcripts</h3>
        {violations.length === 0 ? (
          <p className="mt-2 text-sm text-[#6b7780]">
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
                    <span className="block truncate text-sm text-[#2c4a5e]">
                      &ldquo;{v.matched}&rdquo;
                    </span>
                    <span className="block truncate text-xs text-[#7c8891]">{v.question}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[#7c8891]">
                    {v.provider} · {v.locale} · {new Date(v.createdAt).toLocaleString()}
                  </span>
                </button>

                {open === v.id && (
                  <div className="mt-3 space-y-3 rounded bg-[#f4ecda] p-3 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[#7c8891]">Asked</p>
                      <p className="mt-1 whitespace-pre-wrap text-[#52616a]">{v.question}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[#7c8891]">
                        Refused reply (never shown)
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-[#52616a]">{v.reply}</p>
                    </div>
                    <p className="text-xs text-[#7c8891]">
                      Matched <code className="text-[#925b37]">{v.pattern}</code>
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
