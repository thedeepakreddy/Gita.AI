import assert from 'node:assert/strict';
import test from 'node:test';

import { findDivineFirstPerson } from '../chat/prompt';
import { rateLimit } from '../http/rateLimit';
import { hasAtLeast, isAdminEmail, normaliseRole } from '../access/roles';
import { inspectKey, normalisePastedKey } from '../crypto/secrets';
import { providerMessage } from '../chat/providers';
import { BACKGROUNDS } from '../ui/backgrounds';
import { caveatKey, needsCaveat } from '../verses/confidence';
import { embed, embedBackend, embedderInfo, embeddingServiceHealthy } from '../retrieval/embedder';

/**
 * Covers the logic added for the handover: the audit trail the voice guard now
 * feeds, who may reach the review surface, and the limiter in front of the one
 * public endpoint that runs a model.
 *
 * Run with:  npm test
 */

// --- Voice guard, now reporting WHAT it caught -------------------------------

test('voice guard: reports which rule fired and the exact span', () => {
  const hit = findDivineFirstPerson('I tell you, Arjuna: stand and fight.');
  assert.ok(hit, 'should have caught this');
  assert.match(hit.matched, /I tell you,? Arjuna/i);
  assert.ok(hit.pattern.length > 0, 'pattern source is what makes the log actionable');
});

test('voice guard: a clean reply yields no hit', () => {
  assert.equal(
    findDivineFirstPerson(
      "Krishna's counsel in 2.47 separates the action from its fruit."
    ),
    null
  );
});

test('voice guard: a quotation is still not a violation', () => {
  // The whole point of the strip step — an attributed quote is not the app
  // speaking. If this regresses, every correctly-cited answer gets refused.
  assert.equal(
    findDivineFirstPerson(
      'Krishna says, in 9.34, "worship me with devotion" — the verse is about where attention rests.'
    ),
    null
  );
});

// --- Who may review ---------------------------------------------------------

test('roles: rank ordering is what gates the admin surface', () => {
  assert.equal(hasAtLeast('admin', 'reviewer'), true);
  assert.equal(hasAtLeast('reviewer', 'reviewer'), true);
  assert.equal(hasAtLeast('reviewer', 'admin'), false);
  assert.equal(hasAtLeast('user', 'reviewer'), false);
});

test('roles: an unknown or missing role is never elevated', () => {
  for (const value of [null, undefined, '', 'superuser', 'ADMIN']) {
    assert.equal(normaliseRole(value as string | null), 'user', `should not elevate: ${value}`);
  }
});

test('roles: ADMIN_EMAILS is matched case-insensitively and ignores spacing', () => {
  process.env.ADMIN_EMAILS = ' Temple@example.org , second@example.org ';
  assert.equal(isAdminEmail('temple@example.org'), true);
  assert.equal(isAdminEmail('TEMPLE@EXAMPLE.ORG'), true);
  assert.equal(isAdminEmail('second@example.org'), true);
  assert.equal(isAdminEmail('someone@example.org'), false);
  assert.equal(isAdminEmail(null), false);
  assert.equal(isAdminEmail(''), false);
  delete process.env.ADMIN_EMAILS;
});

test('roles: with ADMIN_EMAILS unset nobody is an admin by email', () => {
  delete process.env.ADMIN_EMAILS;
  assert.equal(isAdminEmail('anyone@example.org'), false);
});

// --- Rate limiting ----------------------------------------------------------

test('rate limit: allows up to the limit, then refuses', () => {
  const key = `test-${Math.random()}`;
  for (let i = 0; i < 3; i++) {
    assert.equal(rateLimit(key, 3, 60_000).ok, true, `request ${i + 1} should pass`);
  }
  const blocked = rateLimit(key, 3, 60_000);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds >= 1, 'client needs to be told how long to wait');
});

test('rate limit: separate keys do not share a budget', () => {
  const a = `a-${Math.random()}`;
  const b = `b-${Math.random()}`;
  rateLimit(a, 1, 60_000);
  assert.equal(rateLimit(a, 1, 60_000).ok, false);
  assert.equal(rateLimit(b, 1, 60_000).ok, true, 'one caller must not lock out another');
});

