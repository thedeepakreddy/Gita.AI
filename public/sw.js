/*
 * Offline reading for /study.
 *
 * The corpus is ~1MB of text that never changes between deploys, so a chapter
 * a reader has already opened can stay readable with no connection — useful in
 * a temple with patchy wifi, on a train, or on a phone that has run out of
 * data mid-verse.
 *
 * DELIBERATELY NARROW. This worker touches three things:
 *   - same-origin GET navigations under /study  (network first, cache fallback)
 *   - Next's immutable static assets            (cache first)
 *   - the icons and manifest                    (cache first)
 *
 * It does NOT touch /api, authentication, /chat, /settings or /admin. Caching
 * anything that depends on who is signed in is how a service worker ends up
 * serving one person's state to another, and no amount of offline convenience
 * is worth that risk.
 */

const VERSION = 'gita-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGES_CACHE = `${VERSION}-pages`;

const PRECACHE = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      // A single missing file must not fail the whole install.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/** Paths whose responses depend on who is asking. Never cached, never intercepted. */
function isPrivate(pathname) {
  return (
    pathname.startsWith('/api/') ||
    pathname.includes('/chat') ||
    pathname.includes('/settings') ||
    pathname.includes('/admin') ||
    pathname.includes('/bookmarks') ||
    pathname.includes('/signin')
  );
}

function isStudyPage(pathname) {
  // /en/study, /hu/study/2 — locale-prefixed, so match on the segment.
  return /\/study(\/|$)/.test(pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivate(url.pathname)) return;

  // Next's hashed build output is immutable — cache first, forever.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Study pages: network first, so a reader online always sees approved text;
  // cache is the fallback for when there is no network at all.
  if (isStudyPage(url.pathname) && request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/en/study')))
    );
  }
});
