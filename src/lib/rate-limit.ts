// FlightSchedule — in-memory rate limiter (no Redis).
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

// Opportunistic prune to keep memory bounded. Called from both the
// consume and peek paths so long-running dev servers don't leak entries.
function prune(now: number): void {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k);
    if (buckets.size <= MAX_BUCKETS / 2) break;
  }
}

/**
 * Atomically check + consume a token.
 *
 * Increments the counter every call. Use this when EVERY request is a
 * countable event regardless of outcome — e.g. `/api/upload/presign`
 * (the presigned URL is issued either way, so every call eats a token).
 *
 * Do NOT use this for login, where only FAILED attempts should count —
 * reach for `rateLimitPeek` + `rateLimitHit` instead so a legitimate
 * pilot can keep signing in after a typo on somebody else's laptop.
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
  prune(now);

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
 * Check whether `key` is currently at or over `limit` WITHOUT
 * consuming a token. Use before an operation whose SUCCESS should
 * NOT count against the limit (e.g. a correct password), paired with
 * `rateLimitHit` on the failure branch.
 *
 * Returns `true` if the caller is still allowed to attempt the
 * operation, `false` if they've burned through the budget.
 */
export function rateLimitPeek(key: string, limit: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt < now) return true;
  return existing.count < limit;
}

/**
 * Record a single failure against `key`, opening a fresh window if
 * none is active. Mirror of the "consume" side of `rateLimit` but
 * without the up-front check — the caller has already verified via
 * `rateLimitPeek` that they were allowed to attempt.
 */
export function rateLimitHit(
  key: string,
  opts: { windowMs: number },
): void {
  const now = Date.now();
  prune(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return;
  }
  existing.count += 1;
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
