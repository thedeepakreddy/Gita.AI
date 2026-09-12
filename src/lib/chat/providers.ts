import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import OpenAI from 'openai';

/**
 * Provider adapters.
 *
 * Calls are billed either to the end user's own key or to the operator's
 * trial key (see src/lib/chat/keyResolution.ts). This file does not decide
 * which — it is handed a key and a provider and makes the call.
 */

export type ProviderId = 'gemini' | 'groq' | 'openai' | 'anthropic';

export const PROVIDERS: ProviderId[] = ['gemini', 'groq', 'openai', 'anthropic'];

export function isProvider(value: string): value is ProviderId {
  return (PROVIDERS as string[]).includes(value);
}

export type ProviderMeta = {
  label: string;
  /**
   * Whether a usable key can be obtained without entering payment details.
   * This drives which providers the Settings wizard recommends, and it is the
   * difference between "go get a free key" being true advice or a dead end:
   * OpenAI and Anthropic have no free API tier — both require prepaid credit,
   * regardless of any consumer ChatGPT/Claude subscription the user may have.
   */
  freeTier: boolean;
  consoleUrl: string;
};

export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  gemini: {
    label: 'Google Gemini',
    freeTier: true,
    consoleUrl: 'https://aistudio.google.com/app/apikey',
  },
  groq: {
    label: 'Groq',
    freeTier: true,
    consoleUrl: 'https://console.groq.com/keys',
  },
  openai: {
    label: 'OpenAI',
    freeTier: false,
    consoleUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    label: 'Anthropic Claude',
    freeTier: false,
    consoleUrl: 'https://console.anthropic.com/settings/keys',
  },
};

/** Providers a user can obtain without a payment card, best first. */
export const FREE_PROVIDERS = PROVIDERS.filter((p) => PROVIDER_META[p].freeTier);

/**
 * Model defaults, all overridable by env so maintainers can move them without
 * touching code.
 *
 * Anthropic: Claude Opus 5 thinks by default and `max_tokens` caps thinking
 * plus visible text together, so it is sized well above what a short reply
 * needs or answers truncate mid-sentence.
 */
const MODELS: Record<ProviderId, string> = {
  // gemini-2.5-flash was retired for new accounts: Google answers a key it has
  // never seen with 404 "no longer available to new users". An existing key may
  // still reach it, which is exactly how a default like this rots unnoticed —
  // it keeps working for whoever set it and fails for everyone who arrives
  // afterwards. `npm run models:check` is the thing that catches it.
  gemini: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  groq: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  openai: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  anthropic: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
};

const MAX_TOKENS = 8192;

/** Which env var overrides each provider's model, so error advice is specific. */
const MODEL_ENV_VARS: Record<ProviderId, string> = {
  gemini: 'GEMINI_MODEL',
  groq: 'GROQ_MODEL',
  openai: 'OPENAI_MODEL',
  anthropic: 'ANTHROPIC_MODEL',
};

