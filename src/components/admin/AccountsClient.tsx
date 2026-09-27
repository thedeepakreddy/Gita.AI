'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * Who has signed up.
 *
 * This is a list of real people's email addresses, so it is admin-only and
 * server-gated — a client-side check would ship the page to everyone and hope.
 * It shows what an operator actually needs: how many accounts exist, who they
 * are, and which of them ever did anything.
 */

type Account = {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  lockedByEnv: boolean;
  createdAt: string;
  conversations: number;
  hasOwnKey: boolean;
  trialMessagesUsed: number;
};

type Payload = {
  summary: {
    total: number;
    joinedLast30Days: number;
    withOwnKey: number;
    neverUsed: number;
    listed: number;
  };
  accounts: Account[];
};

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="border-s border-[#c5ac86] ps-5 first:border-s-0 first:ps-0">
      <p className="manuscript-kicker">{label}</p>
      <p className="font-cormorant mt-2 text-[2.4rem] leading-none text-[#173d56]">{value}</p>
      {hint && <p className="font-literary mt-1 text-[0.72rem] text-[#7c8891]">{hint}</p>}
    </div>
  );
}

export function AccountsClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/admin/accounts')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.accounts;
    return data.accounts.filter(
      (a) => a.email?.toLowerCase().includes(q) || a.name?.toLowerCase().includes(q)
    );
  }, [data, query]);

  if (error) {
    return <p className="font-literary text-[0.9rem] text-[#9b3a2f]">Could not load: {error}</p>;
  }
  if (!data) return <p className="font-literary text-[0.9rem] text-[#52616a]">Loading…</p>;

  const { summary } = data;

  return (
    <div className="pb-12">
      <section className="grid grid-cols-2 gap-6 border-b border-[#c5ac86] pb-9 sm:grid-cols-4">
        <Stat label="Accounts" value={summary.total} />
        <Stat label="New" value={summary.joinedLast30Days} hint="last 30 days" />
        <Stat
          label="Own key"
          value={summary.withOwnKey}
          hint={summary.total ? `${Math.round((summary.withOwnKey / summary.total) * 100)}% of accounts` : undefined}
        />
        <Stat label="Never used" value={summary.neverUsed} hint="signed in, never asked" />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4 py-7">
        <p className="manuscript-kicker">
          {shown.length === summary.total
            ? `All ${summary.total} accounts`
            : `${shown.length} of ${summary.total}`}
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by email or name…"
          className="font-literary w-full max-w-xs border-b border-[#c5ac86] bg-transparent pb-1.5 text-[0.86rem] text-[#173d56] placeholder-[#a09280] focus:border-[#ad865a] focus:outline-none sm:w-64"
        />
      </div>

      {shown.length === 0 ? (
        <p className="font-literary text-[0.9rem] text-[#52616a]">No account matches that.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-y border-[#c5ac86]">
                {['Email', 'Name', 'Role', 'Joined', 'Conversations', 'Key'].map((h, i) => (
                  <th
                    key={h}
                    className={`manuscript-kicker py-3 ${i > 2 ? 'text-end' : 'text-start'}`}
                    scope="col"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} className="border-b border-[#ddd0b6] align-baseline">
                  <td className="py-3.5 pe-4">
                    <span className="font-literary text-[0.88rem] text-[#173d56]">
                      {a.email ?? <span className="text-[#a09280]">no address</span>}
                    </span>
                  </td>
                  <td className="py-3.5 pe-4 font-literary text-[0.84rem] text-[#52616a]">
                    {a.name ?? '—'}
                  </td>
                  <td className="py-3.5 pe-4">
                    {a.role === 'user' ? (
                      <span className="font-literary text-[0.8rem] text-[#7c8891]">user</span>
                    ) : (
                      <span className="font-literary text-[0.8rem] text-[#925b37]">
                        {a.role}
                        {a.lockedByEnv && (
                          <span
                            className="ms-1.5 text-[#a09280]"
                            title="Set by ADMIN_EMAILS — the role column cannot change this"
                          >
                            ·env
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 ps-4 text-end font-literary text-[0.8rem] tabular-nums text-[#52616a]">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3.5 ps-4 text-end font-literary text-[0.84rem] tabular-nums">
                    {a.conversations === 0 ? (
                      <span className="text-[#a09280]">—</span>
                    ) : (
                      <span className="text-[#173d56]">{a.conversations}</span>
                    )}
                  </td>
                  <td className="py-3.5 ps-4 text-end font-literary text-[0.8rem] text-[#52616a]">
                    {a.hasOwnKey ? (
                      'own'
                    ) : a.trialMessagesUsed > 0 ? (
                      <span title={`${a.trialMessagesUsed} trial messages used`}>trial</span>
                    ) : (
                      <span className="text-[#a09280]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary.listed < summary.total && (
        <p className="font-literary mt-6 text-[0.78rem] text-[#7c8891]">
          Showing the {summary.listed} most recent of {summary.total}.
        </p>
      )}

      <p className="font-literary mt-8 border-t border-[#c5ac86] pt-5 text-[0.76rem] leading-relaxed text-[#7c8891]">
        These are real addresses belonging to real people. The page is admin-only and gated on the
        server. If this application is handed on, whoever takes custody of it takes custody of this
        list too.
      </p>
    </div>
  );
}
