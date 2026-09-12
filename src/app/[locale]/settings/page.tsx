import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { SettingsClient } from '@/components/SettingsClient';
import { isLocale } from '@/i18n/locales';

export default function SettingsPage({ params: { locale } }: { params: { locale: string } }) {
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  return <SettingsClient />;
}
