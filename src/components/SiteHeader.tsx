'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { signIn, signOut, useSession } from 'next-auth/react';

import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { localeMeta, locales, type Locale } from '@/i18n/locales';

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
  const isCounsel = isActive('/chat');

  return (
    <header className={`z-20 shrink-0 ${isCounsel ? 'border-b border-white/55 bg-[#f9f3e7]/35 backdrop-blur-xl' : 'bg-[#f9f3e7]'}`}>
      <div className="relative mx-auto flex max-w-[1370px] flex-wrap items-center gap-x-8 gap-y-2 px-5 pb-5 pt-3 sm:px-8 lg:px-12 xl:px-16">
        <Link
          href="/"
          aria-label={tApp('name')}
          className="flex min-h-10 items-center gap-2 text-[#173d56] transition-opacity hover:opacity-70"
        >
          {locale === 'en' ? (
            <Image src="/manuscript/cutout-7-5e31485e2509.png" alt="" width={306} height={38} className="h-9 w-auto max-w-[210px] object-contain object-left" priority />
          ) : (
            <>
              <span className="relative block h-9 w-9 shrink-0 overflow-hidden" aria-hidden="true"><Image src="/manuscript/cutout-7-5e31485e2509.png" alt="" width={306} height={38} className="h-9 max-w-none" /></span>
              <span className="font-cormorant text-[1.4rem] font-semibold">{tApp('name')}</span>
            </>
          )}
        </Link>

        <nav className="font-literary order-3 flex w-full items-center gap-5 overflow-x-auto whitespace-nowrap text-[0.82rem] sm:order-none sm:w-auto">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={`transition-colors ${
                isActive(item.href) ? 'border-b border-[#a99072] pb-1 text-[#173d56]' : 'text-[#344b58] hover:text-[#9a6039]'
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
                isActive('/admin') ? 'text-[#173d56]' : 'text-[#344b58] hover:text-[#9a6039]'
              }`}
            >
              {t('admin')}
            </Link>
          )}
        </nav>

        <div className="font-literary ms-auto flex items-center gap-4 text-[0.78rem]">
          <label className="sr-only" htmlFor="locale-switch">
            Language
          </label>
          <select
            id="locale-switch"
            value={locale}
            onChange={(e) => router.replace(pathname, { locale: e.target.value as Locale })}
            className="max-w-24 cursor-pointer border-0 border-b border-[#b39467] bg-transparent px-0 py-1 text-[#263e48] transition-colors hover:border-[#8f6741]"
          >
            {locales.map((l) => (
              <option key={l} value={l} className="bg-[#f9f3e7]">
                {localeMeta[l].nativeLabel}
              </option>
            ))}
          </select>

          <Link
            href="/settings"
            aria-current={isActive('/settings') ? 'page' : undefined}
            className={`transition-colors ${
              isActive('/settings') ? 'border-b border-[#a99072] text-[#173d56]' : 'text-[#344b58] hover:text-[#9a6039]'
            }`}
          >
            {t('settings')}
          </Link>

          {status === 'loading' ? null : session ? (
            <button
              onClick={() => signOut()}
              className="border-b border-[#b39467] pb-1 text-[#344b58] transition-colors hover:text-[#9a6039]"
            >
              {t('signOut')}
            </button>
          ) : (
            <button
              onClick={() => signIn('google')}
              className="border-b border-[#b39467] pb-1 text-[#344b58] transition-colors hover:text-[#9a6039]"
            >
              {t('signIn')}
            </button>
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-5 bottom-0 flex items-center gap-3 sm:inset-x-8 lg:inset-x-12 xl:inset-x-16" aria-hidden="true">
          <span className="h-px flex-1 bg-[#b39467]" />
          <Image src="/manuscript/cutout-6-cab3f0ac6c33.png" alt="" width={25} height={24} className="h-5 w-5 object-contain" />
          <span className="h-px flex-1 bg-[#b39467]" />
        </div>
      </div>
    </header>
  );
}
