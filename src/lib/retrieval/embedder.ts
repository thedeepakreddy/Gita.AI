import { embedLocal, getPipeline, localEmbedderInfo } from './localEmbedder';

/**
 * Query-time embedding.
 *
 * Two backends, one requirement: whichever is used must put a query in the
 * SAME vector space as the index. Embedding a query with a different model
 * than the corpus does not error — it returns similarity scores that are
 * meaningless while still looking entirely plausible, which is the dangerous
 * part. `npm run embed:verify` is the check.
 *
 *   local   (default) — the ONNX encoder, in this process. No sidecar to
 *                       start, nothing extra to deploy.
 *   service           — POSTs to `scripts/embed.py serve`. Kept because it is
 *                       the same weights via sentence-transformers, and it is
 *                       a useful escape hatch on a host where the native
 *                       onnxruntime binding will not install.
 *
 * Set EMBED_BACKEND=service to choose the sidecar.
 */

const DEFAULT_URL = 'http://127.0.0.1:8399';
const TIMEOUT_MS = 20_000;

export type EmbedBackend = 'local' | 'service';

export function embedBackend(): EmbedBackend {
  return process.env.EMBED_BACKEND === 'service' ? 'service' : 'local';
}

export class EmbeddingUnavailableError extends Error {
  constructor(cause: string) {
    super(
      embedBackend() === 'service'
        ? `The embedding service is not reachable (${cause}). ` +
            'Start it with:  .venv/bin/python scripts/embed.py serve'
        : `The embedding model could not be loaded (${cause}). ` +
            'It downloads on first use; check disk space and network, then retry.'
    );
    this.name = 'EmbeddingUnavailableError';
  }
}

function serviceUrl(): string {
  return process.env.EMBED_SERVICE_URL || DEFAULT_URL;
}

async function embedViaService(texts: string[]): Promise<number[][]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${serviceUrl()}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new EmbeddingUnavailableError(`service returned ${res.status}`);
    }

    const data = (await res.json()) as { vectors?: number[][] };
    if (!data.vectors || data.vectors.length !== texts.length) {
      throw new EmbeddingUnavailableError('malformed response');
    }
    return data.vectors;
  } finally {
    clearTimeout(timer);
  }
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  try {
    return embedBackend() === 'service'
      ? await embedViaService(texts)
      : await embedLocal(texts, 'query');
  } catch (err) {
    if (err instanceof EmbeddingUnavailableError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new EmbeddingUnavailableError('timed out');
    }
    throw new EmbeddingUnavailableError(
      err instanceof Error ? err.message : 'unknown error'
    );
  }
}

export async function embedOne(text: string): Promise<number[]> {
  return (await embed([text]))[0];
}

/**
 * Is embedding usable right now? Cheap for the service backend; for the local
 * one this warms the model, so the first real question does not pay the load.
 */
export async function embeddingServiceHealthy(): Promise<boolean> {
  try {
    if (embedBackend() === 'service') {
      const res = await fetch(`${serviceUrl()}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    }
    await getPipeline();
    return true;
  } catch {
    return false;
  }
}

export function embedderInfo() {
  const backend = embedBackend();
  return backend === 'service'
    ? { backend, url: serviceUrl() }
    : { backend, ...localEmbedderInfo() };
}
