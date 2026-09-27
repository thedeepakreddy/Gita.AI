import type { Metadata } from 'next';
import { Cormorant_Garamond, Libre_Baskerville } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Providers } from '@/components/Providers';
import { ServiceWorker } from '@/components/ServiceWorker';
import { SiteHeader } from '@/components/SiteHeader';
import { isLocale, locales, localeMeta } from '@/i18n/locales';

import '../globals.css';

const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-cormorant-garamond', display: 'swap' });
const baskerville = Libre_Baskerville({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-libre-baskerville', display: 'swap' });

type LocaleParams = { locale: string };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  if (!isLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: 'app' });

  return {
    title: t('name'),
    description: t('tagline'),
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, title: t('name'), statusBarStyle: 'black-translucent' },
    icons: {
      icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
    },
  };
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: LocaleParams;
}) {
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale} dir={localeMeta[locale].dir}>
      <body className={`${cormorant.variable} ${baskerville.variable} gallery-paper flex h-screen w-screen flex-col overflow-hidden text-[#263e48] antialiased`}>

        <NextIntlClientProvider messages={messages}>
          <Providers>
            <SiteHeader locale={locale} />
            <div className="flex-1 flex flex-col overflow-hidden">
              {children}
            </div>
            <ServiceWorker />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
