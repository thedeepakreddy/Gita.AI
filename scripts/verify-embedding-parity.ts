/**
 * Does the app's query embedder still land in the same vector space as the
 * index on disk?
 *
 *   npm run embed:verify
 *
 * This is the one check that stands between the app and silent nonsense. A
 * query embedded by a different model — or the same model quantized
 * differently — produces similarity scores that look completely plausible and
 * mean nothing. Nothing errors. Nothing looks wrong. The answers just quietly
 * stop being grounded in the right verses.
 *
 * So: re-embed text whose vector is ALREADY in the index, through the exact
 * code path /api/chat uses, and compare. Run it after changing the embedding
 * model, the dtype, or the backend.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { embedderInfo } from '../src/lib/retrieval/embedder';
import { embedLocal } from '../src/lib/retrieval/localEmbedder';

/** Below this, treat the embedder and the index as different vector spaces. */
const FAIL_BELOW = 0.99;
/** Above FAIL_BELOW but below this is drift worth knowing about (e.g. q8). */
const WARN_BELOW = 0.999;

type Entry = { chapter: number; verse: number; locale: string; text: string; vector: number[] };

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

async function main() {
  const storePath = join(process.cwd(), 'data', 'embeddings', 'vectors.json');
  const store = JSON.parse(await readFile(storePath, 'utf8')) as {
    model: string;
    dimensions: number;
    count: number;
    e5Prefixes?: boolean;
    entries: Entry[];
  };

  console.log(`\nIndex    ${store.model} — ${store.count} vectors, ${store.dimensions} dims`);
  console.log(`Embedder ${JSON.stringify(embedderInfo())}\n`);

  // Spread the sample across the corpus rather than taking the first few, so a
  // problem confined to one chapter or language is not missed.
  const step = Math.max(1, Math.floor(store.entries.length / 8));
  const samples = store.entries.filter((_, i) => i % step === 0).slice(0, 8);

  // Index text was embedded as "passage:", not "query:" — compare like for like.
  const t0 = Date.now();
  const vectors = await embedLocal(samples.map((e) => e.text), 'passage');
  const elapsed = Date.now() - t0;

  let worst = 1;
  for (const [i, entry] of samples.entries()) {
    const cosine = dot(vectors[i], entry.vector);
    worst = Math.min(worst, cosine);
    const mark = cosine >= WARN_BELOW ? '✓' : cosine >= FAIL_BELOW ? '!' : '✗';
    console.log(
      `  ${mark} ${`${entry.chapter}.${entry.verse}`.padStart(7)}  [${entry.locale}]  cosine ${cosine.toFixed(5)}`
    );
  }

  const dims = vectors[0]?.length ?? 0;
  console.log(`\n  ${samples.length} samples in ${elapsed}ms (${Math.round(elapsed / samples.length)}ms each), ${dims} dims`);

  if (dims !== store.dimensions) {
    console.error(`\n✗ FAIL — embedder returns ${dims} dims, index has ${store.dimensions}.`);
    process.exit(1);
  }
  if (worst < FAIL_BELOW) {
    console.error(
      `\n✗ FAIL — worst cosine ${worst.toFixed(5)} is below ${FAIL_BELOW}.\n` +
        '  The embedder and the index are NOT in the same vector space. Retrieval\n' +
        '  is returning plausible-looking nonsense. Either restore the previous\n' +
        '  model/dtype, or rebuild the index with:  npm run embed:index\n'
    );
    process.exit(1);
  }
  if (worst < WARN_BELOW) {
    console.log(
      `\n! Worst cosine ${worst.toFixed(5)} — usable, but quantization drift is\n` +
        '  visible. Near-ties in the top-5 may reorder against the index. Use fp32\n' +
        '  if exact ordering matters.\n'
    );
    return;
  }
  console.log(`\n✓ PASS — worst cosine ${worst.toFixed(5)}. Embedder and index agree.\n`);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
