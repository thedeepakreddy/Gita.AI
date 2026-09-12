import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { SignInClient } from '@/components/SignInClient';
import { isLocale } from '@/i18n/locales';

export default function SignInPage({ params: { locale } }: { params: { locale: string } }) {
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  return <SignInClient />;
}
