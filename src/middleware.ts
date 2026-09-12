import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Locale-agnostic matcher: skips API routes, Next internals and static files.
  // Adding a locale needs no change here.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
