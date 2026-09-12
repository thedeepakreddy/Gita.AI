import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Envelope encryption for user-supplied provider API keys.
 *
 * THREAT MODEL — be honest about what this does and does not protect.
 *
 *   Protects against: a leaked or stolen database. Rows are useless without
 *   APP_ENCRYPTION_KEY, which lives in the environment, not the database.
 *
 *   Does NOT protect against: a compromised server. The application must be
 *   able to decrypt these keys in order to call the provider on the user's
 *   behalf, so this is emphatically NOT end-to-end/zero-knowledge encryption.
 *   Anyone who can run code on the server with the env var can read every key.
 *   Say this plainly to users rather than implying more than it delivers.
 *
 * AES-256-GCM is used (not CBC) so tampering is detected on decrypt rather
 * than silently producing garbage plaintext.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard nonce length

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

let cachedKey: Buffer | null = null;

/**
 * Loads the master key from the environment.
 *
 * Generate one with:  openssl rand -base64 32
 */
function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'APP_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` ' +
        'and add it to .env. Without it, API keys cannot be stored or read.'
    );
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `APP_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes (got ${key.length}). ` +
        'Generate one with `openssl rand -base64 32`.'
    );
  }

  cachedKey = key;
  return key;
}

/**
 * Additional authenticated data. Binds a ciphertext to the user and provider
 * it was created for, so a stolen row cannot be replayed into a different
 * user's record — decryption of a moved row fails instead of succeeding with
 * someone else's key.
 */
function aad(userId: string, provider: string): Buffer {
  return Buffer.from(`${userId}:${provider}`, 'utf8');
}

export function encryptSecret(
  plaintext: string,
  userId: string,
  provider: string
): EncryptedSecret {
  if (!plaintext) throw new Error('Refusing to encrypt an empty secret.');

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getMasterKey(), iv);
  cipher.setAAD(aad(userId, provider));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptSecret(
  record: EncryptedSecret,
  userId: string,
  provider: string
): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    getMasterKey(),
    Buffer.from(record.iv, 'base64')
  );
  decipher.setAAD(aad(userId, provider));
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Wrong master key, wrong user/provider, or tampered ciphertext. Do not
    // leak which — the distinction is useful to an attacker, not to the user.
    throw new Error('Stored key could not be decrypted. Please re-enter it in Settings.');
  }
}

/** Last 4 characters, for showing "…a1b2" without decrypting anything. */
export function keyHint(plaintext: string): string {
  return plaintext.slice(-4);
}

/**
 * What each provider's keys look like — for EXPLAINING a failure, never for
 * deciding one.
 *
 * READ THIS BEFORE TIGHTENING ANYTHING HERE. These patterns are a guess about
 * formats that providers change without telling anyone, and a wrong guess is
 * far more expensive than a missing one: it blocks a valid key with no way
 * round, while the cost of letting a bad key through is a single API call that
 * comes back "no". Google alone issues keys as `AIza…` (the long-standing
 * format) and `AQ.…` (the newer Cloud one), and there is no reason to believe
 * that list is finished.
 *
 * So: the provider is the authority. inspectKey() produces a *hint*; only
 * validateKey() decides. See src/app/api/keys/route.ts.
 */
const KEY_SHAPES: Record<
  string,
  { patterns: RegExp[]; prefixes: string[]; minLength: number }
> = {
  anthropic: {
    patterns: [/^sk-ant-[A-Za-z0-9_-]{20,}$/],
    prefixes: ['sk-ant-'],
    minLength: 27,
  },
  gemini: {
    patterns: [/^AIza[A-Za-z0-9_-]{30,}$/, /^AQ\.[A-Za-z0-9_-]{20,}$/],
    prefixes: ['AIza', 'AQ.'],
    minLength: 23,
  },
  groq: { patterns: [/^gsk_[A-Za-z0-9]{20,}$/], prefixes: ['gsk_'], minLength: 24 },
  // Anthropic keys also begin "sk-", so exclude them explicitly — pasting a
  // Claude key into the OpenAI field is an easy and confusing mistake.
  openai: {
    patterns: [/^sk-(?!ant-)[A-Za-z0-9_-]{20,}$/],
    prefixes: ['sk-'],
    minLength: 23,
  },
};

