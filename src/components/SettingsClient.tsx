'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { signIn, useSession } from 'next-auth/react';

type ProviderId = 'gemini' | 'groq' | 'openai' | 'anthropic';

type SavedKey = { provider: string; keyHint: string; updatedAt: string };
type TrialState = { configured: boolean; remaining: number; limit: number };

/**
 * Provider presentation.
 *
 * Ordered free-first, and the free/paid distinction is shown rather than
 * implied: telling someone to "get a free key" and sending them to OpenAI or
 * Anthropic — neither of which has a free API tier — wastes their time and
 * erodes trust at exactly the moment they are trying to get started.
 */
const PROVIDERS: {
  id: ProviderId;
  labelKey: string;
  wizardKey: string;
  openKey: string;
  url: string;
  free: boolean;
}[] = [
  {
    id: 'gemini',
    labelKey: 'providerGemini',
    wizardKey: 'wizardGemini',
    openKey: 'wizardGemini.openStudio',
    url: 'https://aistudio.google.com/app/apikey',
    free: true,
  },
  {
    id: 'groq',
    labelKey: 'providerGroq',
    wizardKey: 'wizardGroq',
    openKey: 'wizardGroq.openConsole',
    url: 'https://console.groq.com/keys',
    free: true,
  },
  {
    id: 'openai',
    labelKey: 'providerOpenai',
    wizardKey: 'wizardOpenai',
    openKey: 'wizardOpenai.openConsole',
    url: 'https://platform.openai.com/api-keys',
    free: false,
  },
  {
    id: 'anthropic',
    labelKey: 'providerAnthropic',
    wizardKey: 'wizardAnthropic',
    openKey: 'wizardAnthropic.openConsole',
    url: 'https://console.anthropic.com/settings/keys',
    free: false,
  },
];

