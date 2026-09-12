'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

/** "Continue from 4.13" — only shown once there is somewhere to continue from. */
export function ContinueReading() {
  const { data: session } = useSession();
  const t = useTranslations('study');
  const [progress, setProgress] = useState<{ chapter: number; verse: number } | null>(null);

  useEffect(() => {
    if (!session) return;
    fetch('/api/progress')
      .then((r) => (r.ok ? r.json() : { progress: null }))
      .then((d) => setProgress(d.progress ?? null))
      .catch(() => {});
  }, [session]);

  if (!progress) return null;

  return (
    <Link
      href={`/study/${progress.chapter}#verse-${progress.verse}`}
      className="inline-block rounded border border-accent/30 bg-accent/[0.07] px-3 py-1.5 text-sm text-accent transition hover:bg-accent/[0.12]"
    >
      {t('continueReading', { chapter: progress.chapter, verse: progress.verse })} →
    </Link>
  );
}
