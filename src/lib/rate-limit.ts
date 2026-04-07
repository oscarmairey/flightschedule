// FlySchedule — in-memory rate limiter (no Redis).
//
// At 5–12 users on a single VPS, an in-memory token bucket is plenty.
// We use it to:
//   - Throttle /api/upload/presign (Phase 4) — prevents a malicious
//     authenticated pilot from spamming presign requests
//   - Throttle /login (Phase 0) — basic brute-force defense
//
// Limitations to be aware of:
//   - Per-process state. If we ever scale to multiple Node processes
//     behind a load balancer, this needs to move to Redis or similar.
//     For V1 (single Docker container), it's fine.
//   - State is lost on restart. Acceptable: a determined attacker can
//     just wait for a deploy.
//   - The Map grows unbounded if many distinct keys are seen. We prune
//     entries on each call when the Map gets large.

type Bucket = {
  count: number;
  resetAt: number; // epoch ms
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Check whether the caller identified by `key` is allowed to make
 * another request within the current window. Returns ok=false if the
 * limit is exceeded.
 *
 * Usage:
 *   const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
 *   const r = rateLimit(`presign:${ip}`, { limit: 5, windowMs: 60_000 });
 *   if (!r.ok) return new Response('Trop de requêtes', { status: 429 });
 */
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();

  // Opportunistic prune to keep memory bounded.
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) {
      if (b.resetAt < now) buckets.delete(k);
      if (buckets.size <= MAX_BUCKETS / 2) break;
    }
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.limit - 1, resetAt: now + opts.windowMs };
  }

  if (existing.count >= opts.limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return {
    ok: true,
    remaining: opts.limit - existing.count,
    resetAt: existing.resetAt,
  };
}

/**
 * Extract a best-effort client IP from a Next.js Request. We're behind
 * Caddy → Cloudflare, so the real IP is in `cf-connecting-ip`, with
 * `x-forwarded-for` as a fallback.
 */
export function getClientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  return "unknown";
}
