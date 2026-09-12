'use client';

import { useTranslations } from 'next-intl';
import { signIn, signOut, useSession } from 'next-auth/react';

import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { localeMeta, locales, type Locale } from '@/i18n/locales';

/**
 * The masthead.
 *
 * Deliberately recessive: it sits over artwork on every page and is the one
 * element a reader never came for. Thin rule instead of a filled bar, quiet
 * links with a real active state, and no filled accent button — a saturated
 * "Sign in" was the loudest thing on every screen, which told the reader it
 * mattered more than the verse they were reading.
 */
export function SiteHeader({ locale }: { locale: Locale }) {
  const t = useTranslations('nav');
  const tApp = useTranslations('app');
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const role = session?.user?.role;
  const nav = [
    { href: '/study', label: t('study') },
    { href: '/search', label: t('search') },
    { href: '/chat', label: t('chat') },
    ...(session ? [{ href: '/bookmarks', label: t('bookmarks') }] : []),
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="shrink-0 border-b border-white/[0.08] bg-black/45 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-7 gap-y-2 px-4 py-3.5 sm:px-6">
        <Link
          href="/"
          className="font-serif-text text-[0.95rem] tracking-tight text-white transition-colors hover:text-accent"
        >
          {tApp('name')}
        </Link>

        <nav className="flex items-center gap-5 text-[0.8125rem]">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={`transition-colors ${
                isActive(item.href) ? 'text-accent' : 'text-white/55 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          ))}
          {(role === 'admin' || role === 'reviewer') && (
            <Link
              href="/admin"
              aria-current={isActive('/admin') ? 'page' : undefined}
              className={`transition-colors ${
                isActive('/admin') ? 'text-accent' : 'text-white/35 hover:text-white/70'
              }`}
            >
              {t('admin')}
            </Link>
          )}
        </nav>

        <div className="ms-auto flex items-center gap-3 text-[0.8125rem]">
          <label className="sr-only" htmlFor="locale-switch">
            Language
          </label>
          <select
            id="locale-switch"
            value={locale}
            onChange={(e) => router.replace(pathname, { locale: e.target.value as Locale })}
            className="cursor-pointer rounded-md border border-white/10 bg-transparent px-2 py-1 text-white/70 transition-colors hover:border-white/25 hover:text-white"
          >
            {locales.map((l) => (
              <option key={l} value={l} className="bg-stone-950">
                {localeMeta[l].nativeLabel}
              </option>
            ))}
          </select>

          <Link
            href="/settings"
            aria-current={isActive('/settings') ? 'page' : undefined}
            className={`transition-colors ${
              isActive('/settings') ? 'text-accent' : 'text-white/55 hover:text-white'
            }`}
          >
            {t('settings')}
          </Link>

          {status === 'loading' ? null : session ? (
            <button
              onClick={() => signOut()}
              className="text-white/55 transition-colors hover:text-white"
            >
              {t('signOut')}
            </button>
          ) : (
            <button
              onClick={() => signIn('google')}
              className="btn btn-quiet !py-1 !text-[0.8125rem]"
            >
              {t('signIn')}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