test('rate limit: a new window restores the budget', async () => {
  const key = `window-${Math.random()}`;
  assert.equal(rateLimit(key, 1, 20).ok, true);
  assert.equal(rateLimit(key, 1, 20).ok, false);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(rateLimit(key, 1, 20).ok, true);
});

// --- Key shape diagnostics --------------------------------------------------
//
// These matter because the failure they describe is one the user cannot see.
// "That key was not accepted by the provider" was shown for a check that never
// contacts the provider, which sent people re-checking a key that was fine.

test('key shape: a well-formed key of each provider passes', () => {
  const good: [string, string][] = [
    ['gemini', 'AIza' + 'B'.repeat(35)],
    ['groq', 'gsk_' + 'a'.repeat(48)],
    ['openai', 'sk-' + 'a'.repeat(40)],
    ['anthropic', 'sk-ant-' + 'a'.repeat(40)],
  ];
  for (const [provider, key] of good) {
    assert.equal(inspectKey(provider, key).ok, true, `${provider} should pass`);
  }
});

test('key shape: another provider’s key is named, not just refused', () => {
  // The single most useful thing this can say. "Check it and try again" will
  // never get someone from a Groq key in the Gemini box to the right answer.
  const result = inspectKey('gemini', 'gsk_' + 'a'.repeat(48));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.issue, 'wrong_provider');
  assert.equal(result.ok === false && result.detectedProvider, 'groq');
});

test('key shape: a wrong prefix reports every accepted one', () => {
  // Not "AQ." — that IS a Google format, and using it here was the same
  // mistake the validator itself made: assuming one vendor, one prefix.
  const result = inspectKey('gemini', 'ya29.' + 'x'.repeat(40));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.issue, 'wrong_prefix');
  const expected = String(result.ok === false && result.expectedPrefix);
  assert.match(expected, /AIza/);
  assert.match(expected, /AQ\./);
});

test('key shape: a truncated key reports both lengths', () => {
  const result = inspectKey('gemini', 'AIza' + 'x'.repeat(10));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.issue, 'too_short');
  assert.equal(result.ok === false && result.actualLength, 14);
  assert.ok(result.ok === false && (result.minLength ?? 0) > 14);
});

test('key shape: an inspection never echoes the key back', () => {
  // The result travels through an API response into a UI. A secret must not
  // ride along in an error message.
  const secret = 'AIza' + 'S3CR3T'.repeat(6);
  const serialised = JSON.stringify(inspectKey('gemini', secret.slice(0, 12)));
  assert.ok(!serialised.includes('S3CR3T'), 'key material leaked into the result');
});

test('paste cleanup: invisible characters inside the key are removed', () => {
  const real = 'AIza' + 'B'.repeat(35);
  const cases: [label: string, pasted: string][] = [
    ['zero-width space', 'AIza\u200B' + 'B'.repeat(35)],
    ['non-breaking space', 'AIza\u00A0' + 'B'.repeat(35)],
    ['word joiner', 'AIza\u2060' + 'B'.repeat(35)],
    ['curly quotes around it', '\u201c' + real + '\u201d'],
  ];
  for (const [label, pasted] of cases) {
    const { key, cleaned } = normalisePastedKey(pasted);
    assert.equal(key, real, `${label} should be cleaned away`);
    assert.equal(cleaned, true, `${label} should be reported as cleaned`);
  }
});

test('paste cleanup: ordinary surrounding whitespace is trimmed, not "cleaned"', () => {
  // Trimming a stray space is not worth telling anyone about; only characters
  // they could not have seen are. A BOM counts as whitespace to trim(), so it
  // falls in this group too.
  const real = 'AIza' + 'B'.repeat(35);
  for (const pasted of [`  ${real}  `, `\n${real}\n`, `\uFEFF${real}`]) {
    const { key, cleaned } = normalisePastedKey(pasted);
    assert.equal(key, real);
    assert.equal(cleaned, false, 'trimming alone should not be announced');
  }
});

test('paste cleanup: a clean key is reported as untouched', () => {
  const real = 'AIza' + 'B'.repeat(35);
  const { key, cleaned } = normalisePastedKey(real);
  assert.equal(key, real);
  assert.equal(cleaned, false, 'nothing was wrong, so do not claim we fixed it');
});

