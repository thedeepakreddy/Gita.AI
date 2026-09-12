import { decryptSecret } from '@/lib/crypto/secrets';
import { prisma } from '@/lib/db';

import { isProvider, type ProviderId } from './providers';

/**
 * Decides whose key pays for a given chat turn.
 *
 * NOTE — this deliberately reverses the original design, in which signing in
 * granted no AI usage at all. A trial allowance funded by the operator has to
 * be metered per account, and the account is established by Google sign-in, so
 * identity and quota are now connected. That was an explicit product decision,
 * not an accident: read `TRIAL` below before "restoring" the old separation.
 *
 * Order of preference:
 *   1. The user's own key — unlimited, and always preferred once present, so
 *      nobody burns operator credit they don't need to.
 *   2. The operator trial key — capped per account AND globally per day.
 *   3. Nothing: the caller must send the user to Settings.
 *
 * COST CONTROL. The trial spends the operator's money, so two independent
 * limits apply. The per-account limit stops one person draining it; the global
 * daily cap stops a burst of new accounts draining it in an afternoon. Neither
 * alone is sufficient — anyone with a Google account can create a new user.
 *
 * The cheapest safe configuration is a **free-tier Gemini or Groq key** as
 * TRIAL_API_KEY: the trial then costs nothing at all, and the provider's own
 * rate limits act as a third backstop.
 */

const TRIAL_PROVIDER_RAW = process.env.TRIAL_PROVIDER ?? '';
const TRIAL_API_KEY = process.env.TRIAL_API_KEY ?? '';

/** Messages one account may take from the trial pool, ever. */
export const TRIAL_MESSAGE_LIMIT = Math.max(
  0,
  Number(process.env.TRIAL_MESSAGE_LIMIT ?? 10) || 0
);

/**
 * Global ceiling on trial messages per calendar day, across all users.
 *
 * Default 200 deliberately sits *below* Gemini's free-tier daily request quota
 * (~250/day for Flash), so this cap trips first and the app can show a clear
 * message instead of the provider cutting you off mid-conversation with a 429.
 * Raise it if TRIAL_API_KEY is a paid key — but then it is real money, and this
 * number is the only thing bounding a bad day.
 */
const TRIAL_DAILY_CAP = Math.max(0, Number(process.env.TRIAL_DAILY_CAP ?? 200) || 0);

export const trialProvider: ProviderId | null = isProvider(TRIAL_PROVIDER_RAW)
  ? TRIAL_PROVIDER_RAW
  : null;

/** The trial is only live when a provider, a key and a non-zero limit all exist. */
export const trialConfigured = Boolean(
  trialProvider && TRIAL_API_KEY && TRIAL_MESSAGE_LIMIT > 0
);

export type ResolvedKey =
  | { source: 'user'; provider: ProviderId; apiKey: string; trialRemaining: number }
  | { source: 'trial'; provider: ProviderId; apiKey: string; trialRemaining: number };

export type ResolutionFailure =
  | 'no_key_and_trial_exhausted'
  | 'no_key_and_trial_unavailable'
  | 'key_undecryptable';

export type Resolution =
  | { ok: true; key: ResolvedKey }
  | { ok: false; reason: ResolutionFailure; trialRemaining: number };

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Trial messages this account has left. Zero when the trial is switched off. */
export async function trialRemainingFor(userId: string): Promise<number> {
  if (!trialConfigured) return 0;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trialMessagesUsed: true },
  });
  return Math.max(0, TRIAL_MESSAGE_LIMIT - (user?.trialMessagesUsed ?? 0));
}

async function dailyTrialSpendExceeded(): Promise<boolean> {
  if (TRIAL_DAILY_CAP === 0) return true;
  const used = await prisma.message.count({
    where: { usedTrialKey: true, createdAt: { gte: startOfToday() } },
  });
  return used >= TRIAL_DAILY_CAP;
}

export async function resolveKey(
  userId: string,
  requestedProvider?: string
): Promise<Resolution> {
  // Ordered newest-first so the implicit fallback is deterministic and matches
  // what the chat UI shows as the default. Unordered, "the user's first key"
  // was whatever the database happened to return.
  const stored = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });

  // 1. The user's own key wins whenever they have one.
  if (stored.length > 0) {
    const record =
      (requestedProvider &&
        isProvider(requestedProvider) &&
        stored.find((k) => k.provider === requestedProvider)) ||
      stored[0];

    const provider = record.provider as ProviderId;
    try {
      const apiKey = decryptSecret(record, userId, provider);
      return {
        ok: true,
        key: {
          source: 'user',
          provider,
          apiKey,
          trialRemaining: await trialRemainingFor(userId),
        },
      };
    } catch {
      return { ok: false, reason: 'key_undecryptable', trialRemaining: 0 };
    }
  }

  // 2. Fall back to the operator trial.
  if (!trialConfigured || !trialProvider) {
    return { ok: false, reason: 'no_key_and_trial_unavailable', trialRemaining: 0 };
  }

  const remaining = await trialRemainingFor(userId);
  if (remaining <= 0) {
    return { ok: false, reason: 'no_key_and_trial_exhausted', trialRemaining: 0 };
  }

  // The global cap is reported to the user as an exhausted trial rather than a
  // separate state: from their side the outcome is identical, and the fix is
  // the same — add your own key.
  if (await dailyTrialSpendExceeded()) {
    return { ok: false, reason: 'no_key_and_trial_exhausted', trialRemaining: remaining };
  }

  return {
    ok: true,
    key: {
      source: 'trial',
      provider: trialProvider,
      apiKey: TRIAL_API_KEY,
      trialRemaining: remaining,
    },
  };
}

/**
 * Charge one message to the account's trial allowance.
 *
 * Called only after a reply is successfully produced and stored — a failed
 * provider call must not consume someone's trial. The increment is atomic so
 * concurrent requests cannot both read the same starting value and overspend.
 */
export async function consumeTrialMessage(userId: string): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { trialMessagesUsed: { increment: 1 } },
    select: { trialMessagesUsed: true },
  });
  return Math.max(0, TRIAL_MESSAGE_LIMIT - user.trialMessagesUsed);
}