/** Reverse of PROVIDER_META[p].label, for error messages built from a label. */
function providerOf(label: string): ProviderId {
  const found = PROVIDERS.find((p) => PROVIDER_META[p].label === label);
  return found ?? 'gemini';
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'quota' | 'refused' | 'network' | 'unknown'
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export type CompletionInput = {
  provider: ProviderId;
  apiKey: string;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
};

export async function complete(input: CompletionInput): Promise<string> {
  switch (input.provider) {
    case 'anthropic':
      return completeAnthropic(input);
    case 'gemini':
      return completeGemini(input);
    case 'groq':
    case 'openai':
      return completeOpenAICompatible(input);
  }
}

// --- Anthropic --------------------------------------------------------------

async function completeAnthropic({ apiKey, system, messages }: CompletionInput): Promise<string> {
  const client = new Anthropic({ apiKey, maxRetries: 1 });

  try {
    const response = await client.messages.create({
      model: MODELS.anthropic,
      max_tokens: MAX_TOKENS,
      output_config: { effort: 'medium' },
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    // Safety classifiers can decline with a 200 + stop_reason "refusal";
    // content is empty or partial, so check before reading it.
    if (response.stop_reason === 'refusal') {
      throw new ProviderError('The provider declined to answer this request.', 'refused');
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!text) throw new ProviderError('The provider returned an empty response.', 'unknown');
    return text;
  } catch (err) {
    throw normaliseAnthropicError(err);
  }
}

function normaliseAnthropicError(err: unknown): Error {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new ProviderError('Your Anthropic key was rejected.', 'auth');
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError('Your Anthropic key lacks access to this model.', 'auth');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ProviderError('Your Anthropic account is rate limited. Try again shortly.', 'quota');
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ProviderError('Could not reach Anthropic.', 'network');
  }
  if (err instanceof Anthropic.APIError) {
    return new ProviderError(`Anthropic returned an error (${err.status}).`, 'unknown');
  }
  return new ProviderError('Unexpected error calling Anthropic.', 'unknown');
}

// --- Gemini -----------------------------------------------------------------

async function completeGemini({ apiKey, system, messages }: CompletionInput): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: MODELS.gemini,
      config: { systemInstruction: system, maxOutputTokens: MAX_TOKENS },
      contents: messages.map((m) => ({
        // Gemini names the assistant role "model".
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    });

    const text = (response.text ?? '').trim();
    if (!text) {
      // Gemini 2.5 models think before answering, and thinking tokens are
      // drawn from maxOutputTokens. Exhausting the budget there returns an
      // empty response for a completely different reason than a safety block,
      // so do not report both the same way — "blocked by safety filters"
      // sends the operator hunting for a problem that isn't there.
      if (String(response.candidates?.[0]?.finishReason ?? '') === 'MAX_TOKENS') {
        throw new ProviderError(
          'Gemini spent its whole output budget before producing any text. ' +
            'Shorten the question, or raise MAX_TOKENS.',
          'unknown'
        );
      }
      throw new ProviderError(
        'Gemini returned no text — the response may have been blocked by its safety filters.',
        'refused'
      );
    }
    return text;
  } catch (err) {
    throw normaliseGenericError(err, 'Gemini');
  }
}

// --- Groq + OpenAI (same wire shape) ----------------------------------------

/**
 * Groq's SDK mirrors OpenAI's chat-completions surface, so both go through one
 * path. Only the client construction differs.
 */
async function completeOpenAICompatible({
  provider,
  apiKey,
  system,
  messages,
}: CompletionInput): Promise<string> {
  const label = PROVIDER_META[provider].label;

  const payload = {
    model: MODELS[provider],
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system' as const, content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  };

  try {
    const response =
      provider === 'groq'
        ? await new Groq({ apiKey, maxRetries: 1 }).chat.completions.create(payload)
        : await new OpenAI({ apiKey, maxRetries: 1 }).chat.completions.create(payload);

    const choice = response.choices?.[0];

    if (choice?.finish_reason === 'content_filter') {
      throw new ProviderError(`${label} declined to answer this request.`, 'refused');
    }

    const text = (choice?.message?.content ?? '').trim();
    if (!text) throw new ProviderError(`${label} returned an empty response.`, 'unknown');
    return text;
  } catch (err) {
    throw normaliseGenericError(err, label);
  }
}

/**
 * Digs the human-readable sentence out of whatever the SDK threw.
 *
 * Google returns its errors as a JSON envelope inside `Error.message`, so the
 * useful part — "API key not valid", "model not found" — is buried a couple of
 * levels down. Surfacing the envelope verbatim is nearly as unhelpful as
 * hiding it.
 */
export function providerMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  const start = raw.indexOf('{');
  if (start !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(start));
      const inner = parsed?.error?.message ?? parsed?.message;
      if (typeof inner === 'string' && inner.trim()) return inner.trim();
    } catch {
      // Not JSON after all — fall through to the raw text.
    }
  }
  return raw.trim();
}

/**
 * Shared error mapping for providers whose SDK error classes we do not narrow
 * individually. Reads the HTTP status where available and falls back to
 * matching the message.
 *
 * THE PROVIDER'S OWN WORDS ALWAYS SURVIVE. An earlier version ended at
 * "Unexpected error calling Gemini." for anything it could not classify, which
 * threw away the only thing worth having: this code path exists precisely to
 * find out what the provider says, and the fallback deleted it. If the
 * classification is wrong, the message still tells the user what to fix.
 */
