'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';

import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/locales';
import { isSmallTalk, retrievalQuery } from '@/lib/chat/prompt';
import {
  CHAT_WALLPAPERS,
  chatWallpaperIndex,
  nextChatWallpaperIndex,
} from '@/lib/ui/chatWallpapers';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: string[];
};

type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  wallpaperIndex: number | null;
};

type VerseHit = { ref: string; score: number; text: string };

/** Provider id -> key in the `settings` message namespace. */
const PROVIDER_LABEL: Record<string, string> = {
  gemini: 'providerGemini',
  groq: 'providerGroq',
  openai: 'providerOpenai',
  anthropic: 'providerAnthropic',
};

export function ChatClient({ locale }: { locale: Locale }) {
  const t = useTranslations('chat');
  const tAuth = useTranslations('auth');
  const tDisc = useTranslations('disclaimer');
  const tSettings = useTranslations('settings');
  const { data: session, status } = useSession();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [verses, setVerses] = useState<VerseHit[]>([]);
  /** True between sending and the verses coming back, for the waiting copy. */
  const [retrieving, setRetrieving] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [trial, setTrial] = useState<{
    configured: boolean;
    remaining: number;
    limit: number;
  } | null>(null);
  /** Providers this user has saved a key for, newest first. */
  const [myProviders, setMyProviders] = useState<string[]>([]);
  /** Which one this conversation uses. Null = let the server decide. */
  const [provider, setProvider] = useState<string | null>(null);
  const [wallpaperIndex, setWallpaperIndex] = useState(0);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);

  const hasOwnKey = myProviders.length > 0;

  const endRef = useRef<HTMLDivElement>(null);
  const openSequence = useRef(0);
  const draftWallpaperChosen = useRef(false);
  const wallpaper = CHAT_WALLPAPERS[wallpaperIndex];

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/conversations');
    if (!res.ok) return;
    const data = await res.json();
    setConversations(data.conversations ?? []);
  }, []);

  const loadTrial = useCallback(async () => {
    const res = await fetch('/api/keys');
    if (!res.ok) return;
    const data = await res.json();
    setTrial(data.trial ?? null);
    setMyProviders((data.keys ?? []).map((k: { provider: string }) => k.provider));
  }, []);

  useEffect(() => {
    if (session) {
      void loadConversations();
      void loadTrial();
    }
  }, [session, loadConversations, loadTrial]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    if (!activeId && messages.length === 0 && !draftWallpaperChosen.current) {
      setWallpaperIndex(nextChatWallpaperIndex(conversations));
    }
  }, [activeId, conversations, messages.length]);

  async function openConversation(id: string) {
    const sequence = ++openSequence.current;
    setActiveId(id);
    setMessages([]);
    setVerses([]);
    setError(null);
    setProvider(null);
    setWallpaperOpen(false);
    const summary = conversations.find((conversation) => conversation.id === id);
    if (summary) setWallpaperIndex(chatWallpaperIndex(summary.id, summary.wallpaperIndex));
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    if (sequence !== openSequence.current) return;
    setMessages(data.messages ?? []);
    setWallpaperIndex(chatWallpaperIndex(id, data.wallpaperIndex));
    setProvider(
      data.provider && myProviders.includes(data.provider) ? data.provider : null
    );
  }

  function newConversation() {
    openSequence.current += 1;
    setActiveId(null);
    setMessages([]);
    setVerses([]);
    setError(null);
    setProvider(null);
    draftWallpaperChosen.current = false;
    setWallpaperIndex(nextChatWallpaperIndex(conversations));
    setWallpaperOpen(false);
  }

  async function changeWallpaper(index: number) {
    if (index === wallpaperIndex) {
      setWallpaperOpen(false);
      return;
    }
    const conversationId = activeId;
    const sequence = openSequence.current;
    if (conversationId) {
      try {
        const res = await fetch(`/api/conversations/${conversationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallpaperIndex: index }),
        });
        if (!res.ok) throw new Error('wallpaper_update_failed');
      } catch {
        if (sequence === openSequence.current) {
          setError({ code: 'wallpaper', message: t('wallpaperError') });
        }
        return;
      }
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, wallpaperIndex: index } : conversation
        )
      );
    }
    if (sequence !== openSequence.current) return;
    if (!conversationId) draftWallpaperChosen.current = true;
    setWallpaperIndex(index);
    setWallpaperOpen(false);
  }

  async function deleteConversation(id: string) {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    if (activeId === id) newConversation();
    void loadConversations();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || sending) return;

    setError(null);
    setInput('');
    setSending(true);
    setWallpaperOpen(false);

    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: question,
      citations: [],
    };
    setMessages((prev) => [...prev, optimistic]);
    setVerses([]);

    // Retrieval runs in ~50ms; the provider takes closer to ten seconds. Firing
    // the same search the chat route will run means the reader can start
    // reading the verses immediately instead of watching a spinner.
    //
    // It does embed the question twice (~20ms of work). That is a deliberate
    // trade: the alternative is streaming the reply, and the voice guard has to
    // see a COMPLETE reply before any of it is shown — streaming would mean
    // displaying text and then retracting it, which is worse than waiting.
    if (isSmallTalk(question)) {
      setRetrieving(false);
    } else {
      setRetrieving(true);
      const query = retrievalQuery(question, messages);
      void fetch(`/api/search?q=${encodeURIComponent(query)}&k=5&locale=${locale}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          // Ignore if the real answer already arrived and set its own verses.
          if (data?.results) setVerses((prev) => (prev.length ? prev : data.results));
        })
        .catch(() => {})
        .finally(() => setRetrieving(false));
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          conversationId: activeId,
          ...(!activeId ? { wallpaperIndex } : {}),
          locale,
          ...(provider ? { provider } : {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError({
          code: data.error ?? 'unknown',
          message: data.error === 'unsupported_citation' ? t('groundingError') : data.message ?? t('error'),
        });
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setInput(question);
        return;
      }

      setActiveId(data.conversationId ?? null);
      if (typeof data.wallpaperIndex === 'number') {
        setWallpaperIndex(chatWallpaperIndex(data.conversationId ?? '', data.wallpaperIndex));
      }
      setVerses(data.verses ?? []);
      if (data.persisted === false) {
        setError({ code: 'not_saved', message: t('notSaved') });
      }
      if (typeof data.trialRemaining === 'number') {
        setTrial((prev) => (prev ? { ...prev, remaining: data.trialRemaining } : prev));
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          citations: data.citations ?? [],
        },
      ]);
      void loadConversations();
    } catch {
      setError({ code: 'network', message: t('error') });
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(question);
    } finally {
      setSending(false);
    }
  }

  if (status === 'loading') return null;

  if (!session) {
    return (
      <div className="relative flex h-full items-center justify-center overflow-hidden px-4">
        <Image src="/chat-wallpapers/mahabharata-chariot.jpg" alt="" fill sizes="100vw" className="object-cover object-right opacity-30" />
        <div className="surface-glass relative max-w-md px-8 py-10 text-center">
          <h1 className="font-serif-text text-[1.375rem] font-semibold text-[#1c3b32]">
            {tAuth('signInHeading')}
          </h1>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-[#68766c]">
            {tAuth('signInIntro')}
          </p>
          <p className="mt-4 border-t border-[#dfd4c2] pt-4 text-xs leading-relaxed text-[#858c80]">
            {tAuth('signInNote')}
          </p>
          <Link href="/signin" className="btn btn-primary mt-6 justify-center">{tAuth('google')} →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="counsel-stage relative flex h-full w-full overflow-hidden text-[#263e48]">
      <div className="pointer-events-none fixed inset-0 z-0 print:hidden" aria-hidden="true">
        <Image
          src={wallpaper.src}
          alt=""
          fill
          sizes="100vw"
          quality={90}
          priority
          className="object-cover object-right"
        />
      </div>
      {/* Conversation sidebar */}
      <aside className="counsel-glass relative z-10 m-3 me-0 hidden w-60 shrink-0 flex-col overflow-hidden rounded-[1.4rem] p-4 sm:flex lg:m-5 lg:me-0" aria-label={t('conversations')}>
        <button
          onClick={newConversation}
          disabled={sending}
          className="font-literary flex min-h-11 items-center justify-center rounded-xl border border-[#b99c73]/70 bg-white/35 px-3 text-sm text-[#173d56] transition hover:bg-white/70"
        >
          + {t('heading')}
        </button>

        <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {conversations.map((c) => (
            <li key={c.id} className="group flex items-center gap-1">
              <button
                onClick={() => openConversation(c.id)}
                disabled={sending}
                className={`font-literary flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-start text-[0.75rem] transition-colors ${
                  activeId === c.id
                    ? 'rounded-lg bg-white/60 text-[#173d56] ring-1 ring-inset ring-[#ad865a]/35'
                    : 'rounded-lg text-[#344b58] hover:bg-white/40 hover:text-[#173d56]'
                }`}
                title={c.title}
              >
                <Image
                  src={CHAT_WALLPAPERS[chatWallpaperIndex(c.id, c.wallpaperIndex)].src}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 shrink-0 border border-[#b99c73] object-cover object-right"
                />
                <span className="truncate">{c.title}</span>
              </button>
              <button
                onClick={() => deleteConversation(c.id)}
                disabled={sending}
                aria-label={`Delete ${c.title}`}
                className="rounded px-1.5 py-1 text-xs text-[#837e73] opacity-0 transition group-hover:opacity-100 focus:opacity-100 hover:text-[#a3352f]"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 max-h-[60%] shrink-0 overflow-y-auto border-t border-[#ad865a]/35 pt-4">
          <h1 className="font-cormorant text-[1.45rem] leading-tight text-[#173d56]">{t('heading')}</h1>
          <p className="font-literary mt-2 text-[0.68rem] leading-[1.65] text-[#344b58]">{t('intro')}</p>
          <p className="font-literary mt-3 border-t border-[#ad865a]/25 pt-3 text-[0.68rem] leading-[1.65] text-[#4f5d60]">
            {tDisc('thirdPersonNote')}
            <br />
            {tDisc('notAdvice')}
          </p>
          {trial && !trial.configured && !hasOwnKey && (
            <p className="mt-3 rounded-lg border border-[#d8c6a9] bg-white/55 p-2 text-[0.68rem] leading-relaxed text-[#495d4e]">
              {t('needsKey')}{' '}
              <Link href="/settings" className="font-semibold underline underline-offset-2">{t('needsKeyCta')} →</Link>
            </p>
          )}
        </div>
      </aside>

      {/* Conversation */}
      <section className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="counsel-glass-soft relative z-20 mx-3 mt-3 flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 sm:px-6 lg:mx-5 lg:mt-5">
            <div className="flex min-w-0 items-center gap-2">
              <button
                onClick={newConversation}
                disabled={sending}
                className="rounded-lg border border-white/65 bg-white/50 px-2.5 py-1.5 text-xs font-medium text-[#173d56] sm:hidden"
              >
                + {t('newChat')}
              </button>
              <select
                value={activeId ?? ''}
                disabled={sending}
                onChange={(event) =>
                  event.target.value ? void openConversation(event.target.value) : newConversation()
                }
                aria-label={t('conversations')}
                className="min-w-0 max-w-36 bg-transparent text-xs text-[#344b58] sm:hidden"
              >
                <option value="">{t('newChat')}</option>
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.title}
                  </option>
                ))}
              </select>
              <span className="hidden truncate text-[0.65rem] uppercase tracking-[0.17em] text-[#986d47] sm:block">
                {wallpaper.epic[locale]}
              </span>
              <span className="hidden text-[#b7ab99] sm:block">/</span>
              <span className="font-literary hidden truncate text-xs text-[#173d56] sm:block">
                {wallpaper.title[locale]}
              </span>
            </div>

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setWallpaperOpen((open) => !open)}
                disabled={sending}
                aria-expanded={wallpaperOpen}
                className="font-literary border-b border-[#ad865a] px-1 py-1.5 text-xs text-[#173d56] transition hover:text-[#9a6039]"
              >
                {t('changeWallpaper')}
              </button>
              {wallpaperOpen && (
                <div className="counsel-glass-strong counsel-artwork-picker absolute end-0 top-full z-30 mt-2 w-[min(21rem,calc(100vw-2rem))] rounded-2xl p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#70583d]">
                      {t('chooseWallpaper')}
                    </p>
                    <button
                      type="button"
                      onClick={() => setWallpaperOpen(false)}
                      aria-label={t('closeWallpapers')}
                      className="px-1 text-lg leading-none text-[#786d5d]"
                    >
                      ×
                    </button>
                  </div>
                  <div className="grid max-h-[min(70vh,34rem)] grid-cols-2 gap-2 overflow-y-auto">
                    {CHAT_WALLPAPERS.map((item, index) => (
                      <button
                        key={item.src}
                        type="button"
                        onClick={() => void changeWallpaper(index)}
                        aria-pressed={index === wallpaperIndex}
                        className={`overflow-hidden rounded-md border text-start transition hover:border-[#8e6846] ${
                          index === wallpaperIndex ? 'border-[#a76936] ring-1 ring-[#a76936]' : 'border-[#ddd5c9]'
                        }`}
                      >
                        <Image
                          src={item.src}
                          alt=""
                          width={150}
                          height={72}
                          sizes="150px"
                          className="h-12 w-full object-cover object-right sm:h-14"
                        />
                        <span className="block truncate bg-white/75 px-2 py-1.5 text-[0.68rem] text-[#37382f]">
                          {item.title[locale]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-5 sm:px-6 lg:px-10">
          {messages.length > 0 && (
            <div className="mx-auto flex max-w-[42rem] justify-end print:hidden">
              <button
                onClick={() => window.print()}
                className="counsel-glass-soft rounded-lg px-2.5 py-1 text-xs text-[#344b58] transition hover:bg-white/75"
              >
                {t('export')}
              </button>
            </div>
          )}

          {/* Only visible on paper: without it a printed page is anonymous. */}
          <div className="hidden print:block print:mb-6">
            <h1 className="text-lg font-semibold">{t('exportTitle')}</h1>
            <p className="text-xs">{new Date().toLocaleString()}</p>
          </div>

          {messages.map((m) => (
            <div
              key={m.id}
              className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={`max-w-[40rem] whitespace-pre-wrap px-5 py-4 ${
                  m.role === 'user'
                    ? 'rounded-2xl border border-[#173d56]/55 bg-[#173d56]/80 text-[0.9375rem] text-white backdrop-blur-md'
                    : 'counsel-glass rounded-2xl font-literary text-[0.95rem] leading-[1.85] text-[#173d56]'
                }`}
              >
                {m.content}
                {m.citations.length > 0 && (
                  <p className="mt-4 border-t border-[#ad865a]/30 pt-3 font-sans text-xs text-[#344b58]">
                    {t('citedVerses')}:{' '}
                    {m.citations.map((ref, i) => (
                      <span key={ref}>
                        {i > 0 && ', '}
                        <Link
                          href={`/study/${ref.split('.')[0]}#verse-${ref.split('.')[1]}`}
                          className="underline underline-offset-2"
                        >
                          {ref}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <p className="counsel-glass-soft mx-auto max-w-[42rem] rounded-xl px-3 py-2 text-sm italic text-[#344b58]">
              {retrieving ? t('retrieving') : verses.length > 0 ? t('versesFound') : t('sending')}
            </p>
          )}

          {error && (
            <div className="counsel-glass-strong mx-auto max-w-lg rounded-xl border-[#d8aaa0] p-4 text-sm text-[#923c35]">
              {error.code === 'no_key_and_trial_exhausted' ? (
                <>
                  <p>{t('trialExhausted')}</p>
                  <Link href="/settings" className="mt-2 inline-block font-medium underline">
                    {t('trialExhaustedCta')}
                  </Link>
                </>
              ) : error.code === 'no_key_and_trial_unavailable' ? (
                <>
                  <p>{t('trialUnavailable')}</p>
                  <Link href="/settings" className="mt-2 inline-block font-medium underline">
                    {t('needsKeyCta')}
                  </Link>
                </>
              ) : (
                <p>{error.message}</p>
              )}
            </div>
          )}

          {verses.length > 0 && (
            <details
              open={sending}
              className="counsel-glass mx-auto max-w-[42rem] rounded-xl p-3 text-sm print:hidden"
            >
              <summary className="cursor-pointer text-[#56665b]">
                {t('citedVerses')} ({verses.length})
              </summary>
              <ul className="mt-3 space-y-2">
                {verses.map((v) => (
                  <li key={v.ref}>
                    <span className="font-medium text-[#233b33]">{v.ref}</span>{' '}
                    <span className="text-xs text-[#85897f]">({v.score.toFixed(3)})</span>
                    <p className="text-[#4b544e]">{v.text}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div ref={endRef} />
          </div>

        <details className="counsel-glass-soft counsel-mobile-intro mx-3 mb-2 rounded-xl px-4 py-2 text-xs text-[#173d56] sm:hidden">
          <summary className="cursor-pointer font-literary">{t('heading')}</summary>
          <p className="mt-2 leading-relaxed text-[#344b58]">{t('intro')}</p>
          <p className="mt-2 border-t border-[#ad865a]/25 pt-2 leading-relaxed text-[#4f5d60]">
            {tDisc('thirdPersonNote')}
            <br />
            {tDisc('notAdvice')}
          </p>
          {trial && !trial.configured && !hasOwnKey && (
            <p className="mt-2 rounded-lg border border-[#d8c6a9] bg-white/55 p-2 leading-relaxed text-[#495d4e]">
              {t('needsKey')}{' '}
              <Link href="/settings" className="font-semibold underline underline-offset-2">{t('needsKeyCta')} →</Link>
            </p>
          )}
        </details>

        <form
          onSubmit={send}
          className="counsel-glass-strong mx-3 mb-3 rounded-[1.4rem] p-3 sm:mx-6 sm:p-4 lg:mx-10 lg:mb-5"
        >
          {myProviders.length > 1 && (
            <div className="mb-2 flex items-center gap-2 text-xs">
              <label htmlFor="chat-provider" className="text-[#626c63]">
                {t('provider')}
              </label>
              <select
                id="chat-provider"
                value={provider ?? myProviders[0]}
                onChange={(e) => setProvider(e.target.value)}
                className="rounded-lg border border-white/65 bg-white/45 px-2 py-1 text-[#27352e]"
              >
                {myProviders.map((p) => (
                  <option key={p} value={p}>
                    {tSettings(PROVIDER_LABEL[p] ?? 'providerGemini')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {trial?.configured && !hasOwnKey && (
            <p className="mb-2 text-xs text-[#606960]">
              {trial.remaining <= 0
                ? t('trialExhausted')
                : trial.remaining === 1
                  ? t('trialLast')
                  : t('trialRemaining', { count: trial.remaining })}
              {trial.remaining <= 3 && (
                <>
                  {' '}
                  <Link href="/settings" className="underline">
                    {t('trialExhaustedCta')}
                  </Link>
                </>
              )}
            </p>
          )}

          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(e as unknown as React.FormEvent);
                }
              }}
              rows={2}
              placeholder={t('placeholder')}
              className="font-literary min-w-0 flex-1 resize-none rounded-xl border border-white/70 bg-white/40 px-3.5 py-2.5 text-[0.85rem] leading-relaxed text-[#173d56] placeholder:text-[#69777a] transition-colors hover:bg-white/65"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="btn self-end rounded-xl bg-[#173d56] font-medium text-white shadow-sm hover:bg-[#254d65]"
            >
              {sending ? t('sending') : t('send')}
            </button>
          </div>
        </form>
          </div>
      </section>
    </div>
  );
}