const matchesShape = (provider: string, key: string): boolean =>
  KEY_SHAPES[provider]?.patterns.some((p) => p.test(key)) ?? false;

/**
 * Characters a paste picks up that are invisible in an input box.
 *
 * Copying a key out of a web console or a chat message routinely drags along a
 * zero-width space, a non-breaking space, or the curly quotes some editors put
 * around it. The key then looks *exactly* right on screen and fails every
 * check, which is a genuinely maddening thing to debug by eye.
 */
const INVISIBLE = /[\u200B-\u200D\uFEFF\u00A0\u2060]/g;
const WRAPPING_QUOTES = /^["'\u2018\u2019\u201c\u201d`]+|["'\u2018\u2019\u201c\u201d`]+$/g;

/**
 * Cleans up what a paste actually delivered, without changing the key itself.
 *
 * Returns the cleaned key and whether anything had to be removed, so the caller
 * can say "we fixed your paste" rather than silently accepting something the
 * user did not type.
 */
export function normalisePastedKey(raw: string): { key: string; cleaned: boolean } {
  const key = raw.replace(INVISIBLE, '').replace(WRAPPING_QUOTES, '').trim();
  return { key, cleaned: key !== raw.trim() };
}

export type KeyShapeIssue =
  | 'empty'
  | 'unknown_provider'
  /** Looks like a different provider's key — the most useful thing to say. */
  | 'wrong_provider'
  | 'wrong_prefix'
  | 'too_short'
  | 'invalid_characters';

export type KeyInspection =
  | { ok: true }
  | {
      ok: false;
      issue: KeyShapeIssue;
      /** The provider whose format it DOES match, when that is the problem. */
      detectedProvider?: string;
      expectedPrefix?: string;
      minLength?: number;
      actualLength?: number;
    };

/**
 * Shape check — does NOT contact the provider.
 *
 * Reports *why* it failed, because "that key was not accepted" is useless
 * advice when nothing ever left the machine. Never echoes the key itself: the
 * answer travels through an API response and into a UI, and a secret should not
 * ride along in an error message.
 */
export function inspectKey(provider: string, key: string): KeyInspection {
  if (!key) return { ok: false, issue: 'empty' };

  const shape = KEY_SHAPES[provider];
  if (!shape) return { ok: false, issue: 'unknown_provider' };
  if (matchesShape(provider, key)) return { ok: true };

  // Is this another provider's key? Say so plainly — it is nearly always the
  // real explanation, and "check it and try again" will never get them there.
  for (const other of Object.keys(KEY_SHAPES)) {
    if (other !== provider && matchesShape(other, key)) {
      return { ok: false, issue: 'wrong_provider', detectedProvider: other };
    }
  }

  if (!shape.prefixes.some((prefix) => key.startsWith(prefix))) {
    return {
      ok: false,
      issue: 'wrong_prefix',
      expectedPrefix: shape.prefixes.join('” or “'),
    };
  }
  if (key.length < shape.minLength) {
    return {
      ok: false,
      issue: 'too_short',
      minLength: shape.minLength,
      actualLength: key.length,
    };
  }
  // Right prefix, long enough, still no match: something in the body is not a
  // character these keys contain.
  return { ok: false, issue: 'invalid_characters' };
}

/**
 * Shape check only — does not contact the provider. Catches the common paste
 * mistakes (whitespace, truncation, wrong provider) before a network call.
 */
export function looksLikeKey(provider: string, key: string): boolean {
  const k = key.trim();
  if (k !== key) return false; // stray whitespace from copy/paste
  return inspectKey(provider, k).ok;
}

/** Constant-time compare, for anywhere a secret is checked for equality. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
