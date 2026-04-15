# FlightSchedule — Testing Suite

> 244 tests in three layers. Unit + integration run in ~25 s, full E2E in ~40 s.
> Built April 2026 alongside the flightschedule.org production cutover.

---

## TL;DR

```bash
pnpm test:db:up        # one-time per session: bring up the sandbox Postgres
pnpm test              # unit (142) + integration (62)
pnpm build && pnpm test:e2e   # Playwright desktop + mobile (20 + 20)
```

Everything is isolated from dev and prod — migrations re-apply and tables truncate automatically.

---

## Why three layers

| Layer        | Runner       | Touches                                 | Count | Speed    | Jobs                                                                  |
|--------------|--------------|-----------------------------------------|-------|----------|-----------------------------------------------------------------------|
| Unit         | Vitest       | Nothing — pure logic only               | 142   | <1 s     | Parsers, formatters, validators, key helpers. Net spy blocks TCP.     |
| Integration  | Vitest       | Real Postgres on `127.0.0.1:5443`       | 62    | ~25 s    | Every serializable-transaction contract (rules #2, #3, #3b, #5, …).   |
| E2E          | Playwright   | Full `next start` build + Chromium      | 40    | ~40 s    | User journeys through the real UI, desktop + mobile viewports.        |

Each layer has a distinct job. Unit tests lock pure logic behind a net guard (no DB access permitted — a `net.Socket.prototype.connect` spy fails the test if anything tries to open a socket). Integration tests exercise the real Prisma client against the sandbox DB so the serializable-transaction contracts in CLAUDE.md are executable, not aspirational. E2E runs against the same production bundle we ship, to catch wiring that only manifests in the built app (proxy matcher, server-action redirects, cookie plumbing).

---

## File map

```
flightschedule/
├── vitest.config.ts               # base config (paths alias, coverage)
├── vitest.workspace.ts            # 2 projects: unit, integration
├── playwright.config.ts           # desktop (Chromium) + mobile (Pixel 5)
├── docker-compose.test.yml        # Postgres on :5443, volume cavok_postgres_test_data
├── .env.test                      # gitignored; .env.test.example is the template
├── prisma.config.ts               # reused as-is by both layers
└── tests/
    ├── tsconfig.json              # extends root; excluded from `next build`
    ├── setup/
    │   ├── env.ts                 # loads .env.test + asserts DATABASE_URL is sandbox
    │   ├── db.ts                  # singleton Prisma (@/lib/db) + resetDb() TRUNCATE
    │   ├── factories.ts           # makeUser, makeReservation, makeFlight, …
    │   ├── mocks.ts               # R2 mock state + helpers
    │   ├── stripe-fixtures.ts     # HMAC-signed Stripe webhook payload builder
    │   ├── unit.ts                # net-connect spy for the unit project
    │   └── integration.ts         # vi.mock(next/cache, @/lib/r2), beforeEach truncate
    ├── unit/                      # 7 files × pure-logic cases
    │   ├── duration.test.ts
    │   ├── format.test.ts
    │   ├── pricing.test.ts
    │   ├── payment-ref.test.ts
    │   ├── r2.test.ts
    │   ├── validation.test.ts
    │   └── rate-limit.test.ts
    ├── integration/               # 10 files, one per critical flow / rule
    │   ├── hdv.test.ts                    # rule #2 ledger chokepoint
    │   ├── reservations-book.test.ts      # rule #3 atomicity + half-open overlap
    │   ├── reservations-cancel.test.ts    # rule #7 24h rule + autoCreated lock
    │   ├── flights-submit.test.ts         # rule #3b + rule #6 photo ownership
    │   ├── flights-admin-edit.test.ts     # rule #9 compensating ADMIN_ADJUSTMENT
    │   ├── availability.test.ts           # rule #8 specific_date beats day_of_week
    │   ├── stripe-webhook.test.ts         # rule #5 idempotency + real HMAC
    │   ├── bank-transfer.test.ts          # pilot prepare → admin validate/reject
    │   ├── auth.test.ts                   # Credentials authorize() replica
    │   └── invariants.test.ts             # SUM(tx.amountMin) == user.hdvBalanceMin
    └── e2e/
        ├── global-setup.ts        # migrate + seed fixtures (via tsx subprocess)
        ├── seed-fixtures.ts       # stand-alone seed run by global-setup
        ├── fixtures.ts            # loginAs() helper waits for the redirect to land
        ├── access-control.spec.ts
        ├── auth.spec.ts
        ├── dashboard.spec.ts
        ├── calendar.spec.ts
        ├── flights.spec.ts
        ├── checkout.spec.ts
        ├── admin-pilots.spec.ts
        ├── admin-disponibilites.spec.ts
        ├── admin-tarifs.spec.ts
        ├── admin-virements.spec.ts
        └── admin-flight-edit.spec.ts
```

---

## The sandbox database

Integration + E2E both hit `postgresql://cavok_test:cavok_test@127.0.0.1:5443/cavok_test`, served by a dedicated container defined in `docker-compose.test.yml`:

- Container name: `cavok-db-test`
- Port: `127.0.0.1:5443` (picked so it can't collide with the dev DB on `:5442` or prod on `:5432`)
- Volume: `cavok_postgres_test_data`
- Legacy `cavok-*` prefix kept per CLAUDE.md's "Legacy names" rule — never renamed casually.

### Safety guardrail (load-bearing)

`tests/setup/env.ts` refuses to run if `DATABASE_URL` doesn't match `:5443/cavok_test`:

```ts
const SAFE_PATTERN = /:5443\/cavok_test(\?|$)/;
if (!SAFE_PATTERN.test(url)) {
  throw new Error("refusing to run — DATABASE_URL looks non-sandbox");
}
```

Integration tests TRUNCATE the entire database before every test. If this guard were ever bypassed and pointed at dev or prod, it would erase real data silently. Keep the guard; keep the port pinned.

### Keeping the container warm vs. recycling

Warm-keep is the default. The container stays up between runs and each test invocation pays ~1 s for `migrate deploy` (no-ops when migrations are already applied) plus truncation.

Recycle-per-run would cost ~5–8 s every time (container boot + Postgres `initdb` + all 8 migrations replay) for no correctness benefit, since:

- Schema drift: `prisma migrate deploy` on a warm DB picks up any new committed migration on next run.
- State drift: `beforeEach` truncates every table in the integration project; Playwright's `global-setup.ts` does a full TRUNCATE + reseed.

When you genuinely want to start from scratch (corrupted volume, suspicious behaviour):

```bash
pnpm test:db:down    # docker compose down -v (removes the volume)
pnpm test:db:up      # fresh container
pnpm test:db:reset   # re-apply migrations
```

---

## Scripts reference

| Command              | What it does                                                       |
|----------------------|--------------------------------------------------------------------|
| `pnpm test`          | Vitest: unit + integration (both projects)                          |
| `pnpm test:unit`     | Vitest: unit project only (~1 s)                                    |
| `pnpm test:int`      | Vitest: integration project only (~25 s)                            |
| `pnpm test:watch`    | Vitest watch mode                                                   |
| `pnpm test:cov`      | Vitest with V8 coverage (text + HTML + lcov reports)                |
| `pnpm test:e2e`      | Playwright: both projects (desktop + mobile), 40 tests              |
| `pnpm test:e2e:ui`   | Playwright UI mode — interactive debugger                           |
| `pnpm test:db:up`    | `docker compose up -d --wait` on `docker-compose.test.yml`          |
| `pnpm test:db:down`  | `docker compose down -v` — wipes the volume                         |
| `pnpm test:db:reset` | `prisma migrate deploy` against `.env.test`'s DATABASE_URL          |
| `pnpm typecheck`     | `tsc --noEmit` over the app code (tests excluded via tsconfig)      |

---

## Environment

`.env.test` is gitignored; `.env.test.example` is the committed template. Copy on first setup:

```bash
cp .env.test.example .env.test
```

Important values:

- `DATABASE_URL` → sandbox DB (guarded)
- `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` → `http://localhost:6100` (Playwright port — 3100 is taken by `oscarmairey.com` on this VPS)
- `STRIPE_WEBHOOK_SECRET` → any fixture value; integration tests HMAC-sign their own payloads with this secret, so it only has to be consistent
- `R2_*`, `RESEND_*` → fixture values; R2 is mocked globally in `tests/setup/mocks.ts`, Resend isn't exercised in current tests

---

## What's tested per CLAUDE.md rule

| Rule                                            | Where                                    | Key assertions                                                                                                   |
|-------------------------------------------------|------------------------------------------|-------------------------------------------------------------------------------------------------------------------|
| #1 Durations are integer minutes                | `tests/unit/duration.test.ts`            | `parseHHMM`, `formatHHMM`, `parseTachyToHundredths`, cross-midnight `parseEngineTimes`, bounds enforcement       |
| #2 Transaction = source of truth                | `tests/integration/hdv.test.ts` + `invariants.test.ts` | Balance + ledger insert atomic; `allowNegative` gate; concurrent mutations serialised; `hdvBalanceMin == Σ amountMin` invariant across 20-op workload |
| #3 Reservation booking atomic                   | `tests/integration/reservations-book.test.ts` | Half-open overlap; cross-pilot conflict; `AvailabilityBlock` specific_date vs day_of_week precedence; concurrent race; `OpenPeriod` always-open fallback |
| #3b Flight submission atomic                    | `tests/integration/flights-submit.test.ts` | Happy path + FLIGHT_DEBIT; future rejection (60 s tolerance); cross-pilot engine-time overlap; negative-balance allowed; photo-key ownership; `too_many_photos`; tach both-or-neither |
| #5 Stripe webhook idempotency                   | `tests/integration/stripe-webhook.test.ts` | Real HMAC `constructEvent`; replay no-op; tampered body → 400; unpaid session skip; `payment_intent.succeeded` path |
| #6 R2 photo ownership                           | `tests/unit/r2.test.ts` + flights-submit | `isPhotoKeyOwnedBy` rejects cross-user, path traversal, bad extension; `makePhotoKey` shape; smuggled key rejected in submit |
| #7 Cancellation timing                          | `tests/integration/reservations-cancel.test.ts` | 24 h rule enforced server-side; admin bypass; `autoCreatedFromFlight` lock (blocks pilot AND admin); double-cancel guard |
| #8 Availability precedence                      | `tests/integration/availability.test.ts` | `specific_date` beats `day_of_week`; empty OpenPeriods = always open; multi-day + DST-safe iteration                |
| #9 Admin flight edit                            | `tests/integration/flights-admin-edit.test.ts` | Compensating ADMIN_ADJUSTMENT on duration change; original FLIGHT_DEBIT row byte-identical; zero-delta = no row; overlap reject |
| #10 Soft-delete users only                      | `tests/integration/invariants.test.ts`   | Deactivation via `isActive=false`; row preserved                                                                  |

---

## Patterns for writing new tests

### Integration test against the real DB

```ts
import { describe, it, expect } from "vitest";
import { getTestPrisma } from "../setup/db";
import { makeUser, makeReservation } from "../setup/factories";

describe("my new flow", () => {
  it("does the thing", async () => {
    const prisma = getTestPrisma();
    const pilot = await makeUser({ hdvBalanceMin: 600 });
    const res = await makeReservation({ userId: pilot.id });
    // …exercise code under test, assert DB state
  });
});
```

`beforeEach` truncates automatically; no cleanup needed.

### Server action with `requireSession` / `requireAdmin`

Mock the session module locally (top-level `vi.mock` hoists):

```ts
let currentUserId = "";
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    user: { id: currentUserId, email: "x@y", role: "PILOT", mustResetPw: false },
  })),
  requireAdmin: vi.fn(async () => ({
    user: { id: currentUserId, email: "x@y", role: "ADMIN", mustResetPw: false },
  })),
}));
```

Catch Next's `redirect()` control-flow throw:

```ts
function captureRedirect(err: unknown): string | null {
  const digest = (err as { digest?: string })?.digest;
  if (!digest?.startsWith("NEXT_REDIRECT")) return null;
  return digest.split(";")[2] ?? "";
}
```

See `tests/integration/flights-submit.test.ts` for the complete pattern.

### Signing a Stripe webhook payload

Use `tests/setup/stripe-fixtures.ts` — no `stripe-mock` container needed. The webhook route's real `constructEvent` runs end-to-end against a locally-signed payload:

```ts
const body = buildCheckoutSessionCompletedEvent({
  sessionId: "cs_test_0001",
  userId: pilot.id,
  hdvMinutes: 300,
  amountTotalCents: 18000,
});
const sig = signStripePayload(body, process.env.STRIPE_WEBHOOK_SECRET!);
const res = await POST(new NextRequest("http://x/api/webhooks/stripe", {
  method: "POST",
  headers: { "stripe-signature": sig, "content-type": "application/json" },
  body,
}));
```

### Playwright spec

`fixtures.ts` exposes `loginAs(page, "admin" | "pilot1" | "pilot2")` which awaits the post-login navigation before returning. After that, the page is authenticated for the duration of the test's context.

```ts
import { test, expect, loginAs } from "./fixtures";

test("my spec", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/admin/pilots");
  await expect(page).toHaveURL(/\/admin\/pilots/);
});
```

Fixture accounts and their passwords live in `tests/e2e/global-setup.ts`. All three accounts share the password `Pilot-Test-1234` for simplicity.

---

## External services

- **Stripe** — Never mocked globally. The webhook integration test signs real HMAC payloads with the test secret so `stripe.webhooks.constructEvent` runs end-to-end. UI-level Stripe Checkout is out of scope (would need a live Stripe account).
- **Cloudflare R2** — Mocked in `tests/setup/mocks.ts` via a hoisted `vi.mock("@/lib/r2", …)` in `tests/setup/integration.ts`. The pure helpers (`makePhotoKey`, `isPhotoKeyOwnedBy`, `PHOTO_LIMITS`) keep their real implementations so ownership validation stays honest. Tests register "uploaded" keys via `markUploaded()` or override `headObjectImpl` directly.
- **Resend** — Not exercised. Add a mock when the first email path gets test coverage.
- **Prisma client** — NEVER mocked. Integration tests go through the real serializable transactions to catch the bugs CLAUDE.md warns about.

---

## Rate-limit test anecdote (April 2026)

The first E2E run failed late because `src/auth.ts` used `rateLimit()` on every login attempt — pilot1 hit the 10-per-15-min cap after ~11 tests. Rather than patch in a test-only bypass, the production rate limiter was redesigned: `rateLimitPeek()` reads without consuming, `rateLimitHit()` consumes on the failure branch. Now only failed attempts count. Legitimate pilots can re-authenticate freely; credential stuffers still cap at 10 bad passwords. See `src/lib/rate-limit.ts` + `src/auth.ts` for the final shape, `tests/unit/rate-limit.test.ts` for assertions.

---

## Troubleshooting

### "DATABASE_URL does not look like the sandbox"

You didn't set `DATABASE_URL` to the sandbox URL. Either copy `.env.test.example` to `.env.test`, or in the shell:

```bash
set -a && . .env.test && set +a
```

Guard lives at `tests/setup/env.ts:22` — intentional.

### Deadlock on `TRUNCATE` in `resetDb`

Some prior test left an idle transaction open. This was the symptom that led to configuring `singleFork: true` + `isolate: false` in `vitest.workspace.ts`. If it resurfaces, it means a new test file is leaking a transaction — most likely via an uncaught `redirect()` from a Next server action. Wrap the server action call in `runExpectingRedirect`.

### Playwright: "Executable doesn't exist at .../webkit-…/pw_run.sh"

The mobile project was previously iPhone 14 (WebKit) but WebKit's system libs require sudo on this VPS. Mobile is now `Pixel 5` (Chromium-based mobile emulation). If you re-enable WebKit, install via `pnpm exec playwright install --with-deps webkit` with a root-capable operator.

### Port 3100 redirects to some unrelated app

Port 3100 is `oscarmairey.com` on this VPS. Playwright is on `6100` for that reason. Don't change the port without updating `.env.test` + `playwright.config.ts` + `NEXTAUTH_URL` + `NEXT_PUBLIC_APP_URL` together.

### Next.js build fails type-checking `tests/`

The `tsconfig.json` at the root excludes `tests/`, `vitest.*.ts`, and `playwright.config.ts` — these are type-checked only by Vitest/Playwright's own runners. If `next build` starts type-checking them, check the `exclude` array.

---

## Coverage targets

Currently no enforced threshold. Baseline target in the plan: ≥ 90 % line coverage on `src/lib/{hdv,reservations,duration,format,availability,r2,validation,pricing,payment-ref,rate-limit}.ts` and ≥ 80 % on server-action files touching the DB. Run `pnpm test:cov` and inspect `coverage/index.html`.

---

## What's explicitly OUT of scope

- Load / performance tests (the app has 5–12 users).
- Visual regression (stack churn too high pre-V2).
- GitHub Actions workflow (deferred; scripts are structured so a later `.github/workflows/test.yml` is a thin wrapper calling `pnpm typecheck && pnpm test && pnpm test:e2e`).
- `stripe-mock` container (signed-payload approach is simpler and exercises `constructEvent` for real).
- Email path coverage (no Resend mock yet — add when the first email feature is tested).
- OCR on logbook photos (V2 feature, not implemented yet).

---

## History

- **Scaffold** — `docker-compose.test.yml`, `vitest.config.ts`, `vitest.workspace.ts`, `playwright.config.ts`, `tests/setup/*`, `.env.test.example`, package scripts.
- **Unit (142)** — seven files covering every pure helper in `src/lib`.
- **Integration (62)** — ten files, one per rule / flow.
- **E2E (40)** — twelve specs × two projects (desktop Chromium + mobile Pixel 5).
- **Production fix ported** — rate limiter redesigned to count failures only, not successes (see anecdote above).