function normaliseGenericError(err: unknown, label: string): Error {
  if (err instanceof ProviderError) return err;

  const status = (err as { status?: number })?.status;
  const message = providerMessage(err);

  // Logged server-side too: an operator reading the console should not have to
  // reproduce a user's failure to find out what happened.
  console.error(`[provider] ${label} error${status ? ` (HTTP ${status})` : ''}:`, message);

  const auth = () => new ProviderError(`Your ${label} key was rejected. ${message}`, 'auth');
  const quota = () =>
    new ProviderError(`Your ${label} quota is exhausted. ${message}`, 'quota');

  if (status === 401 || status === 403) return auth();
  if (status === 429) return quota();

  if (/api[_ ]?key|unauthenticated|unauthorized|permission|invalid.*key/i.test(message)) {
    return auth();
  }
  if (/quota|rate.?limit|resource[_ ]?exhausted|insufficient.*credit|billing/i.test(message)) {
    return quota();
  }
  if (/fetch|network|ENOTFOUND|ECONN|timeout/i.test(message)) {
    return new ProviderError(`Could not reach ${label}. ${message}`, 'network');
  }
  // Model retirement is the single most likely way a working install breaks
  // months later, and it is invisible until someone new tries to sign up.
  // "no longer available" is the wording that actually shows up; matching only
  // "not found" missed it entirely.
  if (
    /not found|does not exist|unsupported|not supported|no longer available|deprecated|decommissioned|retired/i.test(
      message
    )
  ) {
    const envVar = MODEL_ENV_VARS[providerOf(label)] ?? 'the model override';
    return new ProviderError(
      `${label} will not serve the model this app is set to use. ${message} ` +
        `Set ${envVar} in .env to a current model and restart.`,
      'refused'
    );
  }

  return new ProviderError(
    `${label} returned an error${status ? ` (HTTP ${status})` : ''}: ${message}`,
    'unknown'
  );
}

// --- Key validation ---------------------------------------------------------

/**
 * Is the configured model actually on offer to this account?
 *
 * Providers retire models on their own schedule, and a key that authenticates
 * perfectly will still fail every message if MODELS[provider] no longer exists.
 * Catching it here turns a mystifying 502 mid-conversation into a sentence at
 * setup time that names the model and the env var that changes it.
 *
 * An empty list is not treated as a failure: if the endpoint returns nothing
 * usable, that is a reason to stay quiet, not to block a key that may be fine.
 */
function assertModelAvailable(provider: ProviderId, available: string[]): void {
  if (available.length === 0) return;
  const wanted = MODELS[provider];
  if (available.includes(wanted)) return;

  const envVar = provider === 'groq' ? 'GROQ_MODEL' : 'OPENAI_MODEL';
  const suggestions = available.slice(0, 3).join(', ');
  throw new ProviderError(
    `Your ${PROVIDER_META[provider].label} key works, but the model this app is set to use ` +
      `("${wanted}") is not available on your account — it has probably been retired. ` +
      `Set ${envVar} to a current model and restart.` +
      (suggestions ? ` Available to you, for example: ${suggestions}.` : ''),
    'refused'
  );
}

/**
 * Cheapest possible round-trip to confirm a key works, for the Settings
 * "your key works" check. Deliberately tiny — validating a key should not
 * cost the user a real generation.
 */
export async function validateKey(provider: ProviderId, apiKey: string): Promise<true> {
  try {
    switch (provider) {
      case 'anthropic': {
        const client = new Anthropic({ apiKey, maxRetries: 0 });
        await client.messages.create({
          model: MODELS.anthropic,
          max_tokens: 1,
          thinking: { type: 'disabled' },
          messages: [{ role: 'user', content: 'hi' }],
        });
        return true;
      }
      case 'gemini': {
        // models.get() rather than a one-token generation.
        //
        // The old probe asked gemini-2.5-flash to generate with
        // maxOutputTokens: 1. Gemini 2.5 models think before answering and
        // thinking is drawn from that same budget, so a 1-token cap is not a
        // cheap request — it is a malformed one, and it failed for reasons
        // that had nothing to do with the key being tested.
        //
        // This is free, generates nothing, and answers both questions at once:
        // is the key good, and is the configured model actually available to
        // it? A key that authenticates against a model this app cannot use is
        // not a working key.
        const ai = new GoogleGenAI({ apiKey });
        await ai.models.get({ model: MODELS.gemini });
        return true;
      }
      case 'groq': {
        // Listing models is a free, read-only auth check — and it also answers
        // the question the auth check alone does not: is the model this app is
        // configured to use still being served? A valid key plus a retired
        // model saved cleanly and then failed on the first real message, which
        // makes "your key works" a lie told at exactly the wrong moment.
        const models = await new Groq({ apiKey, maxRetries: 0 }).models.list();
        assertModelAvailable('groq', models.data?.map((m) => m.id) ?? []);
        return true;
      }
      case 'openai': {
        const models = await new OpenAI({ apiKey, maxRetries: 0 }).models.list();
        assertModelAvailable('openai', models.data?.map((m) => m.id) ?? []);
        return true;
      }
    }
  } catch (err) {
    if (provider === 'anthropic') throw normaliseAnthropicError(err);
    throw normaliseGenericError(err, PROVIDER_META[provider].label);
  }
}
