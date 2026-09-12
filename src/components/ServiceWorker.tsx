'use client';

import { useEffect } from 'react';

/**
 * Registers the offline worker — in production only.
 *
 * A service worker in front of a dev server caches the very files you are
 * editing and makes hot reload lie to you. The offline behaviour is a
 * production feature, so it is tested against a production build:
 *
 *     npm run build && npm start
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Offline reading is a bonus; failing to register is not worth a
        // console error in a user's face.
      });
    };

    // Wait for load so registration never competes with the first paint.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
