import type { FeatureExtractionPipeline } from '@huggingface/transformers';

/**
 * In-process query embedding.
 *
 * This replaces the Python sidecar (`scripts/embed.py serve`) for the one job
 * the running app actually needs: embedding a single user question. Indexing
 * still happens offline, and embed.py remains the indexer.
 *
 * WHY THIS EXISTS. A separate Python process is one more thing a volunteer has
 * to remember to start, and when it is not running `/chat` fails outright while
 * `/study` keeps working — a confusing half-broken state to hand to someone
 * else six months from now. Running the encoder in-process removes an entire
 * runtime from the deployment.
 *
 * VECTOR-SPACE PARITY IS THE WHOLE POINT. Xenova/multilingual-e5-base is an
 * ONNX export of the same intfloat/multilingual-e5-base weights the index was
 * built with, and at fp32 it reproduces the stored vectors exactly — measured
 * cosine 1.00000 against real index entries, not assumed. Verify it yourself
 * after any model or dtype change:
 *
 *     npm run embed:verify
 *
 * A mismatch here does not error. It returns plausible-looking nonsense, which
 * is precisely why the check is a script and not a comment.
 */

const MODEL_ID = process.env.EMBED_LOCAL_MODEL || 'Xenova/multilingual-e5-base';

/**
 * fp32 is the default because it is the configuration whose parity with the
 * index has actually been measured. `q8` is roughly a quarter of the size and
 * worth having on a memory- or disk-constrained host, but it quantizes the
 * weights, so re-run `npm run embed:verify` before trusting it — a small drift
 * is enough to reorder near-ties in the top-5.
 */
const DTYPE = (process.env.EMBED_DTYPE || 'fp32') as 'fp32' | 'fp16' | 'q8' | 'q4';

/** Keeps weights inside the project, matching where embed.py caches them. */
const CACHE_DIR =
  process.env.EMBED_CACHE_DIR || `${process.cwd()}/.hf-cache/transformers`;

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

async function loadPipeline(): Promise<FeatureExtractionPipeline> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = CACHE_DIR;
  return pipeline('feature-extraction', MODEL_ID, { dtype: DTYPE });
}

export function getPipeline(): Promise<FeatureExtractionPipeline> {
  // As elsewhere in this codebase: never memoize a rejected promise, or one
  // failed first load (a half-downloaded model, a full disk) poisons the
  // process until it is restarted.
  pipelinePromise ??= loadPipeline().catch((err) => {
    pipelinePromise = null;
    throw err;
  });
  return pipelinePromise;
}

/**
 * The e5 family is trained with asymmetric prefixes and loses noticeable
 * retrieval quality without them. This MUST stay identical to `apply_prefix`
 * in scripts/embed.py — the index was written with "passage: " and queries are
 * only comparable to it if they carry "query: ".
 */
function withPrefix(texts: string[], mode: 'query' | 'passage'): string[] {
  if (!/e5/i.test(MODEL_ID)) return texts;
  const tag = mode === 'query' ? 'query: ' : 'passage: ';
  return texts.map((t) => tag + t);
}

export async function embedLocal(
  texts: string[],
  mode: 'query' | 'passage' = 'query'
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const extractor = await getPipeline();
  const output = await extractor(withPrefix(texts, mode), {
    // Mean pooling + L2 normalize, matching sentence-transformers' own head for
    // this model. Normalizing here is what lets search.ts treat a dot product
    // as cosine similarity.
    pooling: 'mean',
    normalize: true,
  });

  const [rows, dims] = output.dims as [number, number];
  const flat = Array.from(output.data as Float32Array);

  const vectors: number[][] = [];
  for (let i = 0; i < rows; i++) vectors.push(flat.slice(i * dims, (i + 1) * dims));
  return vectors;
}

export function localEmbedderInfo() {
  return { model: MODEL_ID, dtype: DTYPE, cacheDir: CACHE_DIR };
}
