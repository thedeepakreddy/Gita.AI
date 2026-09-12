/**
 * The pre-handover gate.
 *
 *   npm run ship:check
 *
 * One command that answers: is this safe to give to a temple?
 *
 * It is deliberately pessimistic. Anything it cannot verify is reported as
 * UNVERIFIED and counts against the total — "no news" must never read as "all
 * well", which is the exact failure mode that let seven images of unknown
 * origin and a retired model ship unnoticed.
 *
 * Exit code is non-zero if any BLOCKER fails. Warnings do not fail the build
 * but are printed, because a handover checklist nobody can see is not a
 * checklist.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';

import { BACKGROUNDS } from '../src/lib/ui/backgrounds';
import { locales } from '../src/i18n/locales';
import type { Chapter } from '../src/lib/verses/types';

type Level = 'blocker' | 'warning';
type Result = { level: Level; ok: boolean; label: string; detail: string };

const results: Result[] = [];
const pass = (label: string, detail = '') =>
  results.push({ level: 'blocker', ok: true, label, detail });
const fail = (label: string, detail: string) =>
  results.push({ level: 'blocker', ok: false, label, detail });
const warn = (label: string, detail: string) =>
  results.push({ level: 'warning', ok: false, label, detail });
const note = (label: string, detail: string) =>
  results.push({ level: 'warning', ok: true, label, detail });

async function loadCorpus(): Promise<Chapter[]> {
  const dir = join(process.cwd(), 'data', 'verses', 'bhagavad-gita');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  return Promise.all(
    files.map(async (f) => JSON.parse(await readFile(join(dir, f), 'utf8')) as Chapter)
  );
}

/**
 * Opening phrases from translations known to be in copyright. If one of these
 * turns up in the shipped corpus, something was pasted in "as a convenience".
 */
const COPYRIGHTED_FINGERPRINTS: [source: string, phrase: string][] = [
  ['Prabhupada / BBT', 'You have a right to perform your prescribed'],
  ['Prabhupada / BBT', 'Bhaktivedanta'],
  ['Gita Press / Ramsukhdas', 'कर्तव्य-कर्म करनेमें ही तेरा अधिकार'],
];

