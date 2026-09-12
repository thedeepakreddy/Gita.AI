'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';

import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/locales';

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

  const hasOwnKey = myProviders.length > 0;

  const endRef = useRef<HTMLDivElement>(null);

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

  async function openConversation(id: string) {
    setActiveId(id);
    setVerses([]);
    setError(null);
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages ?? []);
    setProvider(
      data.provider && myProviders.includes(data.provider) ? data.provider : null
    );
  }

  function newConversation() {
    setActiveId(null);
    setMessages([]);
    setVerses([]);
    setError(null);
    setProvider(null);
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
    setRetrieving(true);
    void fetch(`/api/search?q=${encodeURIComponent(question)}&k=5&locale=${locale}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        // Ignore if the real answer already arrived and set its own verses.
        if (data?.results) setVerses((prev) => (prev.length ? prev : data.results));
      })
      .catch(() => {})
      .finally(() => setRetrieving(false));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          conversationId: activeId,
          locale,
          ...(provider ? { provider } : {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError({ code: data.error ?? 'unknown', message: data.message ?? t('error') });
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setInput(question);
        return;
      }

      setActiveId(data.conversationId ?? null);
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
      <div className="flex h-full items-center justify-center px-4">
        <div className="surface-glass max-w-md rounded-2xl px-8 py-10 text-center">
          <h1 className="font-serif-text text-[1.375rem] font-semibold text-white">
            {tAuth('signInHeading')}
          </h1>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-white/55">
            {tAuth('signInIntro')}
          </p>
          <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-relaxed text-white/35">
            {tAuth('signInNote')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      {/* Conversation sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-e border-white/[0.08] bg-black/40 p-3 backdrop-blur-xl sm:flex">
        <button onClick={newConversation} className="btn btn-quiet justify-center">
          + {t('heading')}
        </button>

        <ul className="mt-3 flex-1 space-y-1 overflow-y-auto">
          {conversations.map((c) => (
            <li key={c.id} className="group flex items-center gap-1">
              <button
                onClick={() => openConversation(c.id)}
                className={`flex-1 truncate rounded-md px-2 py-1.5 text-start text-[0.8125rem] transition-colors ${
                  activeId === c.id
                    ? 'bg-accent/10 text-accent'
                    : 'text-white/65 hover:bg-white/[0.06] hover:text-white'
                }`}
                title={c.title}
              >
                {c.title}
              </button>
              <button
                onClick={() => deleteConversation(c.id)}
                aria-label={`Delete ${c.title}`}
                className="rounded px-1.5 py-1 text-xs text-white/40 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Conversation */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
          {messages.length === 0 && (
            <div className="mx-auto max-w-md py-14 text-center">
              <h1 className="font-serif-text text-[1.375rem] font-semibold text-white">
                {t('heading')}
              </h1>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-white/50">{t('intro')}</p>
              <p className="mt-8 border-t border-white/10 pt-5 text-xs leading-relaxed text-white/30">
                {tDisc('thirdPersonNote')}
                <br />
                {tDisc('notAdvice')}
              </p>
            </div>
          )}

          {messages.length > 0 && (
            <div className="mx-auto flex max-w-[42rem] justify-end print:hidden">
              <button
                onClick={() => window.print()}
                className="rounded border border-white/20 px-2.5 py-1 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
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
                className={`max-w-[40rem] whitespace-pre-wrap rounded-2xl px-5 py-4 ${
                  m.role === 'user'
                    ? 'bg-white/[0.08] text-[0.9375rem] text-white/90'
                    : 'surface font-serif-text text-[1.0625rem] leading-[1.75] text-stone-200'
                }`}
              >
                {m.content}
                {m.citations.length > 0 && (
                  <p className="mt-4 border-t border-white/10 pt-3 font-sans text-xs text-white/40">
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
            <p className="text-sm italic text-white/50">
              {retrieving ? t('retrieving') : verses.length > 0 ? t('versesFound') : t('sending')}
            </p>
          )}

          {error && (
            <div className="mx-auto max-w-lg rounded-lg border border-red-500/20 bg-red-950/40 p-4 text-sm text-red-300/90 backdrop-blur-sm">
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
              className="mx-auto max-w-[42rem] rounded border border-white/10 bg-black/30 p-3 text-sm backdrop-blur-sm print:hidden"
            >
              <summary className="cursor-pointer text-white/45">
                {t('citedVerses')} ({verses.length})
              </summary>
              <ul className="mt-3 space-y-2">
                {verses.map((v) => (
                  <li key={v.ref}>
                    <span className="font-medium text-white">{v.ref}</span>{' '}
                    <span className="text-xs text-white/50">({v.score.toFixed(3)})</span>
                    <p className="text-white/70">{v.text}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div ref={endRef} />
        </div>

        <form
          onSubmit={send}
          className="border-t border-white/[0.08] bg-black/45 p-4 backdrop-blur-xl"
        >
          {myProviders.length > 1 && (
            <div className="mb-2 flex items-center gap-2 text-xs">
              <label htmlFor="chat-provider" className="text-white/50">
                {t('provider')}
              </label>
              <select
                id="chat-provider"
                value={provider ?? myProviders[0]}
                onChange={(e) => setProvider(e.target.value)}
                className="rounded border border-white/20 bg-black/30 px-2 py-1 text-white"
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
            <p className="mb-2 text-xs text-white/50">
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
              className="flex-1 resize-none rounded-lg border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-[0.9375rem] text-white placeholder-white/30 transition-colors hover:border-white/20"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="btn btn-primary self-end"
            >
              {sending ? t('sending') : t('send')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
