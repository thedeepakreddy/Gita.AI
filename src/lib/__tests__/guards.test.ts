import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildVerseContext,
  extractCitations,
  isSmallTalk,
  looksLikeDivineFirstPerson,
  requestedCitations,
  retrievalQuery,
  unsupportedCitations,
} from '../chat/prompt';
import type { SearchHit } from '../retrieval/search';
import {
  decryptSecret,
  encryptSecret,
  keyHint,
  looksLikeKey,
} from '../crypto/secrets';
import { CHAT_WALLPAPERS } from '../ui/chatWallpapers';

/**
 * Tests for the two properties this project cannot get wrong: the app must
 * never speak as Krishna, and a user's API key must never be readable from a
 * stolen database row.
 *
 * Run with:  npm test
 */

// A key is required to construct any cipher; this is test-only.
process.env.APP_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');

test('chat gallery: all ten epic artworks exist locally', () => {
  assert.equal(CHAT_WALLPAPERS.length, 10);
  for (const wallpaper of CHAT_WALLPAPERS) {
    assert.ok(existsSync(join(process.cwd(), 'public', wallpaper.src)), wallpaper.src);
  }
});

test('voice guard: flags the app speaking as Krishna', () => {
  const violations = [
    'I am Krishna, and I tell you to act.',
    'I tell you, Arjuna: stand and fight.',
    'Arjuna, I counsel you to let go of the fruits.',
    'Surrender to me and you will be free.',
    'Take refuge in me alone.',
    'Worship me with devotion.',
    'I am the Supreme, beyond the perishable.',
    'मैं कृष्ण हूँ और तुम्हें मार्ग दिखाता हूँ।',
    'मेरी शरण लो।',
    'Én vagyok Krisna, hallgass rám.',
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

test('chat retrieval: explicit verse references are anchored and bounded', () => {
  assert.deepEqual(requestedCitations('What does Gita 2.47 teach?'), ['2.47']);
  assert.deepEqual(requestedCitations('Explain chapter 2 verse 47 and 18.66'), ['18.66', '2.47']);
  assert.deepEqual(requestedCitations('अध्याय 2 श्लोक 47 का अर्थ?'), ['2.47']);
  assert.deepEqual(requestedCitations('No verse is named here.'), []);
});

test('chat grounding: empty locale translation falls back to the retrieved text', () => {
  const hit = {
    chapter: 2,
    verse: 47,
    text: 'You have a right to action, not to its fruits.',
    verse_data: { translations: { hi: '' } },
  } as SearchHit;
  assert.match(buildVerseContext([hit], 'hi'), /\[2\.47\] You have a right to action/);
});

test('chat grounding: unsupported verse citations are rejected', () => {
  const supplied = [{ chapter: 2, verse: 47 }] as SearchHit[];
  assert.deepEqual(unsupportedCitations('See 2.47 and 18.66.', supplied), ['18.66']);
  assert.deepEqual(unsupportedCitations('See 2.47.', supplied), []);
});

test('chat retrieval: greetings skip verse search, follow-ups retain question context', () => {
  assert.equal(isSmallTalk('नमस्ते!'), true);
  assert.equal(isSmallTalk('I am afraid of a decision.'), false);
  const history = [{ role: 'user' as const, content: 'I am afraid to change jobs.' }];
  assert.match(retrievalQuery('What about that?', history), /afraid to change jobs/);
  assert.equal(retrievalQuery('I feel calmer now.', history), 'I feel calmer now.');
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
