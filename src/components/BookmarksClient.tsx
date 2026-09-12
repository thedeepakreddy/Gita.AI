'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/locales';

type Bookmark = {
  verseId: string;
  note: string | null;
  createdAt: string;
  chapter: number | null;
  verse: number | null;
  translations: Partial<Record<Locale, string>>;
};

export function BookmarksClient({ locale }: { locale: Locale }) {
  const t = useTranslations('bookmarks');
  const { data: session, status } = useSession();
  const [bookmarks, setBookmarks] = useState<Bookmark[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/bookmarks');
    if (!res.ok) return setBookmarks([]);
    const data = await res.json();
    setBookmarks(data.bookmarks ?? []);
  }, []);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  async function remove(verseId: string) {
    setBookmarks((prev) => prev?.filter((b) => b.verseId !== verseId) ?? null);
    await fetch(`/api/bookmarks?verseId=${encodeURIComponent(verseId)}`, { method: 'DELETE' });
  }

  if (status === 'loading') return null;

  return (
    <main className="flex-1 w-full overflow-y-auto px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-white drop-shadow-lg">{t('heading')}</h1>

        {!session ? (
          <p className="mt-4 text-white/60">{t('signInRequired')}</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-white/60">{t('intro')}</p>

            {bookmarks === null ? null : bookmarks.length === 0 ? (
              <p className="mt-8 text-white/60">{t('empty')}</p>
            ) : (
              <ul className="mt-8 space-y-3">
                {bookmarks.map((b) => (
                  <li
                    key={b.verseId}
                    className="rounded-xl border border-white/10 bg-black/40 p-4 backdrop-blur-md"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <Link
                        href={`/study/${b.chapter}#verse-${b.verse}`}
                        className="font-medium text-accent underline-offset-2 hover:underline"
                      >
                        {b.chapter}.{b.verse}
                      </Link>
                      <button
                        onClick={() => remove(b.verseId)}
                        className="text-xs text-white/40 hover:text-red-400"
                      >
                        {t('remove')}
                      </button>
                    </div>
                    <p className="mt-2 leading-relaxed text-white/85">
                      {b.translations[locale] ?? b.translations.en ?? ''}
                    </p>
                    {b.note && (
                      <p className="mt-2 border-s-2 border-accent/40 ps-3 text-sm italic text-white/60">
                        {b.note}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </main>
  );
}
