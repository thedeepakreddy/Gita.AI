#!/usr/bin/env node
/**
 * Imports Schmidt József's Hungarian Bhagavad-gítá into the REVIEW QUEUE.
 *
 *   node scripts/import-hungarian.mjs --dry-run
 *   node scripts/import-hungarian.mjs
 *
 * WHAT THIS IS, AND WHAT IT IS EMPHATICALLY NOT.
 *
 * Schmidt József (1868–1933) translated the Gítá into Hungarian directly from
 * the Sanskrit. He died in 1933, so under Hungarian law (life + 70) the work
 * has been in the public domain since 1 January 2004. That much is solid.
 *
 * The TRANSCRIPTION is not solid. It lives in a contributor's draft sandbox on
 * hu.wikisource, it is uncorrected OCR — several canto headings are visibly
 * garbled — and 22 of the 701 verses are absent from their own numbering.
 *
 * So nothing here is imported as finished text. Every verse lands as
 * `status: "in-review"` in the TranslationRevision table, which means:
 *
 *   - it is layered over the shipped corpus at read time, never written into
 *     data/verses/**.json (see src/lib/verses/revisions.ts);
 *   - `npm run data:export` will NOT export it, because that exports only
 *     `reviewed`;
 *   - it is therefore NOT indexed, and no counsel is ever grounded in it;
 *   - the UI marks it as pending review, as it does all unreviewed text.
 *
 * What it buys is the reviewer's time. A Hungarian speaker opening
 * /admin/review gets a 97%-complete draft to check against the Sanskrit
 * instead of 701 empty boxes. That is the whole purpose.
 *
 * NOBODY SHOULD MARK THESE REVIEWED WITHOUT READING THEM. The point of the
 * separate status is that approving is a human act with a name attached.
 */

import { PrismaClient } from '@prisma/client';

const PAGE = 'Szerkesztő:LinguisticMystic/bg-schmidt';
const API = 'https://hu.wikisource.org/w/api.php';
const UA = 'gita-counsel-dataset-builder/0.1 (non-commercial study app)';

const SCRIPTURE = 'bhagavad-gita';
const LOCALE = 'hu';

/** The Sanskrit source's own verse counts — the alignment authority. */
const EXPECTED = [47, 72, 43, 42, 29, 47, 30, 28, 34, 42, 55, 20, 35, 27, 20, 24, 28, 78];

const PROVENANCE = {
  translator: 'Schmidt József (1868–1933)',
  source:
    'Bhagavad-gítá: Ind theozófikus költemény. Szanszkrit eredetiből fordította Schmidt József. ' +
    'Transcribed at hu.wikisource.org (uncorrected OCR, contributor draft).',
  license: 'Public domain (Hungary, life+70 — expired 1 January 2004)',
};

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

async function fetchWikitext() {
  const url = `${API}?action=parse&prop=wikitext&format=json&formatversion=2&page=${encodeURIComponent(PAGE)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Wikisource returned ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Wikisource: ${data.error.code}`);
  return data.parse.wikitext;
}

