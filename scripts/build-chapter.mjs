#!/usr/bin/env node
/**
 * Builds chapter JSON files for /data/verses from public sources.
 *
 *   node scripts/build-chapter.mjs --all           # all 18 chapters
 *   node scripts/build-chapter.mjs --chapter 2     # one chapter
 *   node scripts/build-chapter.mjs --all --force   # rebuild existing files
 *   node scripts/build-chapter.mjs --repair        # clean existing files, no network
 *
 * Sources, and why each was chosen:
 *
 *   Devanagari + IAST — vedicscriptures.github.io
 *     The Sanskrit text of the Gita is ancient and not under copyright. This
 *     source is used because it is verse-mapped, modern-orthography and
 *     internally consistent, which the 1922 scan below is not.
 *
 *   English — Annie Besant, "Bhagavad-Gita", 4th ed. 1922, via Wikisource.
 *     Public domain on both counts that matter: published pre-1929 (US) and
 *     Besant died in 1933, so life+70 expired in 2003 (EU/Hungary).
 *     Deliberately NOT Prabhupada/BBT, which is in copyright and would need
 *     separate written permission from the BBT.
 *
 * ALIGNMENT SAFETY
 *   Sanskrit and English come from two independent sources, so a numbering
 *   disagreement would silently pair verse N's Sanskrit with verse N+1's
 *   English. Two guards prevent that:
 *     1. English is numbered off the Devanagari verse terminator ("॥ १४ ॥"),
 *        which is the same numbering the Sanskrit source uses. The printed
 *        "(N)" markers are ignored entirely — the 1922 scan mislabels and
 *        drops them (see fetchBesant);
 *     2. the parsed count is checked against the Sanskrit source's own
 *        verses_count, and the build fails loudly on mismatch.
 *
 * Everything written here is marked status:"placeholder" — it stands in until
 * a reviewed translation is approved.
 */

import { mkdir, readFile, readdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const SCRIPTURE = 'bhagavad-gita';
const CHAPTER_COUNT = 18;
const DEVANAGARI = /[ऀ-ॿ]/;

const UA = 'gita-counsel-dataset-builder/0.1 (non-commercial study app)';
const PACE_MS = 200; // deliberate: both APIs rate-limit on bursts

const args = process.argv.slice(2);
const wantAll = args.includes('--all');
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const repairMode = args.includes('--repair');
const chapterArg = args.indexOf('--chapter');
const chapters = wantAll
  ? Array.from({ length: CHAPTER_COUNT }, (_, i) => i + 1)
  : [Number(chapterArg >= 0 ? args[chapterArg + 1] : 2)];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Everything after a discourse's closing verse: the colophon, and in the 1922
 * scan the footnote apparatus that follows it.
 *
 * This matters more than it looks. English accumulates against the last
 * Devanagari verse terminator seen, so every line after the final verse — the
 * colophon, the footnotes, the page furniture — lands inside that verse. It
 * passes every alignment guard, because the count is right and each verse has
 * text; the text is simply wrong. The last verse of 17 of 18 chapters carried
 * up to 2,900 characters of editorial matter this way, and those verses went
 * into the vector index with it.
 *
 * The colophon is the reliable boundary: Besant opens every one of them the
 * same way, and nothing before it is apparatus.
 */
/**
 * Translation fields on the Sanskrit API that must NEVER be ingested.
 *
 * vedicscriptures.github.io serves the Devanagari and the IAST — which is why
 * this builder calls it — but the SAME response also carries a dozen modern
 * translations, including `prabhu.et`: A.C. Bhaktivedanta Swami Prabhupada's,
 * published by the Bhaktivedanta Book Trust and firmly in copyright.
 *
 * It is one property access away from the code below, it is the translation an
 * ISKCON project is most tempted to reach for, and taking it would need written
 * permission from the BBT. So the temptation is named and refused in code
 * rather than left to whoever edits this file next at 2am.
 *
 * If the temple OBTAINS that permission, this is the right place to lift the
 * ban deliberately — with the permission reference recorded in the licence
 * field, not by quietly deleting a constant.
 */
const FORBIDDEN_TRANSLATION_FIELDS = {
  prabhu: 'A.C. Bhaktivedanta Swami Prabhupada / Bhaktivedanta Book Trust — in copyright',
  tej: 'Swami Tejomayananda / Chinmaya Mission — in copyright',
  rams: 'Swami Ramsukhdas / Gita Press — in copyright',
  chinmay: 'Swami Chinmayananda / Chinmaya Mission — in copyright',
  adi: 'Swami Adidevananda / Advaita Ashrama — in copyright',
  gambir: 'Swami Gambirananda / Advaita Ashrama — in copyright',
};

/**
 * Call before using any field of a Sanskrit-API response as translation text.
 * Fails the build loudly; a copyright problem discovered after a temple has
 * published the app is not a problem you get to fix quietly.
 */
function assertIngestable(field) {
  const reason = FORBIDDEN_TRANSLATION_FIELDS[field];
  if (reason) {
    throw new Error(
      `Refusing to ingest "${field}": ${reason}.\n` +
        '  See README, "Where the text comes from". If permission has been obtained,\n' +
        '  remove it from FORBIDDEN_TRANSLATION_FIELDS deliberately and record the\n' +
        '  permission reference in translation_meta.license.'
    );
  }
  return field;
}

const COLOPHON = /\s*Thus in the (?:glorious )?Upanishad[\s\S]*$/;

function stripApparatus(text) {
  return text.replace(COLOPHON, '').trim();
}

async function getJson(url, tries = 5) {
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) return JSON.parse(text);
      lastErr = new Error(`${res.status} ${res.statusText}: ${text.slice(0, 80)}`);
    } catch (err) {
      lastErr = err;
    }
    await sleep(1500 * (attempt + 1)); // linear backoff
  }
  throw new Error(`Failed after ${tries} tries — ${url}\n  ${lastErr?.message}`);
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** "१४" -> 14. Devanagari digits are U+0966–U+096F. */
function devanagariToInt(s) {
  let n = 0;
  for (const ch of s) n = n * 10 + (ch.codePointAt(0) - 0x0966);
  return n;
}

