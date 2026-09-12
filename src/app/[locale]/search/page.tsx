import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { SearchClient } from '@/components/SearchClient';
import { isLocale, type Locale } from '@/i18n/locales';

export default function SearchPage({ params: { locale } }: { params: { locale: string } }) {
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  return <SearchClient locale={locale as Locale} />;
}
