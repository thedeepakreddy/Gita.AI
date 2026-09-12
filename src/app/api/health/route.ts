import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { embedderInfo } from '@/lib/retrieval/embedder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness and diagnosis for a deployed instance.
 *
 * Render polls this, and it is also the fastest way to answer "why is /chat
 * broken" without shell access.
 *
 * IT DELIBERATELY DOES NOT LOAD THE EMBEDDING MODEL. The encoder holds ~1.3GB
 * in the process; touching it here would mean the health check itself OOM-kills
 * the instance on a small plan, turning a diagnostic into the outage. It
 * reports how retrieval is *configured* and whether the index is on disk —
 * both cheap — and leaves loading to the first real query.
 *
 * Returns 200 while the app can serve /study, which is the part that works
 * without AI at all. A failing database is a 503, because nothing works then.
 */
export async function GET() {
  const checks: Record<string, unknown> = {};
  let healthy = true;

  // Database — the only hard dependency.
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true, ms: Date.now() - started };
  } catch (err) {
    healthy = false;
    checks.database = { ok: false, error: err instanceof Error ? err.message : 'unreachable' };
  }

  // Corpus and index: read metadata only, never the vectors.
  try {
    const { stat } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const path = join(process.cwd(), 'data', 'embeddings', 'vectors.json');
    const info = await stat(path);
    checks.index = { ok: true, bytes: info.size };
  } catch {
    // Not fatal: /study still works, /chat and /search will return 503.
    checks.index = { ok: false, error: 'no vector index — run npm run embed:index' };
  }

  checks.retrieval = embedderInfo();
  checks.trial = { configured: Boolean(process.env.TRIAL_API_KEY) };
  checks.commit = process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null;

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', checks },
    { status: healthy ? 200 : 503 }
  );
}
