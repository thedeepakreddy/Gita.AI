#!/usr/bin/env node
/**
 * Folds approved translation revisions back into data/verses/**.json.
 *
 *   node scripts/export-revisions.mjs              # approved only (default)
 *   node scripts/export-revisions.mjs --include-in-review
 *   node scripts/export-revisions.mjs --dry-run
 *
 * WHY THIS EXISTS. Reviewers work against the database (see
 * src/lib/verses/revisions.ts), so the JSON on disk stays as-shipped no matter
 * how much review has happened. That is right for running the app and wrong
 * for handing it over: the corpus should be plain files that someone can read,
 * diff, re-embed and keep, with or without this application.
 *
 * Run it before `npm run embed:index`, or retrieval will keep matching against
 * the placeholder wording while the UI shows the approved text.
 *
 * Only status "reviewed" is exported by default. In-review text is somebody's
 * work in progress; writing it into the shipped corpus would publish a draft.
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSES_DIR = join(PROJECT_ROOT, 'data', 'verses');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const includeInReview = args.includes('--include-in-review');

const prisma = new PrismaClient();

async function main() {
  const statuses = includeInReview ? ['reviewed', 'in-review'] : ['reviewed'];
  const revisions = await prisma.translationRevision.findMany({
    where: { status: { in: statuses } },
    include: { reviewedBy: { select: { name: true, email: true } } },
  });

  if (revisions.length === 0) {
    console.log(`No revisions with status ${statuses.join(' or ')}. Nothing to export.`);
    return;
  }

  const byVerse = new Map();
  for (const r of revisions) {
    const entry = byVerse.get(r.verseId) ?? {};
    entry[r.locale] = r;
    byVerse.set(r.verseId, entry);
  }
  console.log(`${revisions.length} revision(s) across ${byVerse.size} verse(s).\n`);

  const scriptures = await readdir(VERSES_DIR, { withFileTypes: true });
  let filesChanged = 0;
  let versesChanged = 0;
  const perLocale = {};

  for (const dir of scriptures) {
    if (!dir.isDirectory()) continue;
    const dirPath = join(VERSES_DIR, dir.name);
    const files = (await readdir(dirPath)).filter((f) => f.endsWith('.json')).sort();

    for (const file of files) {
      const path = join(dirPath, file);
      const doc = JSON.parse(await readFile(path, 'utf8'));
      let touched = 0;

      for (const verse of doc.verses) {
        const entry = byVerse.get(verse.id);
        if (!entry) continue;

        for (const [locale, rev] of Object.entries(entry)) {
          if (verse.translations?.[locale] === rev.text) continue;
          verse.translations = { ...verse.translations, [locale]: rev.text };
          verse.translation_meta = {
            ...verse.translation_meta,
            [locale]: {
              status: rev.status,
              translator: rev.translator ?? null,
              source: rev.source ?? null,
              license: rev.license ?? null,
              // Carried into the file so provenance survives the handover, not
              // just the database.
              reviewedBy: rev.reviewedBy?.name ?? rev.reviewedBy?.email ?? null,
              reviewedAt: rev.reviewedAt ? rev.reviewedAt.toISOString() : null,
            },
          };
          perLocale[locale] = (perLocale[locale] ?? 0) + 1;
          touched++;
        }
      }

      if (touched === 0) continue;
      versesChanged += touched;
      filesChanged++;
      console.log(`  ${dir.name}/${file}: ${touched} translation(s)`);
      if (!dryRun) await writeFile(path, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    }
  }

  console.log(
    `\n${dryRun ? '[dry run] would update' : 'Updated'} ${versesChanged} translation(s) ` +
      `in ${filesChanged} file(s): ${Object.entries(perLocale).map(([l, n]) => `${l}=${n}`).join(', ') || 'none'}`
  );
  if (!dryRun && versesChanged > 0) {
    console.log('\nRe-embed so retrieval matches the new wording:  npm run embed:index');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
