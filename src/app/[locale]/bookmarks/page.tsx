import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { BookmarksClient } from '@/components/BookmarksClient';
import { isLocale, type Locale } from '@/i18n/locales';

export default function BookmarksPage({ params: { locale } }: { params: { locale: string } }) {
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  return <BookmarksClient locale={locale as Locale} />;
}
