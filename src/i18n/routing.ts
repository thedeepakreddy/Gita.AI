import { defineRouting } from 'next-intl/routing';

import { defaultLocale, locales } from './locales';

export const routing = defineRouting({
  locales,
  defaultLocale,
  // Every URL carries its locale (/en/study, /hu/study). Keeps shared links
  // unambiguous, which matters when a verse link gets passed around.
  localePrefix: 'always',
});