const cleanLines = (s) =>
  String(s ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
    .trim();

/** Devanagari + IAST for one verse. */
async function fetchSanskrit(ch, v) {
  const d = await getJson(`https://vedicscriptures.github.io/slok/${ch}/${v}`);
  return { sanskrit: cleanLines(d.slok), transliteration: cleanLines(d.transliteration) };
}

/** The Sanskrit source's own verse count, used as the alignment authority. */
async function fetchExpectedCount(ch) {
  const d = await getJson(`https://vedicscriptures.github.io/chapter/${ch}`);
  return Number(d.verses_count);
}

/**
 * Besant's English for a whole discourse, keyed by verse number.
 *
 * Layout per verse is: <devanagari lines ending "॥ N ॥"> → <english lines> → "(N)".
 *
 * The trailing "(N)" markers are NOT used to number verses — the 1922 print
 * mislabels and drops them. Discourse 18 is the proof: verse 14's English is
 * marked "(15)" (so 15 appears twice), and verse 32's marker is missing
 * entirely, so the markers run 13, 15, 15, 16 … 31, 33. Numbering off them
 * silently shifts English against Sanskrit.
 *
 * The Devanagari verse terminator "॥ १४ ॥" is the reliable anchor, and it is
 * the same numbering the Sanskrit source uses — which is precisely the join
 * key we need. Markers are ignored as noise; English accumulates against
 * whichever Devanagari verse number was last seen. Text before verse 1's
 * terminator (the page header) belongs to no verse and is dropped.
 */
async function fetchBesant(ch, expectedCount) {
  const page = `Bhagavad-Gita (Besant 4th)/Discourse ${ch}`;
  const url =
    'https://en.wikisource.org/w/api.php?action=parse' +
    `&page=${encodeURIComponent(page)}&prop=text&format=json&formatversion=2`;
  const parsed = await getJson(url);
  if (parsed.error) throw new Error(`Wikisource: ${parsed.error.code} for "${page}"`);

  const lines = decodeEntities(
    parsed.parse.text
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<sup[\s\S]*?<\/sup>/g, '')
      .replace(/<table[\s\S]*?<\/table>/g, '')
      .replace(/<[^>]+>/g, '\n')
  )
    .replace(/[​‌‍﻿]/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const byVerse = new Map();
  let current = null; // Devanagari verse number currently being read
  let buffer = [];

  const flush = () => {
    if (current == null) {
      buffer = [];
      return;
    }
    const english = stripApparatus(
      buffer
        .join(' ')
        .replace(/\s+/g, ' ')
        // Page breaks orphan punctuation from the preceding word once rejoined.
        .replace(/\s+([.,;:!?])/g, '$1')
        .trim()
    );
    if (english) {
      // A dropped marker can merge two verses' English into one run; keep the
      // first binding rather than overwriting.
      byVerse.set(current, byVerse.has(current) ? byVerse.get(current) : english);
    }
    buffer = [];
  };

  for (const line of lines) {
    // "॥ १४ ॥" — the authoritative verse number, in Devanagari numerals.
    const terminator = line.match(/॥\s*([०-९]+)\s*॥/);
    if (terminator) {
      flush(); // what we have belongs to the *previous* verse
      current = devanagariToInt(terminator[1]);
      continue;
    }

    // Skip Sanskrit continuation lines and the unreliable "(N)" markers.
    if (DEVANAGARI.test(line)) continue;
    if (/^\(?\s*\d+(?:\s*[-–—]\s*\d+)?\s*\)?$/.test(line) && /[()]/.test(line)) continue;

    buffer.push(line);
  }
  flush();

  if (byVerse.size !== expectedCount) {
    const missing = [];
    for (let v = 1; v <= expectedCount; v++) if (!byVerse.has(v)) missing.push(v);
    throw new Error(
      `Chapter ${ch}: parsed ${byVerse.size} English verses but the Sanskrit source ` +
        `reports ${expectedCount}. Missing: ${missing.join(', ') || 'none'}. ` +
        `Refusing to build — Sanskrit and English would be misaligned.`
    );
  }

  return byVerse;
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function buildChapter(ch, titles) {
  const outDir = join(PROJECT_ROOT, 'data', 'verses', SCRIPTURE);
  const outFile = join(outDir, `chapter-${String(ch).padStart(2, '0')}.json`);

  if (!force && !dryRun && (await exists(outFile))) {
    console.log(`Chapter ${ch}: exists, skipping (use --force to rebuild)`);
    return null;
  }

  const expectedCount = await fetchExpectedCount(ch);
  const english = await fetchBesant(ch, expectedCount);
  process.stdout.write(`Chapter ${String(ch).padStart(2)}: ${expectedCount} verses `);

  const verses = [];
  for (let v = 1; v <= expectedCount; v++) {
    const { sanskrit, transliteration } = await fetchSanskrit(ch, v);
    verses.push({
      id: `${SCRIPTURE}:${ch}:${v}`,
      scripture: SCRIPTURE,
      chapter: ch,
      verse: v,
      sanskrit,
      transliteration,
      // Intentionally empty: every readily available word-gloss set for the
      // Gita is still in copyright. These need authoring or licensing.
      word_meanings: [],
      translations: { en: english.get(v) },
      translation_meta: {
        en: {
          status: 'placeholder',
          translator: 'Annie Besant',
          source: 'Bhagavad-Gita, 4th ed. (1922), via English Wikisource',
          license: 'public-domain',
        },
      },
    });
    if (v % 20 === 0) process.stdout.write('.');
    await sleep(PACE_MS);
  }

  const t = titles[String(ch)] ?? {};
  const doc = {
    scripture: SCRIPTURE,
    chapter: ch,
    title: { en: t.en, hu: t.hu, hi: t.hi },
    titleSanskrit: t.sa ?? null,
    sourceLanguage: 'sa',
    script: 'Devanagari',
    sources: {
      sanskrit: 'vedicscriptures.github.io (public-domain source text)',
      transliteration: 'vedicscriptures.github.io (IAST)',
      translations: { en: 'Annie Besant, Bhagavad-Gita 4th ed. (1922) — public domain' },
    },
    generatedAt: new Date().toISOString(),
    verses,
  };

  validate(doc, expectedCount);

  if (dryRun) {
    console.log(' [dry run]');
    return doc;
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log(` ok → chapter-${String(ch).padStart(2, '0')}.json`);
  return doc;
}

function validate(doc, expectedCount) {
  const problems = [];
  if (doc.verses.length !== expectedCount)
    problems.push(`expected ${expectedCount} verses, got ${doc.verses.length}`);
  doc.verses.forEach((v, i) => {
    if (v.verse !== i + 1) problems.push(`position ${i + 1}: verse number is ${v.verse}`);
    if (!v.sanskrit || !DEVANAGARI.test(v.sanskrit)) problems.push(`${v.id}: missing Devanagari`);
    if (!v.transliteration) problems.push(`${v.id}: missing transliteration`);
    const en = v.translations.en;
    if (!en || en.length < 10) problems.push(`${v.id}: missing/short English`);
    if (en && DEVANAGARI.test(en)) problems.push(`${v.id}: Devanagari leaked into English`);
  });
  if (problems.length) {
    console.error(`\nValidation failed for chapter ${doc.chapter}:`);
    for (const p of problems.slice(0, 15)) console.error('  ✗', p);
    throw new Error(`${problems.length} problem(s) in chapter ${doc.chapter}`);
  }
}

/**
 * Applies stripApparatus() to the chapter files already on disk.
 *
 * A repair rather than a rebuild: the Sanskrit, the transliteration and the
 * verse alignment are all correct: only trailing editorial matter is wrong, and
 * re-fetching 701 verses over two rate-limited APIs to fix it would be
 * needlessly destructive.
 */
async function repair() {
  const dir = join(PROJECT_ROOT, 'data', 'verses', SCRIPTURE);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();

  let changed = 0;
  let removed = 0;

  for (const file of files) {
    const path = join(dir, file);
    const doc = JSON.parse(await readFile(path, 'utf8'));
    let touched = 0;

    for (const verse of doc.verses) {
      for (const [locale, text] of Object.entries(verse.translations ?? {})) {
        if (typeof text !== 'string') continue;
        const cleaned = stripApparatus(text);
        if (cleaned === text) continue;
        if (!cleaned) {
          console.error(`  ✗ ${verse.id} [${locale}]: cleaning would empty it — left alone`);
          continue;
        }
        removed += text.length - cleaned.length;
        verse.translations[locale] = cleaned;
        touched++;
        console.log(`  ${verse.chapter}.${verse.verse} [${locale}]  ${text.length} -> ${cleaned.length} chars`);
      }
    }

    if (touched === 0) continue;
    changed++;
    if (!dryRun) await writeFile(path, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  }

  console.log(
    `\n${dryRun ? '[dry run] would clean' : 'Cleaned'} ${changed} file(s), ` +
      `${removed.toLocaleString()} characters of apparatus removed.`
  );
  if (!dryRun && changed > 0) {
    console.log('Re-embed, or retrieval keeps matching the removed text:  npm run embed:index');
  }
}

async function main() {
  if (repairMode) return repair();

  const titles = JSON.parse(
    await readFile(join(PROJECT_ROOT, 'data', 'chapter-titles.json'), 'utf8')
  );

  let built = 0;
  let total = 0;
  const failures = [];

  for (const ch of chapters) {
    try {
      const doc = await buildChapter(ch, titles);
      if (doc) {
        built++;
        total += doc.verses.length;
      }
    } catch (err) {
      console.error(`\n✗ Chapter ${ch}: ${err.message}\n`);
      failures.push(ch);
    }
  }

  console.log(`\nBuilt ${built} chapter(s), ${total} verses.`);
  if (failures.length) {
    console.error(`Failed chapters: ${failures.join(', ')}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
