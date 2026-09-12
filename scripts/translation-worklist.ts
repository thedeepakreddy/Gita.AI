/**
 * The exact work remaining, as a document you can hand to a translator.
 *
 *   npm run data:worklist -- hu > worklist-hu.md
 *   npm run data:worklist -- hi
 *
 * "31 verses missing" is a number. A translator needs the verse, the Sanskrit,
 * the transliteration, the English to work from, and to be told which of the
 * three kinds of job each one is. That is what this produces.
 *
 * It reads the corpus and the review queue, so it is always current: verses
 * approved since the last run drop off it by themselves.
 */

import { PrismaClient } from '@prisma/client';

import { isLocale, localeMeta, type Locale } from '../src/i18n/locales';
import { getChaptersRaw } from '../src/lib/verses/store';

type Job = 'translate' | 'transcribe' | 'repair' | 'confirm';

const JOB_NOTE: Record<Job, string> = {
  translate: 'No source text exists. Needs translating from the Sanskrit.',
  transcribe: 'Schmidt translated this, but it is missing from the scan. Needs transcribing from the printed edition.',
  repair: 'Scan badly damaged — likely faster to retype from the printed edition than to repair.',
  confirm: 'Draft is legible. Read against the Sanskrit and correct.',
};

async function main() {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? 'hu';
  if (!isLocale(arg)) {
    console.error(`Unknown locale "${arg}". One of: ${Object.keys(localeMeta).join(', ')}`);
    process.exit(1);
  }
  const locale = arg as Locale;

  const chapters = await getChaptersRaw();
  const prisma = new PrismaClient();
  let drafts: Map<string, { status: string; note: string | null }>;
  try {
    const rows = await prisma.translationRevision.findMany({ where: { locale } });
    drafts = new Map(rows.map((r) => [r.verseId, { status: r.status, note: r.note }]));
  } finally {
    await prisma.$disconnect();
  }

  // Schmidt renders 1.1–1.19 as a prose summary rather than verse by verse, so
  // those need translating outright rather than transcribing.
  const NEVER_TRANSLATED = new Set(
    locale === 'hu' ? Array.from({ length: 19 }, (_, i) => `bhagavad-gita:1:${i + 1}`) : []
  );

  const jobs: { ref: string; job: Job; verse: (typeof chapters)[0]['verses'][0] }[] = [];
  for (const chapter of chapters) {
    for (const verse of chapter.verses) {
      const draft = drafts.get(verse.id);
      if (draft?.status === 'reviewed') continue;

      let job: Job;
      if (!draft) job = NEVER_TRANSLATED.has(verse.id) ? 'translate' : 'transcribe';
      else if (draft.note?.includes('BADLY DAMAGED')) job = 'repair';
      else job = 'confirm';

      jobs.push({ ref: `${verse.chapter}.${verse.verse}`, job, verse });
    }
  }

  const count = (j: Job) => jobs.filter((x) => x.job === j).length;
  const L = localeMeta[locale].label;

  console.log(`# ${L} translation worklist\n`);
  console.log(`Generated from the corpus and the review queue. ${jobs.length} verses of 701 still need attention.\n`);
  console.log('| Job | Verses | What it means |');
  console.log('|---|---:|---|');
  for (const j of ['translate', 'transcribe', 'repair', 'confirm'] as Job[]) {
    if (count(j)) console.log(`| **${j}** | ${count(j)} | ${JOB_NOTE[j]} |`);
  }

  console.log(
    '\n> Approving a verse in `/admin/review` records your name and a timestamp against it.\n' +
      '> Nothing is published, indexed, or used to answer a question until you do.\n'
  );

  // The verses needing original work come first and in full; the much larger
  // "confirm" pile is listed as references only, because a reviewer works
  // through those in the app, not on paper.
  for (const j of ['translate', 'transcribe', 'repair'] as Job[]) {
    const group = jobs.filter((x) => x.job === j);
    if (!group.length) continue;
    console.log(`\n## ${j} — ${group.length} verses\n`);
    console.log(`_${JOB_NOTE[j]}_\n`);
    for (const { ref, verse } of group) {
      console.log(`### ${ref}\n`);
      console.log('```');
      console.log(verse.sanskrit);
      console.log('```');
      console.log(`*${verse.transliteration}*\n`);
      console.log(`> ${verse.translations.en ?? '(no English)'}\n`);
    }
  }

  const confirm = jobs.filter((x) => x.job === 'confirm').map((x) => x.ref);
  if (confirm.length) {
    console.log(`\n## confirm — ${confirm.length} verses\n`);
    console.log(`_${JOB_NOTE.confirm} Work through these in \`/admin/review\`._\n`);
    console.log(confirm.join(' · '));
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
