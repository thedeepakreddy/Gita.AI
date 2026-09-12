import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { ChatClient } from '@/components/ChatClient';
import { isLocale, type Locale } from '@/i18n/locales';

export default function ChatPage({ params: { locale } }: { params: { locale: string } }) {
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  return (
    <div className="flex-1 w-full overflow-hidden">
      <ChatClient locale={locale as Locale} />
    </div>
  );
}
