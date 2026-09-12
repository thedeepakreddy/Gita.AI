import assert from 'node:assert/strict';
import test from 'node:test';

import { extractCitations, looksLikeDivineFirstPerson } from '../chat/prompt';
import {
  decryptSecret,
  encryptSecret,
  keyHint,
  looksLikeKey,
} from '../crypto/secrets';

/**
 * Tests for the two properties this project cannot get wrong: the app must
 * never speak as Krishna, and a user's API key must never be readable from a
 * stolen database row.
 *
 * Run with:  npm test
 */

// A key is required to construct any cipher; this is test-only.
process.env.APP_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');

test('voice guard: flags the app speaking as Krishna', () => {
  const violations = [
    'I am Krishna, and I tell you to act.',
    'I tell you, Arjuna: stand and fight.',
    'Arjuna, I counsel you to let go of the fruits.',
    'Surrender to me and you will be free.',
    'Take refuge in me alone.',
    'Worship me with devotion.',
    'I am the Supreme, beyond the perishable.',
  ];
  for (const text of violations) {
    assert.equal(looksLikeDivineFirstPerson(text), true, `should flag: ${text}`);
  }
});

test('voice guard: allows correct third-person explanation', () => {
  const allowed = [
    "Krishna's counsel in 2.47 speaks to this — he separates the action from its fruit.",
    'In 2.3 Krishna is direct with Arjuna, telling him to shake off faint-heartedness.',
    'I have three verses here that speak to what you described.',
    'I would point you to 2.7, where Arjuna admits his mind is confused.',
    'The verses I have do not address this directly.',
  ];
  for (const text of allowed) {
    assert.equal(looksLikeDivineFirstPerson(text), false, `should allow: ${text}`);
  }
});

test('voice guard: quoting scripture is not speaking as God', () => {
  // The whole point of the app is to quote and explain. A correctly attributed
  // quotation must not trip the guard, or the app cannot do its job.
  const quoted =
    'Krishna puts it plainly in 9.34: "Worship me, and unto me thou shalt come." ' +
    'He is describing devotion, not issuing a demand.';
  assert.equal(looksLikeDivineFirstPerson(quoted), false);
});

test('citation extraction: finds valid refs and rejects impossible ones', () => {
  assert.deepEqual(extractCitations('See 2.47 and also 18.66.').sort(), ['18.66', '2.47']);
  // Chapter 19 and verse 900 do not exist; version-like numbers must not leak in.
  assert.deepEqual(extractCitations('Version 19.900 of the library'), []);
  assert.deepEqual(extractCitations('no references here'), []);
  // Deduplicates repeats.
  assert.deepEqual(extractCitations('2.47 again 2.47'), ['2.47']);
});

test('secrets: round-trips a key', () => {
  const plaintext = 'sk-ant-abcdefghijklmnopqrstuvwxyz123456';
  const record = encryptSecret(plaintext, 'user-1', 'anthropic');
  assert.notEqual(record.ciphertext, plaintext);
  assert.equal(decryptSecret(record, 'user-1', 'anthropic'), plaintext);
});

test('secrets: a row moved to another user or provider will not decrypt', () => {
  // This is the AAD binding. Without it, a stolen row could be replayed into a
  // different account and would decrypt happily.
  const record = encryptSecret('sk-ant-secret-value-here-1234567890', 'user-1', 'anthropic');
  assert.throws(() => decryptSecret(record, 'user-2', 'anthropic'));
  assert.throws(() => decryptSecret(record, 'user-1', 'gemini'));
});

test('secrets: tampered ciphertext is rejected, not silently mangled', () => {
  const record = encryptSecret('sk-ant-secret-value-here-1234567890', 'user-1', 'anthropic');
  const bytes = Buffer.from(record.ciphertext, 'base64');
  bytes[0] ^= 0xff;
  const tampered = { ...record, ciphertext: bytes.toString('base64') };
  assert.throws(() => decryptSecret(tampered, 'user-1', 'anthropic'));
});

test('secrets: each encryption uses a fresh IV', () => {
  const a = encryptSecret('same-value-encrypted-twice-xxxxxx', 'user-1', 'gemini');
  const b = encryptSecret('same-value-encrypted-twice-xxxxxx', 'user-1', 'gemini');
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});

test('secrets: keyHint exposes only the last four characters', () => {
  assert.equal(keyHint('sk-ant-abcdefgh1234'), '1234');
});

test('key shape check: accepts each provider’s own format', () => {
  assert.equal(looksLikeKey('anthropic', 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaa'), true);
  assert.equal(looksLikeKey('gemini', 'AIzaSyAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), true);
  assert.equal(looksLikeKey('groq', 'gsk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), true);
  assert.equal(looksLikeKey('openai', 'sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaa'), true);
});

test('key shape check: OpenAI and Anthropic keys are not interchangeable', () => {
  // Both begin "sk-", so a naive prefix check would accept a Claude key in the
  // OpenAI field — the user would then get a confusing auth failure at chat
  // time instead of an immediate, obvious rejection here.
  assert.equal(looksLikeKey('openai', 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaa'), false);
  assert.equal(looksLikeKey('anthropic', 'sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaa'), false);
});

test('key shape check: rejects cross-provider pastes and sloppy copies', () => {
  assert.equal(looksLikeKey('anthropic', 'AIzaSyAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), false);
  assert.equal(looksLikeKey('gemini', 'gsk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), false);
  assert.equal(looksLikeKey('groq', 'AIzaSyAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), false);
  // Trailing whitespace from a sloppy copy/paste.
  assert.equal(looksLikeKey('gemini', 'AIzaSyAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa '), false);
  assert.equal(looksLikeKey('gemini', 'too-short'), false);
  // An unknown provider must never be waved through.
  assert.equal(looksLikeKey('mistral', 'sk-whatever-long-enough-to-pass-length'), false);
});
