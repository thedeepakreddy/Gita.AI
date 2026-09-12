/**
 * Builds data/embeddings/vectors.json from the corpus.
 *
 *   npm run embed:index
 *
 * Uses the SAME encoder the running app queries with (src/lib/retrieval/
 * localEmbedder.ts), which is the point: the failure this project fears most
 * is an index and a query living in different vector spaces, and the surest
 * way to prevent it is for one module to produce both.
 *
 * scripts/embed.py index remains, and produces a byte-compatible index via
 * sentence-transformers — measured, not assumed. Use it on a host where the
 * native onnxruntime binding will not install.
 *
 * Run this after `--repair`, after `npm run data:export`, or after any change
 * to the corpus. Stale vectors do not error; they quietly match text that is
 * no longer there.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { embedLocal, localEmbedderInfo } from '../src/lib/retrieval/localEmbedder';
import { getChaptersRaw } from '../src/lib/verses/store';

/**
 * Retrieval probes, mirroring the ones in scripts/embed.py.
 *
 * They exist because a rebuilt index can be perfectly self-consistent and
 * still be wrong — the vectors agree with each other while matching text that
 * is no longer what the reader sees. A handful of questions whose right answer
 * a person can confirm is the only check that catches that.
 *
 * Expectations are full chapter.verse references: bare verse numbers compared
 * across 18 chapters, which silently mislabelled every result.
 */
const PROBES: [question: string, expected: string][] = [
  ['my mind is confused about my duty and I cannot decide', '2.7'],
  ['should I worry about the results of my work', '2.47'],
  ['everyone will think I am a coward if I walk away', '2.35'],
  ['what happens to the soul when the body dies', '2.22'],
];

type Scored = { ref: string; score: number; text: string };

function probe(
  store: { entries: { chapter: number; verse: number; text: string; vector: number[] }[] },
  qvec: number[],
  k: number
): Scored[] {
  const best = new Map<string, Scored>();
  for (const e of store.entries) {
    let score = 0;
    for (let i = 0; i < qvec.length; i++) score += qvec[i] * e.vector[i];
    const ref = `${e.chapter}.${e.verse}`;
    const existing = best.get(ref);
    if (!existing || score > existing.score) best.set(ref, { ref, score, text: e.text });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, k);
}

async function smokeTest(store: Parameters<typeof probe>[0]) {
  console.log('\nSmoke test:');
  const qvecs = await embedLocal(PROBES.map((p) => p[0]), 'query');

  let hits = 0;
  for (const [i, [question, expected]] of PROBES.entries()) {
    const top = probe(store, qvecs[i], 5);
    const refs = top.map((t) => t.ref);
    const hit = refs.includes(expected);
    if (hit) hits++;
    console.log(`  ${hit ? '✓' : '·'} ${JSON.stringify(question)}`);
    console.log(`      top5: ${refs.join(', ')}   (expected ${expected})`);
    console.log(`      best: ${top[0].ref} @ ${top[0].score.toFixed(3)} — ${top[0].text.slice(0, 84)}`);
  }

  console.log(`\n  ${hits}/${PROBES.length} probes matched their expected verse.`);
  if (hits < PROBES.length) {
    console.log('  Semantic match is fuzzy and a near-miss is often a fine answer —');
    console.log("  read the 'best' lines above before treating this as a failure.");
  }
}

/** Small batches keep peak memory low; the corpus is only ~700 entries. */
const BATCH = 16;

type Entry = {
  verseId: string;
  scripture: string;
  chapter: number;
  verse: number;
  locale: string;
  text: string;
};

async function main() {
  const storePath = join(process.cwd(), 'data', 'embeddings', 'vectors.json');

  // The corpus as it ships. Reviewed translations live in the database and are
  // exported into these files by `npm run data:export` — indexing the overlay
  // directly would make the index depend on a database the indexer may not have.
  const chapters = await getChaptersRaw();

  const entries: Entry[] = [];
  for (const chapter of chapters) {
    for (const verse of chapter.verses) {
      for (const [locale, text] of Object.entries(verse.translations)) {
        if (!text?.trim()) continue;
        entries.push({
          verseId: verse.id,
          scripture: verse.scripture,
          chapter: verse.chapter,
          verse: verse.verse,
          locale,
          text: text.trim(),
        });
      }
    }
  }

  if (entries.length === 0) {
    console.error('Nothing to embed — no non-empty translations found.');
    process.exit(1);
  }

  const info = localEmbedderInfo();
  console.log(
    `Embedding ${entries.length} verse-translations from ${chapters.length} chapter(s)\n` +
      `  model ${info.model} (${info.dtype})\n`
  );

  const vectors: number[][] = [];
  const started = Date.now();
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    // "passage" — the corpus side of e5's asymmetric prefixes. Queries use
    // "query:". Swapping them silently degrades every result.
    vectors.push(...(await embedLocal(batch.map((e) => e.text), 'passage')));
    process.stdout.write(`\r  ${Math.min(i + BATCH, entries.length)}/${entries.length}`);
  }
  console.log(`\n  done in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const store = {
    // Recorded as the upstream weights, not the ONNX mirror: this is the vector
    // space, and embed.py writes the same string for the same space.
    model: 'intfloat/multilingual-e5-base',
    builtWith: `${info.model} (${info.dtype})`,
    dimensions: vectors[0].length,
    normalized: true,
    e5Prefixes: true,
    count: entries.length,
    generatedAt: new Date().toISOString(),
    entries: entries.map((entry, i) => ({
      ...entry,
      // Six decimals matches embed.py, and keeps the file ~6MB instead of ~20.
      vector: vectors[i].map((x) => Number(x.toFixed(6))),
    })),
  };

  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store), 'utf8');
  console.log(`\nWrote ${storePath} — ${entries.length} vectors, ${store.dimensions} dims`);

  if (process.argv.includes('--smoke-test')) await smokeTest(store);
  console.log('\nConfirm it agrees with the app:  npm run embed:verify');
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
