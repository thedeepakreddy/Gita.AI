import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { BackgroundSlideshow } from '@/components/BackgroundSlideshow';
import { Providers } from '@/components/Providers';
import { ServiceWorker } from '@/components/ServiceWorker';
import { SiteHeader } from '@/components/SiteHeader';
import { isLocale, locales, localeMeta } from '@/i18n/locales';

import '../globals.css';

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
    <html lang={locale} dir={localeMeta[locale].dir} className="dark">
      <body className="flex h-screen w-screen flex-col overflow-hidden bg-stone-950 text-stone-100 antialiased">
        {/* Full-screen artwork on every page, crossfading. See
            src/lib/ui/backgrounds.ts for the list and the crop anchors. */}
        <BackgroundSlideshow />

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