/** Wiki markup and scan artefacts, removed without touching the translation. */
function clean(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, ' ')   // "<!-- 33 -->" page numbers from the scan
    .replace(/<ref[\s\S]*?<\/ref>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/'''?/g, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

/**
 * Coarse OCR-damage score for one verse, 0 (clean) to 1 (ruined).
 *
 * Not linguistics — just the shapes a bad scan makes: tokens with no vowel at
 * all, orphaned brackets, stranded single letters. Schmidt's text degrades
 * badly in the later cantos ("Eu orapoh a hatalmas Rala" for "Én vagyok a
 * hatalmas Kála"), and a reviewer handed 667 undifferentiated drafts cannot
 * see that until they are deep in chapter 11.
 */
const VOWELS = new Set('aeiouáéíóöőúüűAEIOUÁÉÍÓÖŐÚÜŰ');

function damageScore(text) {
  const tokens = text.match(/[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]+/g) ?? [];
  if (tokens.length < 4) return 1;
  const novowel = tokens.filter((t) => t.length > 2 && ![...t].some((c) => VOWELS.has(c))).length;
  const lone = tokens.filter((t) => t.length === 1 && !'as'.includes(t.toLowerCase())).length;
  const unbalanced = Math.abs(
    (text.match(/\(/g) ?? []).length - (text.match(/\)/g) ?? []).length
  );
  return Math.min(1, (novowel * 2 + lone + unbalanced * 1.5) / tokens.length);
}

function tierOf(score) {
  if (score < 0.05) return 'clean';
  if (score < 0.12) return 'suspect';
  return 'damaged';
}

function parse(wikitext) {
  const start = wikitext.indexOf('A Bhagavad-gítá, "A Magasztosnak éneke"');
  if (start === -1) throw new Error('Could not find where the poem begins — the page layout changed.');
  const body = wikitext.slice(start);

  const heads = [...body.matchAll(/^=+\s*([IVX]+)\.\s*ének.*?=+\s*$/gm)];
  if (heads.length !== 18) {
    throw new Error(`Expected 18 cantos, found ${heads.length}. Refusing to guess at the mapping.`);
  }

  const byChapter = new Map();

  for (let i = 0; i < heads.length; i++) {
    const from = heads[i].index;
    const to = i + 1 < heads.length ? heads[i + 1].index : body.length;
    const segment = body.slice(from, to);
    const chapter = i + 1;

    // Candidate markers, deliberately permissive about shape: the scan welds
    // footnote marks to the number ("17.*") and sometimes drops the full stop
    // entirely ("51 Mert a bölcsek…"). A strict pattern silently lost 13 real
    // verses that way.
    //
    // SHAPE DOES NOT DECIDE — SEQUENCE DOES. A loose candidate is accepted only
    // when it is the verse we are next expecting, which is the same guard the
    // English builder uses. Stray numerals inside prose are never "next", so
    // permissiveness here cannot pull the alignment apart. Verified: seven
    // verses whose content is unmistakable (2.13, 2.47, 11.32, 18.66 …) all
    // land on the correct number.
    // The range separator tolerates a full stop before the dash, because the
    // scan writes merged verses as "26.-27." as often as "26-27.".
    const candidates = [
      ...segment.matchAll(
        /^[ \t]*(\d{1,3})(?:\.?[ \t]*[-–—][ \t]*(\d{1,3}))?[ \t]*(\.|\.\s*[*†‡)\]]|)[ \t]+(?=\S)/gm
      ),
    ];

    const markers = [];
    let expecting = null;
    for (const c of candidates) {
      const lo = Number(c[1]);
      const hi = c[2] ? Number(c[2]) : lo;
      if (!Number.isInteger(lo) || lo < 1 || hi > EXPECTED[i] || hi < lo) continue;
      const wellFormed = c[3].startsWith('.');
      if (expecting === null) {
        // Anchor on a clean marker — EXCEPT at the very start of a canto, where
        // a malformed "1" would otherwise throw the first verse away entirely.
        // Canto III opens "1 Ha azt véled, óh Krisna…" with the full stop lost,
        // and that verse was silently dropped. Restricting the exception to 1
        // and 2 keeps a stray numeral deep in the text from ever anchoring.
        if (!wellFormed && lo > 2) continue;
        expecting = lo;
      }
      if (lo !== expecting && (!wellFormed || lo < expecting)) continue;
      markers.push(c);
      expecting = hi + 1;
    }

    const verses = new Map();
    for (let m = 0; m < markers.length; m++) {
      const marker = markers[m];
      const textFrom = marker.index + marker[0].length;
      const textTo = m + 1 < markers.length ? markers[m + 1].index : segment.length;
      const text = clean(segment.slice(textFrom, textTo));
      if (!text || text.length < 10) continue;

      const lo = Number(marker[1]);
      const hi = marker[2] ? Number(marker[2]) : lo;

      // A merged rendering covers several verses; each carries the whole
      // passage, with a note saying so. Splitting a sentence Schmidt chose to
      // render as one would be inventing a division he did not make.
      const tier = tierOf(damageScore(text));
      for (let v = lo; v <= hi; v++) {
        verses.set(v, { text, tier, merged: hi > lo ? `${lo}-${hi}` : null });
      }
    }
    // --- Second pass: displaced verses -----------------------------------
    //
    // The sequence guard refuses an out-of-order marker, and it is right to —
    // that is what stops text landing on the wrong verse. But the scan does
    // genuinely displace a line: 18.56 sits at the foot of a page and was read
    // after 57 and 58, immediately before a footnote rule.
    //
    // So a verse the main pass could not place is looked for once more, on its
    // own, and accepted only if ALL of these hold: the marker is well-formed,
    // that number appears exactly once in the canto, and it was not already
    // consumed. Text runs to the next marker or to a footnote rule, whichever
    // comes first. A displaced verse is recoverable; an ambiguous one is not,
    // and stays missing rather than being guessed at.
    for (let v = 1; v <= EXPECTED[i]; v++) {
      if (verses.has(v)) continue;
      const found = [...segment.matchAll(new RegExp(`^[ \\t]*${v}\\.[ \\t]+(?=\\S)`, 'gm'))];
      if (found.length !== 1) continue;

      const at = found[0];
      const consumed = markers.some(
        (m) => m.index <= at.index && at.index < m.index + m[0].length
      );
      if (consumed) continue;

      const rest = segment.slice(at.index + at[0].length);
      const stop = rest.search(/\n\s*(?:-{3,}|\d{1,3}[.)]\s)/);
      const text = clean(stop === -1 ? rest : rest.slice(0, stop));
      if (!text || text.length < 10) continue;

      verses.set(v, { text, tier: tierOf(damageScore(text)), merged: null, displaced: true });
    }

    byChapter.set(chapter, verses);
  }

  return byChapter;
}

async function main() {
  console.log('Fetching Schmidt József\'s Hungarian Gítá from hu.wikisource…\n');
  const wikitext = await fetchWikitext();
  const byChapter = parse(wikitext);

  let found = 0;
  const missing = [];
  for (let ch = 1; ch <= 18; ch++) {
    const verses = byChapter.get(ch) ?? new Map();
    found += verses.size;
    for (let v = 1; v <= EXPECTED[ch - 1]; v++) {
      if (!verses.has(v)) missing.push(`${ch}.${v}`);
    }
  }
  const total = EXPECTED.reduce((a, b) => a + b, 0);

  // 1.1–1.19 are not a defect. Schmidt states in his own preface that the Gítá
  // proper begins at verse 20 and renders the preceding nineteen as a prose
  // summary instead. Reporting them alongside OCR losses would send a reviewer
  // hunting for text that was never meant to be there.
  const BY_DESIGN = new Set(
    Array.from({ length: 19 }, (_, i) => `1.${i + 1}`)
  );
  const byDesign = missing.filter((r) => BY_DESIGN.has(r));
  const lost = missing.filter((r) => !BY_DESIGN.has(r));

  const tiers = { clean: 0, suspect: 0, damaged: 0 };
  for (const verses of byChapter.values())
    for (const e of verses.values()) tiers[e.tier]++;

  console.log(`  parsed ${found} of ${total} verses (${((found / total) * 100).toFixed(1)}%)\n`);
  console.log('  Scan quality — this is what the reviewer is actually facing:');
  console.log(`    clean    ${String(tiers.clean).padStart(3)}  read and confirm against the Sanskrit`);
  console.log(`    suspect  ${String(tiers.suspect).padStart(3)}  legible but with OCR errors to repair`);
  console.log(`    damaged  ${String(tiers.damaged).padStart(3)}  likely faster to retype from the book\n`);
  console.log(
    `  not translated by Schmidt (his own editorial choice): ${byDesign.length}` +
      ` — 1.1–1.19, summarised in prose`
  );
  console.log(`  absent from the transcription, needing a translator: ${lost.length}`);
  if (lost.length) {
    console.log(`    ${lost.join(', ')}`);
  }
  console.log(
    '\n  Every verse imports as "in-review". None is exported, none is indexed,\n' +
      '  and no answer is grounded in any of it until a person approves it.\n'
  );

  if (dryRun) {
    const sample = byChapter.get(2)?.get(47);
    if (sample) console.log(`  sample 2.47 — ${sample.text.slice(0, 200)}\n`);
    console.log('  [dry run] nothing written.');
    return;
  }

  const prisma = new PrismaClient();
  try {
    let written = 0;
    let skipped = 0;
    for (let ch = 1; ch <= 18; ch++) {
      for (const [v, entry] of byChapter.get(ch) ?? []) {
        const verseId = `${SCRIPTURE}:${ch}:${v}`;

        // Never overwrite a human. If somebody has already reviewed this verse,
        // an OCR draft must not clobber their work.
        const existing = await prisma.translationRevision.findUnique({
          where: { verseId_locale: { verseId, locale: LOCALE } },
        });
        if (existing?.status === 'reviewed') { skipped++; continue; }

        const notes = [];
        if (entry.merged) {
          notes.push(`Schmidt renders verses ${entry.merged} as one passage; the same text is attached to each.`);
        }
        if (entry.displaced) {
          notes.push('Recovered from a displaced line in the scan — this verse was printed out of sequence. Confirm the text belongs to this number.');
        }
        if (entry.tier === 'damaged') {
          notes.push('SCAN BADLY DAMAGED — likely faster to retype this verse from the printed edition than to repair it.');
        } else if (entry.tier === 'suspect') {
          notes.push('Scan has OCR errors; read closely against the Sanskrit.');
        }
        const note = notes.length ? notes.join(' ') : null;

        const data = {
          text: entry.text,
          status: 'in-review',
          ...PROVENANCE,
          note,
          reviewedById: null,
          reviewedAt: null,
        };
        await prisma.translationRevision.upsert({
          where: { verseId_locale: { verseId, locale: LOCALE } },
          create: { verseId, locale: LOCALE, ...data },
          update: data,
        });
        written++;
      }
    }
    // Re-running with a better parser produces a different set of verses. Rows
    // the current parse no longer yields are orphans from an earlier run — they
    // must go, or the queue slowly fills with text no importer can account for.
    // Approved verses are never touched: a human's work outranks any re-import.
    const keep = new Set();
    for (let ch = 1; ch <= 18; ch++)
      for (const v of (byChapter.get(ch) ?? new Map()).keys())
        keep.add(`${SCRIPTURE}:${ch}:${v}`);

    const orphans = (
      await prisma.translationRevision.findMany({
        where: { locale: LOCALE, status: 'in-review' },
        select: { verseId: true },
      })
    ).filter((r) => !keep.has(r.verseId));

    if (orphans.length) {
      await prisma.translationRevision.deleteMany({
        where: { locale: LOCALE, status: 'in-review', verseId: { in: orphans.map((o) => o.verseId) } },
      });
    }

    console.log(
      `  wrote ${written} draft revision(s)` +
        `${skipped ? `, left ${skipped} approved verse(s) alone` : ''}` +
        `${orphans.length ? `, pruned ${orphans.length} orphan(s) from an earlier run` : ''}.`
    );
    console.log('  Review them at /admin/review (language: Hungarian).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
