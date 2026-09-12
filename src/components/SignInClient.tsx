'use client';

import { useTranslations } from 'next-intl';
import { signIn, useSession } from 'next-auth/react';

import { Link } from '@/i18n/navigation';

export function SignInClient() {
  const t = useTranslations('auth');
  const { data: session } = useSession();

  return (
    <main className="flex-1 w-full overflow-y-auto px-4 py-20">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-black/50 p-8 text-center shadow-2xl backdrop-blur-md">
        <h1 className="text-2xl font-semibold text-white">{t('signInHeading')}</h1>
        <p className="mt-4 text-white/70">{t('signInIntro')}</p>

        {session ? (
          <p className="mt-8 text-white">
            {t('signedInAs', { name: session.user?.name ?? session.user?.email ?? '' })}
          </p>
        ) : (
          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="mt-8 w-full rounded-xl bg-accent/15 px-4 py-2.5 text-white shadow-lg transition hover:bg-accent/25"
          >
            {t('google')}
          </button>
        )}

        <p className="mt-6 border-t border-white/10 pt-4 text-sm text-white/50">
          {t('signInNote')}
        </p>

        <Link href="/settings" className="mt-4 inline-block text-sm text-white/70 underline hover:text-white">
          Settings
        </Link>
      </div>
    </main>
  );
}
