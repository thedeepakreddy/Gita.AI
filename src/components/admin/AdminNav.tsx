'use client';

import { Link, usePathname } from '@/i18n/navigation';

const TABS = [
  { href: '/admin', label: 'Overview', minRole: 'reviewer' },
  { href: '/admin/review', label: 'Translation review', minRole: 'reviewer' },
  { href: '/admin/violations', label: 'Guard log', minRole: 'admin' },
  { href: '/admin/accounts', label: 'Accounts', minRole: 'admin' },
] as const;

export function AdminNav({ role, name }: { role: string; name: string }) {
  const pathname = usePathname();

  return (
    <header className="mb-10 border-b border-[#b99c73] pb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="manuscript-kicker">Administration</p>
          <h1 className="font-cormorant mt-3 text-[2.6rem] leading-none text-[#173d56]">
            Gita Counsel
          </h1>
        </div>
        <p className="font-literary text-[0.82rem] text-[#52616a]">
          {name} <span className="mx-1.5 text-[#ad9271]">/</span>
          <span className="text-[#925b37]">{role}</span>
        </p>
      </div>

      <nav className="mt-7 flex flex-wrap gap-x-7 gap-y-2">
        {TABS.filter((t) => t.minRole !== 'admin' || role === 'admin').map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`font-literary border-b-2 pb-1 text-[0.86rem] transition-colors ${
                active
                  ? 'border-[#ad865a] text-[#173d56]'
                  : 'border-transparent text-[#52616a] hover:text-[#173d56]'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