test('key shape: Google’s newer AQ. format is recognised too', () => {
  // The bug this test exists for: only `AIza…` was accepted, so a valid key in
  // Google's newer Cloud format was refused in ~20ms with a message blaming
  // the provider — which had never been asked.
  assert.equal(inspectKey('gemini', 'AQ.' + 'a'.repeat(40)).ok, true);
  assert.equal(inspectKey('gemini', 'AIza' + 'B'.repeat(35)).ok, true);
});

test('key shape: an unknown format is a hint, never a verdict', () => {
  // A format nobody here has seen must still be *reportable* — but the route
  // sends it to the provider anyway. This asserts the shape layer stays
  // purely descriptive: it names a problem and offers no way to refuse.
  const result = inspectKey('gemini', 'zz-' + 'a'.repeat(40));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.issue, 'wrong_prefix');
  // Both accepted prefixes are offered, not just the first.
  assert.match(String(result.ok === false && result.expectedPrefix), /AIza/);
  assert.match(String(result.ok === false && result.expectedPrefix), /AQ\./);
});

// --- Provider errors --------------------------------------------------------
//
// "Unexpected error calling Google Gemini." was what a user saw when the key
// they pasted was rejected. The provider had said exactly what was wrong; the
// normaliser dropped it on the floor. This whole code path exists to find out
// what the provider says, so the message has to survive whatever else happens.

test('provider errors: the message inside a JSON envelope is unwrapped', () => {
  // Google's SDK puts the useful sentence two levels down inside Error.message.
  const err = new Error(
    'got status: 400 Bad Request. {"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}'
  );
  assert.equal(providerMessage(err), 'API key not valid. Please pass a valid API key.');
});

test('provider errors: a top-level message field is also found', () => {
  const err = new Error('{"message":"Request had invalid authentication credentials."}');
  assert.equal(providerMessage(err), 'Request had invalid authentication credentials.');
});

test('provider errors: plain text survives untouched', () => {
  assert.equal(providerMessage(new Error('  connect ECONNREFUSED  ')), 'connect ECONNREFUSED');
});

test('provider errors: unparseable JSON falls back to the raw text', () => {
  const raw = 'got status: 500. {this is not json';
  assert.equal(providerMessage(new Error(raw)), raw);
});

test('provider errors: a non-Error throw is still reported', () => {
  assert.equal(providerMessage('something odd happened'), 'something odd happened');
});

test('provider errors: a retired model is recognised from Google’s own wording', () => {
  // The exact sentence that cost an afternoon. "no longer available" is the
  // phrasing that actually appears; matching only /not found/ missed it, and
  // the user got "Unexpected error" for a completely diagnosable problem.
  const real =
    'This model models/gemini-2.5-flash is no longer available to new users. ' +
    'Please update your code to use models/gemini-3.6-flash for the latest features and improvements.';
  assert.match(providerMessage(new Error(real)), /no longer available to new users/);
  assert.match(
    real,
    /not found|does not exist|unsupported|not supported|no longer available|deprecated|decommissioned|retired/i,
    'the retirement pattern in normaliseGenericError must match this wording'
  );
});

// --- Background artwork provenance ------------------------------------------
//
// The point of these is not that they pass today. It is that adding an image
// without saying where it came from fails CI rather than shipping quietly to a
// temple. The previous set was seven files from stock sites and Reddit with no
// rights metadata at all, and nothing in the codebase objected.

test('backgrounds: every image declares complete provenance', () => {
  assert.ok(BACKGROUNDS.length > 0, 'there should be at least one background');
  for (const bg of BACKGROUNDS) {
    for (const field of ['title', 'artist', 'date', 'holder', 'credit', 'url', 'licence'] as const) {
      assert.ok(
        typeof bg[field] === 'string' && bg[field].trim().length > 0,
        `${bg.src} is missing ${field}`
      );
    }
  }
});

test('backgrounds: every licence is an open one', () => {
  // Narrow on purpose. "Probably fine" and "found on a site that did not say
  // otherwise" are not licences, and this is the line where that gets caught.
  for (const bg of BACKGROUNDS) {
    assert.match(
      bg.licence,
      /^(CC0|Public domain|CC BY(-SA)? )/i,
      `${bg.src} has a licence this project does not accept: ${bg.licence}`
    );
  }
});

