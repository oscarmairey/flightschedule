import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  rateLimit,
  rateLimitPeek,
  rateLimitHit,
  getClientIp,
} from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    // Each test uses a unique key so the in-memory Map state doesn't
    // carry over between tests.
    vi.useRealTimers();
  });

  it("allows up to `limit` requests within the window", () => {
    const key = `t:${Math.random()}`;
    const opts = { limit: 3, windowMs: 60_000 };
    const a = rateLimit(key, opts);
    const b = rateLimit(key, opts);
    const c = rateLimit(key, opts);
    expect([a.ok, b.ok, c.ok]).toEqual([true, true, true]);
    expect(c.remaining).toBe(0);
  });

  it("blocks the (limit+1)-th request", () => {
    const key = `t:${Math.random()}`;
    const opts = { limit: 2, windowMs: 60_000 };
    rateLimit(key, opts);
    rateLimit(key, opts);
    const blocked = rateLimit(key, opts);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resets after the window elapses", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-04-15T10:00:00.000Z"));
      const key = `t:${Math.random()}`;
      const opts = { limit: 1, windowMs: 60_000 };
      expect(rateLimit(key, opts).ok).toBe(true);
      expect(rateLimit(key, opts).ok).toBe(false);

      vi.setSystemTime(new Date("2026-04-15T10:01:01.000Z"));
      expect(rateLimit(key, opts).ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tracks different keys independently", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    const a = `t:${Math.random()}`;
    const b = `t:${Math.random()}`;
    expect(rateLimit(a, opts).ok).toBe(true);
    expect(rateLimit(a, opts).ok).toBe(false);
    expect(rateLimit(b, opts).ok).toBe(true);
  });
});

describe("rateLimitPeek + rateLimitHit (failure-only pattern)", () => {
  it("peek does not consume", () => {
    const key = `peek:${Math.random()}`;
    expect(rateLimitPeek(key, 3)).toBe(true);
    expect(rateLimitPeek(key, 3)).toBe(true);
    expect(rateLimitPeek(key, 3)).toBe(true);
    // Only peeking never pushes the counter up.
    rateLimitHit(key, { windowMs: 60_000 });
    rateLimitHit(key, { windowMs: 60_000 });
    // Still under a limit of 3 (two hits so far).
    expect(rateLimitPeek(key, 3)).toBe(true);
  });

  it("returns false once `limit` hits have been recorded", () => {
    const key = `fail:${Math.random()}`;
    rateLimitHit(key, { windowMs: 60_000 });
    rateLimitHit(key, { windowMs: 60_000 });
    rateLimitHit(key, { windowMs: 60_000 });
    expect(rateLimitPeek(key, 3)).toBe(false);
    expect(rateLimitPeek(key, 4)).toBe(true);
  });

  it("fresh window after expiry re-opens peek", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-04-15T10:00:00.000Z"));
      const key = `fresh:${Math.random()}`;
      rateLimitHit(key, { windowMs: 60_000 });
      rateLimitHit(key, { windowMs: 60_000 });
      expect(rateLimitPeek(key, 2)).toBe(false);

      vi.setSystemTime(new Date("2026-04-15T10:02:00.000Z"));
      expect(rateLimitPeek(key, 2)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("models the authorize() flow: successes never consume", () => {
    const email = `auth:${Math.random()}@x.y`;
    const key = `login:${email}`;
    // Simulate 9 successful logins. Each peeks true, no hit recorded.
    for (let i = 0; i < 9; i += 1) {
      expect(rateLimitPeek(key, 10)).toBe(true);
      // success path — no rateLimitHit
    }
    // 10th attempt: wrong password → hit. Still under limit so peek ok.
    expect(rateLimitPeek(key, 10)).toBe(true);
    rateLimitHit(key, { windowMs: 15 * 60_000 });
    // Many more successes still allowed.
    for (let i = 0; i < 50; i += 1) {
      expect(rateLimitPeek(key, 10)).toBe(true);
    }
  });
});

describe("getClientIp", () => {
  it("prefers cf-connecting-ip", () => {
    const req = new Request("http://x.test", {
      headers: {
        "cf-connecting-ip": "1.2.3.4",
        "x-forwarded-for": "9.9.9.9, 10.0.0.1",
      },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to the first x-forwarded-for entry", () => {
    const req = new Request("http://x.test", {
      headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("returns 'unknown' when neither header is present", () => {
    const req = new Request("http://x.test");
    expect(getClientIp(req)).toBe("unknown");
  });
});
