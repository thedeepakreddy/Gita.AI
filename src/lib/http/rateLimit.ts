/**
 * A small fixed-window rate limiter.
 *
 * BE HONEST ABOUT WHAT THIS IS. It is in-memory and per-process: two instances
 * behind a load balancer each allow the full quota, and a restart forgets
 * everything. It exists to stop one impatient browser (or one crawler) from
 * hammering an endpoint that runs an embedding model, not to defend against a
 * determined attacker. If this app is ever fronted by more than one instance,
 * replace the Map with Redis — the call sites do not change.
 */

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();

/** Stops the Map growing without bound in a long-lived process. */
function sweep(now: number) {
  if (buckets.size < 5_000) return;
  for (const [key, w] of buckets) if (w.resetAt <= now) buckets.delete(key);
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  const window =
    existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

  window.count++;
  buckets.set(key, window);

  const remaining = Math.max(0, limit - window.count);
  return {
    ok: window.count <= limit,
    remaining,
    resetAt: window.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
  };
}

/**
 * Best-effort client identity for rate limiting.
 *
 * Behind a proxy the socket address is the proxy, so the forwarded headers are
 * used when present. They are trivially spoofable by a direct caller — which is
 * acceptable here, because the consequence of a bypass is one extra embedding,
 * not access to anything.
 */
export function clientKey(request: Request, prefix = ''): string {
  const headers = request.headers;
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || headers.get('x-real-ip') || 'local';
  return `${prefix}:${ip}`;
}

export function tooManyRequests(result: RateLimitResult): Response {
  return Response.json(
    {
      error: 'rate_limited',
      message: 'Too many requests. Please wait a moment and try again.',
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Remaining': String(result.remaining),
      },
    }
  );
}