test('backgrounds: every credit links somewhere checkable', () => {
  for (const bg of BACKGROUNDS) {
    assert.match(bg.url, /^https:\/\//, `${bg.src} has no verifiable source URL`);
  }
});

test('backgrounds: sources are unique, so the slideshow cannot repeat itself', () => {
  const seen = new Set(BACKGROUNDS.map((b) => b.src));
  assert.equal(seen.size, BACKGROUNDS.length, 'duplicate background src');
});

// --- Translation confidence -------------------------------------------------
//
// The bug this guards: the caveat condition was written by hand as
// `status === 'placeholder'` in four separate files. When a third status
// arrived, all four silently stopped matching, and 656 verses of unreviewed OCR
// draft rendered to Hungarian readers looking exactly like finished scripture.

test('confidence: only reviewed text is shown without a caveat', () => {
  assert.equal(needsCaveat('reviewed'), false);
  assert.equal(caveatKey('reviewed'), null);
});

test('confidence: an in-review draft is marked as a draft, not as a placeholder', () => {
  assert.equal(needsCaveat('in-review'), true);
  assert.equal(caveatKey('in-review'), 'inReviewData');
});

test('confidence: a placeholder is marked as a placeholder', () => {
  assert.equal(needsCaveat('placeholder'), true);
  assert.equal(caveatKey('placeholder'), 'placeholderData');
});

test('confidence: an unknown or missing status is never treated as reviewed', () => {
  // The failure direction that matters. Anything unrecognised must fall to the
  // cautious side, because the cost of a missing caveat is scripture presented
  // as verified when it is not.
  for (const status of [undefined, null, '', 'approved', 'REVIEWED', 'final']) {
    assert.equal(
      needsCaveat(status as never),
      true,
      `status ${JSON.stringify(status)} must still require a caveat`
    );
  }
});

test('confidence: every caveat key exists in every locale', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const locale of ['en', 'hu', 'hi']) {
    const msgs = JSON.parse(await readFile(`messages/${locale}.json`, 'utf8'));
    for (const key of ['placeholderData', 'inReviewData']) {
      assert.ok(
        msgs.disclaimer?.[key]?.trim(),
        `${locale} is missing disclaimer.${key} — the caveat would render blank`
      );
    }
  }
});

// --- Retrieval can be switched off safely -----------------------------------
//
// On a small instance, loading the encoder does not fail the request — it
// OOM-kills the process and takes /study and the review queue down with it.
// One person opening /search would fell the whole site. So a deployment that
// cannot afford the model must refuse BEFORE touching it.

test('embedder: an unknown backend value falls back to local, never to nothing', () => {
  const original = process.env.EMBED_BACKEND;
  for (const value of [undefined, '', 'LOCAL', 'nonsense']) {
    if (value === undefined) delete process.env.EMBED_BACKEND;
    else process.env.EMBED_BACKEND = value;
    assert.equal(embedBackend(), 'local', `${JSON.stringify(value)} should mean local`);
  }
  if (original === undefined) delete process.env.EMBED_BACKEND;
  else process.env.EMBED_BACKEND = original;
});

test('embedder: disabled refuses without loading the model', async () => {
  const original = process.env.EMBED_BACKEND;
  process.env.EMBED_BACKEND = 'disabled';
  try {
    assert.equal(embedBackend(), 'disabled');

    const started = Date.now();
    await assert.rejects(() => embed(['anything']), /switched off on this deployment/);
    // Loading the encoder takes seconds; refusing must be immediate. If this
    // ever starts taking real time, something is touching the model first.
    assert.ok(Date.now() - started < 500, 'refusal must not load the model');

    assert.equal(await embeddingServiceHealthy(), false);
    assert.equal((embedderInfo() as { backend: string }).backend, 'disabled');
  } finally {
    if (original === undefined) delete process.env.EMBED_BACKEND;
    else process.env.EMBED_BACKEND = original;
  }
});

test('embedder: an empty input is still cheap when disabled', async () => {
  const original = process.env.EMBED_BACKEND;
  process.env.EMBED_BACKEND = 'disabled';
  try {
    assert.deepEqual(await embed([]), []);
  } finally {
    if (original === undefined) delete process.env.EMBED_BACKEND;
    else process.env.EMBED_BACKEND = original;
  }
});
