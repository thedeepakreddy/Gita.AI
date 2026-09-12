'use client';

import { Link, usePathname } from '@/i18n/navigation';

const TABS = [
  { href: '/admin', label: 'Overview', minRole: 'reviewer' },
  { href: '/admin/review', label: 'Translation review', minRole: 'reviewer' },
  { href: '/admin/violations', label: 'Voice guard', minRole: 'admin' },
] as const;

export function AdminNav({ role, name }: { role: string; name: string }) {
  const pathname = usePathname();

  return (
    <header className="mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-white">Administration</h1>
        <p className="text-sm text-white/50">
          {name} · <span className="text-accent">{role}</span>
        </p>
      </div>

      <nav className="mt-4 flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {TABS.filter((t) => t.minRole !== 'admin' || role === 'admin').map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded px-3 py-1.5 text-sm transition ${
                active
                  ? 'bg-accent/15 text-accent'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
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
