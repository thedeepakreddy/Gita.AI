'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';

/**
 * Which verses this reader has kept.
 *
 * Fetched once per page rather than once per verse: a chapter renders up to 78
 * VerseCards, and 78 requests to answer "is this one saved?" is the kind of
 * thing that is invisible on a laptop and miserable on a phone.
 */

type Ctx = {
  ready: boolean;
  signedIn: boolean;
  has: (verseId: string) => boolean;
  toggle: (verseId: string) => Promise<void>;
};

const BookmarksContext = createContext<Ctx | null>(null);

export function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      setIds(new Set());
      setReady(true);
      return;
    }
    fetch('/api/bookmarks')
      .then((r) => (r.ok ? r.json() : { bookmarks: [] }))
      .then((d) => setIds(new Set((d.bookmarks ?? []).map((b: { verseId: string }) => b.verseId))))
      .catch(() => setIds(new Set()))
      .finally(() => setReady(true));
  }, [session, status]);

  const toggle = useCallback(
    async (verseId: string) => {
      const saved = ids.has(verseId);

      // Optimistic: saving a verse should feel instant. Rolled back on failure.
      setIds((prev) => {
        const next = new Set(prev);
        if (saved) next.delete(verseId);
        else next.add(verseId);
        return next;
      });

      try {
        const res = saved
          ? await fetch(`/api/bookmarks?verseId=${encodeURIComponent(verseId)}`, {
              method: 'DELETE',
            })
          : await fetch('/api/bookmarks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ verseId }),
            });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        setIds((prev) => {
          const next = new Set(prev);
          if (saved) next.add(verseId);
          else next.delete(verseId);
          return next;
        });
      }
    },
    [ids]
  );

  const value = useMemo<Ctx>(
    () => ({ ready, signedIn: Boolean(session), has: (id) => ids.has(id), toggle }),
    [ready, session, ids, toggle]
  );

  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>;
}

/**
 * Said once, at the top of a chapter — not on every verse.
 *
 * It used to render inside each BookmarkButton, which put the same sentence on
 * the page 72 times for chapter 2. A note that repeats stops being a note and
 * becomes texture.
 */
export function BookmarkNotice() {
  const ctx = useContext(BookmarksContext);
  const t = useTranslations('study');

  if (!ctx?.ready || ctx.signedIn) return null;
  return <p className="text-xs text-white/35">{t('signInToSave')}</p>;
}

export function BookmarkButton({ verseId }: { verseId: string }) {
  const ctx = useContext(BookmarksContext);
  const t = useTranslations('study');

  // Nothing to offer a signed-out reader here; BookmarkNotice explains why,
  // once, rather than this repeating an apology per verse.
  if (!ctx?.ready || !ctx.signedIn) return null;

  const saved = ctx.has(verseId);
  return (
    <button
      onClick={() => void ctx.toggle(verseId)}
      aria-pressed={saved}
      title={saved ? t('removeBookmark') : t('bookmark')}
      className={`rounded-md px-2 py-1 text-xs transition ${
        saved
          ? 'text-accent'
          : 'text-white/35 hover:bg-white/5 hover:text-white/80'
      }`}
    >
      {saved ? `★ ${t('bookmarked')}` : `☆ ${t('bookmark')}`}
    </button>
  );
}
