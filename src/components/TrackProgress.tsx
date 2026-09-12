'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

/**
 * Records where the reader got to, so /study can offer to continue.
 *
 * Fires once per chapter view, after a short delay — opening a chapter and
 * immediately navigating away is not "reading", and recording it would make
 * "continue reading" point at wherever the reader last bounced off.
 */
export function TrackProgress({
  scripture = 'bhagavad-gita',
  chapter,
  verse = 1,
}: {
  scripture?: string;
  chapter: number;
  verse?: number;
}) {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => {
      void fetch('/api/progress', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scripture, chapter, verse }),
      }).catch(() => {});
    }, 5000);
    return () => clearTimeout(timer);
  }, [session, scripture, chapter, verse]);

  return null;
}
