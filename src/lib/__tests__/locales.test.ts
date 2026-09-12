import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { locales } from '@/i18n/locales';

/**
 * Message-key parity across locales.
 *
 * A key present in `en` but missing from `hu` renders as a raw key path — or
 * throws — for Hungarian users only, and nothing in the build catches it. The
 * message files are hand-edited in three places every time a string is added,
 * so this is the check that keeps them honest.
 */

type Messages = Record<string, unknown>;

function flatten(obj: Messages, prefix = ''): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue; // "_note" entries are documentation
    const path = `${prefix}${k}`;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const nested of flatten(v as Messages, `${path}.`)) keys.add(nested);
    } else {
      keys.add(path);
    }
  }
  return keys;
}

function load(locale: string): Set<string> {
  const file = join(process.cwd(), 'messages', `${locale}.json`);
  return flatten(JSON.parse(readFileSync(file, 'utf8')) as Messages);
}

test('every locale defines exactly the same message keys as en', () => {
  const base = load('en');
  assert.ok(base.size > 0, 'en.json should not be empty');

  for (const locale of locales) {
    if (locale === 'en') continue;
    const other = load(locale);

    const missing = [...base].filter((k) => !other.has(k)).sort();
    const extra = [...other].filter((k) => !base.has(k)).sort();

    assert.deepEqual(missing, [], `${locale}.json is missing keys: ${missing.join(', ')}`);
    assert.deepEqual(extra, [], `${locale}.json has keys absent from en: ${extra.join(', ')}`);
  }
});

test('no message value is left as an empty string', () => {
  for (const locale of locales) {
    const file = join(process.cwd(), 'messages', `${locale}.json`);
    const raw = readFileSync(file, 'utf8');
    assert.ok(
      !/:\s*""/.test(raw),
      `${locale}.json contains an empty string value — an untranslated placeholder`
    );
  }
});