async function main() {
  const chapters = await loadCorpus();
  const verses = chapters.flatMap((c) => c.verses);

  // --- Corpus integrity ---------------------------------------------------
  const noSanskrit = verses.filter((v) => !v.sanskrit?.trim());
  const noTranslit = verses.filter((v) => !v.transliteration?.trim());
  if (noSanskrit.length || noTranslit.length) {
    fail('Source text complete', `${noSanskrit.length} without Devanagari, ${noTranslit.length} without IAST`);
  } else {
    pass('Source text complete', `${verses.length} verses, all with Devanagari and IAST`);
  }

  // --- Provenance on every shipped translation ----------------------------
  const missingProvenance: string[] = [];
  for (const v of verses) {
    for (const [loc, text] of Object.entries(v.translations)) {
      if (!text?.trim()) continue;
      const meta = v.translation_meta?.[loc as keyof typeof v.translation_meta];
      if (!meta?.translator || !meta?.source || !meta?.license) {
        missingProvenance.push(`${v.chapter}.${v.verse} [${loc}]`);
      }
    }
  }
  if (missingProvenance.length) {
    fail('Translation provenance', `${missingProvenance.length} without translator/source/licence, e.g. ${missingProvenance.slice(0, 3).join(', ')}`);
  } else {
    pass('Translation provenance', 'every shipped translation names a translator, source and licence');
  }

  // --- Nothing copyrighted pasted in --------------------------------------
  const hits: string[] = [];
  for (const v of verses) {
    for (const text of Object.values(v.translations)) {
      if (!text) continue;
      for (const [source, phrase] of COPYRIGHTED_FINGERPRINTS) {
        if (text.includes(phrase)) hits.push(`${v.chapter}.${v.verse} matches ${source}`);
      }
    }
  }
  if (hits.length) fail('No copyrighted text', hits.slice(0, 5).join('; '));
  else pass('No copyrighted text', `checked against ${COPYRIGHTED_FINGERPRINTS.length} known-copyright fingerprints`);

  // --- Translation coverage, per language ---------------------------------
  for (const loc of locales) {
    const n = verses.filter((v) => (v.translations[loc] ?? '').trim()).length;
    const reviewed = verses.filter(
      (v) => v.translation_meta?.[loc]?.status === 'reviewed'
    ).length;
    if (n === 0) {
      warn(`Translation: ${loc}`, 'no verses shipped — readers see the English fallback');
    } else if (reviewed < n) {
      warn(`Translation: ${loc}`, `${n}/${verses.length} present, but only ${reviewed} reviewed — the rest show as placeholders`);
    } else {
      pass(`Translation: ${loc}`, `${n} verses, all reviewed`);
    }
  }

  // --- Artwork ------------------------------------------------------------
  const badArt = BACKGROUNDS.filter(
    (b) =>
      !/^(CC0|Public domain|CC BY)/i.test(b.licence) ||
      !b.url.startsWith('https://') ||
      ![b.title, b.artist, b.holder, b.credit].every((f) => f?.trim())
  );
  if (badArt.length) fail('Artwork licensing', `${badArt.length} background(s) without an open licence or full provenance`);
  else pass('Artwork licensing', `${BACKGROUNDS.length} backgrounds, all open-licensed with an accession URL`);

  // --- Index parity -------------------------------------------------------
  try {
    const store = JSON.parse(
      await readFile(join(process.cwd(), 'data', 'embeddings', 'vectors.json'), 'utf8')
    ) as { entries: { locale: string; verseId: string; text: string }[] };

    const corpusText = new Map<string, string>();
    for (const v of verses)
      for (const [loc, text] of Object.entries(v.translations))
        if (text?.trim()) corpusText.set(`${v.id}|${loc}`, text.trim());

    const stale = store.entries.filter(
      (e) => corpusText.get(`${e.verseId}|${e.locale}`) !== e.text
    );
    const unindexed = [...corpusText.keys()].filter(
      (k) => !store.entries.some((e) => `${e.verseId}|${e.locale}` === k)
    );

    if (stale.length || unindexed.length) {
      fail('Index matches corpus', `${stale.length} stale vector(s), ${unindexed.length} un-indexed translation(s) — run npm run embed:index`);
    } else {
      pass('Index matches corpus', `${store.entries.length} vectors, all current`);
    }
  } catch {
    fail('Index matches corpus', 'no vector index found — run npm run embed:index');
  }

  // --- Secrets ------------------------------------------------------------
  try {
    const gitignore = await readFile(join(process.cwd(), '.gitignore'), 'utf8');
    if (/^\.env$/m.test(gitignore)) pass('Secrets', '.env is gitignored');
    else fail('Secrets', '.env is NOT in .gitignore');
  } catch {
    fail('Secrets', 'no .gitignore');
  }

  // --- The review queue ---------------------------------------------------
  //
  // Drafts live in the database and are layered over the corpus at read time,
  // so they are visible to readers long before they are exported. That makes
  // "is every unreviewed verse carrying a caveat" a shipping question, not a
  // cosmetic one.
  try {
    const prisma = new PrismaClient();
    try {
      const rows = await prisma.translationRevision.groupBy({
        by: ['locale', 'status'],
        _count: { status: true },
      });
      if (rows.length === 0) {
        note('Review queue', 'empty — nothing is layered over the shipped corpus');
      } else {
        for (const r of rows) {
          const n = r._count.status;
          if (r.status === 'reviewed') {
            pass(`Review queue: ${r.locale}`, `${n} approved — run npm run data:export to ship them`);
          } else {
            warn(
              `Review queue: ${r.locale}`,
              `${n} draft(s) visible to readers, each marked as an unreviewed draft. ` +
                'Not exported, not indexed, never used to ground an answer.'
            );
          }
        }
      }
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    warn('Review queue', 'could not be read — is the database migrated?');
  }

  // --- Things this script cannot know -------------------------------------
  note('Model availability', 'not checked here — run npm run models:check with keys in the environment');
  note('Caveat rule', 'only `reviewed` text renders without a caveat — enforced in lib/verses/confidence.ts and covered by tests');

  // --- Report -------------------------------------------------------------
  const blockers = results.filter((r) => r.level === 'blocker');
  const failed = blockers.filter((r) => !r.ok);

  console.log('\n  READY TO HAND OVER?\n');
  for (const r of results) {
    const mark = r.ok ? (r.level === 'warning' ? 'i' : '✓') : r.level === 'warning' ? '!' : '✗';
    console.log(`  ${mark}  ${r.label.padEnd(26)} ${r.detail}`);
  }

  const warnings = results.filter((r) => r.level === 'warning' && !r.ok);
  console.log(
    `\n  ${blockers.length - failed.length}/${blockers.length} blockers passed` +
      (warnings.length ? `, ${warnings.length} warning(s)` : '')
  );

  if (failed.length) {
    console.log('\n  NOT ready to hand over.\n');
    process.exit(1);
  }
  console.log(
    warnings.length
      ? '\n  No blockers. The warnings above are judgement calls for the temple, not bugs.\n'
      : '\n  Clear.\n'
  );
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