export function SettingsClient() {
  const t = useTranslations('settings');
  const tAuth = useTranslations('auth');
  const { data: session, status } = useSession();

  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState<SavedKey[]>([]);
  const [trial, setTrial] = useState<TrialState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const loadKeys = useCallback(async () => {
    const res = await fetch('/api/keys');
    if (!res.ok) return;
    const data = await res.json();
    setSaved(data.keys ?? []);
    setTrial(data.trial ?? null);
  }, []);

  useEffect(() => {
    if (session) void loadKeys();
  }, [session, loadKeys]);

  const meta = PROVIDERS.find((p) => p.id === provider)!;
  const current = saved.find((k) => k.provider === provider);

  /**
   * Names the shape problem, when there is one. Advisory only — the provider
   * decides whether a key is good, and this never blocks anything.
   */
  function shapeDetail(data: {
    issue?: string;
    detectedProvider?: string;
    expectedPrefix?: string;
    minLength?: number;
    actualLength?: number;
  }): string | null {
    if (!data.issue) return null;
    const providerLabel = t(meta.labelKey as never);

    switch (data.issue) {
      case 'wrong_provider': {
        const detected = data.detectedProvider ?? '';
        return t('keyWrongProvider', {
          detected: t(
            `provider${detected.charAt(0).toUpperCase()}${detected.slice(1)}` as never
          ),
          provider: providerLabel,
        });
      }
      case 'wrong_prefix':
        return t('keyWrongPrefix', {
          provider: providerLabel,
          prefix: data.expectedPrefix ?? '',
        });
      case 'too_short':
        return t('keyTooShort', {
          provider: providerLabel,
          actual: data.actualLength ?? 0,
          min: data.minLength ?? 0,
        });
      case 'invalid_characters':
        return t('keyInvalidCharacters', { provider: providerLabel });
      default:
        return null;
    }
  }

  /**
   * Turns a rejection into something a person can act on.
   *
   * The provider's own words come first, because the provider is the only
   * authority on whether a key is valid. Our shape hint follows as a possible
   * explanation — "it does not start with AIza" is often the actionable half —
   * but it is never presented as the verdict.
   */
  function explainFailure(data: {
    error?: string;
    issue?: string;
    detectedProvider?: string;
    expectedPrefix?: string;
    minLength?: number;
    actualLength?: number;
    message?: string;
    contactedProvider?: boolean;
  }): string {
    const detail = shapeDetail(data);

    if (data.error === 'key_rejected' && data.message) {
      return [t('keyRejectedByProvider'), data.message, detail].filter(Boolean).join(' ');
    }
    if (detail) {
      return `${t('keyShapeHeading')} ${detail}`;
    }
    return data.message || t('keyInvalid');
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const key = apiKey.trim();
    if (!key) return;

    setBusy(true);
    setNotice({ tone: 'ok', text: t('testing') });

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: key }),
      });
      const data = await res.json();

      if (!res.ok) {
        setNotice({ tone: 'bad', text: explainFailure(data) });
        return;
      }

      setApiKey('');
      setNotice({
        tone: 'ok',
        text: [
          t('keyValid'),
          t('saved'),
          data.cleaned ? t('keyCleaned') : '',
          data.unrecognisedFormat ? t('keyUnusualFormat') : '',
        ]
          .filter(Boolean)
          .join(' '),
      });
      void loadKeys();
    } catch {
      setNotice({ tone: 'bad', text: t('keyInvalid') });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/keys?provider=${provider}`, { method: 'DELETE' });
    setNotice({ tone: 'ok', text: t('removed') });
    setBusy(false);
    void loadKeys();
  }

  if (status === 'loading') return null;

  if (!session) {
    return (
      <main className="flex-1 w-full overflow-y-auto px-4 py-16 sm:px-6">
        <div className="surface-glass mx-auto max-w-md rounded-2xl px-8 py-10 text-center">
          <h1 className="font-serif-text text-[1.375rem] font-semibold text-white">
            {tAuth('signInHeading')}
          </h1>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-white/55">
            {tAuth('signInIntro')}
          </p>
          <button onClick={() => signIn('google')} className="btn btn-primary mt-7">
            {tAuth('google')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full overflow-y-auto px-4 py-10 sm:px-6">
      <div className="surface mx-auto max-w-2xl rounded-2xl px-6 py-10 sm:px-12 sm:py-14">
      <h1 className="font-serif-text text-[1.75rem] font-semibold text-white">{t('heading')}</h1>

      {/* Trial standing */}
      {trial?.configured && (
        <section className="mt-8 rounded-xl border border-accent/15 bg-accent/[0.06] p-5">
          <h2 className="eyebrow">{t('trialHeading')}</h2>
          <p className="mt-2 text-sm text-white/80">
            {trial.remaining > 0
              ? t('trialStatus', { remaining: trial.remaining, limit: trial.limit })
              : t('trialSpent', { limit: trial.limit })}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/45">
            {t('trialIntro', { limit: trial.limit })}
          </p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-serif-text text-[1.125rem] text-white">{t('keyHeading')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/45">{t('keyIntro')}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setProvider(p.id);
                setNotice(null);
              }}
              aria-pressed={provider === p.id}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                provider === p.id
                  ? 'bg-accent/15 text-accent'
                  : 'border border-white/10 text-white/60 hover:border-white/25 hover:text-white'
              }`}
            >
              {t(p.labelKey as never)}
              {saved.some((k) => k.provider === p.id) && <span className="ms-1.5">✓</span>}
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs">
          <span
            className={
              meta.free
                ? 'rounded bg-emerald-100 px-2 py-0.5 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                : 'rounded bg-stone-200 px-2 py-0.5 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
            }
          >
            {meta.free ? t('freeBadge') : t('paidBadge')}
          </span>
        </p>

        {/* Guided setup */}
        <div className="mt-6 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h3 className="eyebrow">{t('wizardHeading')}</h3>
          <p className="mt-2 text-sm text-white/45">{t('wizardIntro')}</p>

          <ol className="mt-4 list-decimal space-y-2 ps-5 text-sm">
            <li>{t(`${meta.wizardKey}.step1` as never)}</li>
            <li>{t(`${meta.wizardKey}.step2` as never)}</li>
            <li>{t(`${meta.wizardKey}.step3` as never)}</li>
          </ol>

          <p className="mt-3 text-sm italic text-stone-600 dark:text-stone-400">
            {t(`${meta.wizardKey}.note` as never)}
          </p>

          <a
            href={meta.url}
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-quiet mt-5"
          >
            {t(meta.openKey as never)} ↗
          </a>
        </div>

        {/* Key entry */}
        <form onSubmit={save} className="mt-6">
          <label htmlFor="api-key" className="block text-sm font-medium">
            {t('apiKey')}
          </label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t('apiKeyPlaceholder')}
            className="mt-2 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3.5 py-2.5 font-mono text-sm text-white transition-colors hover:border-white/20"
          />
          <p className="mt-2 text-xs text-stone-500">{t('storedNote')}</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy || !apiKey.trim()}
              className="btn btn-primary"
            >
              {busy ? t('saving') : t('save')}
            </button>

            {current ? (
              <>
                <span className="text-sm text-stone-600 dark:text-stone-400">
                  {t('currentKey')}: ····{current.keyHint}
                </span>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="text-sm text-red-700 underline disabled:opacity-40 dark:text-red-400"
                >
                  {t('remove')}
                </button>
              </>
            ) : (
              <span className="text-sm text-stone-500">{t('noKey')}</span>
            )}
          </div>
        </form>

        {notice && (
          <p
            className={`mt-4 rounded px-3 py-2 text-sm ${
              notice.tone === 'ok'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'
            }`}
          >
            {notice.text}
          </p>
        )}
      </section>
      </div>
    </main>
  );
}
