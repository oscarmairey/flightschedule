# FlySchedule

The app to easily manage the reservation schedule of your plane. Used by a small group of private pilots sharing a Cessna 182 (F-GBQA), replacing a fragmented Google Sheet + WhatsApp + paper logbook + Excel workflow with a single web app at **flyschedule.org**.

For full product scope, user flows, and feature details, see [PRD.md](./PRD.md).

---

## Quick Context

- **Users:** ~5–12 private pilots + 1–2 admins. Closed user group, no self-registration.
- **Core jobs:** Pilots book the aircraft, log flights, monitor HDV (flight hour) balance. Admins manage pilots, validate flights, configure availability.
- **Language:** **French only** for V1. UI copy, error messages, dates, and labels must be written in French.
- **Mobile-first:** Pilots use this on their phones at the airfield. Every screen must work on small touchscreens. Flight entry needs large tap targets and numeric keyboards.

---

## Tech Stack (installed versions)

| Layer        | Choice                                                     |
|--------------|------------------------------------------------------------|
| Framework    | Next.js **16.2.2** (App Router) + React 19.2 + Turbopack   |
| Styling      | Tailwind CSS **4** (CSS-first config in `globals.css`)     |
| Database     | PostgreSQL 16 (Docker)                                     |
| ORM          | Prisma **7.6** with `@prisma/adapter-pg` driver adapter    |
| Auth         | Auth.js v5 (`next-auth@beta`) — Credentials provider, JWT  |
| Password     | bcryptjs (pure JS, no native compile)                      |
| Payments     | Stripe Checkout + Webhooks                                 |
| File storage | Cloudflare R2 (presigned URL uploads)                      |
| Email        | Resend                                                     |
| Package mgr  | pnpm 10.33                                                 |
| Hosting      | Hetzner VPS + Caddy (auto-TLS)                             |

**No Redis. No message queue. No external APIs beyond Stripe, R2, and Resend.** Resist the urge to add infrastructure.

### Important version-specific notes

- **Next.js 16** has breaking changes vs Next 14/15. Read `node_modules/next/dist/docs/01-app/` before using anything you're unsure about. `AGENTS.md` at the project root has a reminder.
- **Tailwind 4** uses CSS-first config (`@import "tailwindcss"` + `@theme inline { ... }` in `src/app/globals.css`). There is no `tailwind.config.js`.
- **Prisma 7** requires either a driver adapter or `accelerateUrl` on `new PrismaClient()`. We use `PrismaPg` from `@prisma/adapter-pg`. Generated client lives at `src/generated/prisma/` (NOT `node_modules/.prisma/client`). Import the client from `@/generated/prisma/client` and enums from `@/generated/prisma/enums`. Configuration is in `prisma.config.ts`, NOT in the schema's `datasource` block.
- **Auth.js v5** API differs from NextAuth v4. `auth()` from `@/auth` is the canonical way to read sessions in **server components and route handlers**. Augment `next-auth` and `next-auth/jwt` modules via `declare module` for typed sessions. The `next-auth/jwt` augmentation only works if you explicitly import a type from it (e.g. `import type { JWT } from "next-auth/jwt"`) in the same file.
- **`trustHost: true` is required in `auth.config.ts` for production.** Without it, Auth.js v5 in production mode rejects any request whose `Host` header doesn't match `NEXTAUTH_URL` with `UntrustedHost`. We're behind Caddy + Cloudflare on the VPS — both terminate TLS and forward the canonical hostname, so the proxy chain is the security boundary, not the Host header. `unstable_update` is also re-exported from `@/auth` so the `/setup-password` server action can refresh the JWT (otherwise the proxy bounces the user back to `/setup-password` after a successful password change).
- **Prisma client must be lazily constructed.** `src/lib/db.ts` exports `prisma` as a `Proxy` that defers `new PrismaClient(...)` until first property access. This is load-bearing: `next build` collects page data by importing every route file, including `/api/webhooks/stripe` which transitively imports `@/lib/db`. Constructing at module load would throw `DATABASE_URL is not set` during the build. The lazy proxy fixes that AND caches in a module-level variable so production gets a true singleton (otherwise you exhaust Postgres connections — see git history).
- **Auth must be split into two files** because of the edge runtime:
  - `src/auth.config.ts` — edge-safe, NO Prisma/bcrypt imports. Holds session strategy, pages, and JWT/session callbacks. Imported by `src/proxy.ts`.
  - `src/auth.ts` — Node runtime, imports Prisma + bcrypt. Spreads `authConfig` and adds the Credentials provider whose `authorize()` queries the database.
  - **Rule of thumb:** if a file is imported (transitively) by `proxy.ts`, it cannot touch the Prisma client, the `pg` adapter, `bcryptjs`, or anything that pulls in `node:path`/`node:fs`. The error you'll see is `Native module not found: node:path` at request time.
- **`proxy.ts`, not `middleware.ts`** — Next.js 16 renamed the file convention. The semantics are the same; the warning if you use `middleware.ts` says `The "middleware" file convention is deprecated. Please use "proxy" instead.` There's a codemod: `npx @next/codemod@canary middleware-to-proxy .`

---

## Critical Architectural Rules

These rules are load-bearing. Violating any of them will silently corrupt data, money, or audit trails. When in doubt, ask before bypassing.

### 1. Durations are integers in minutes — ALWAYS

- Database stores all durations as `int` (minutes). No floats. No `decimal`. No strings.
- Display layer formats as `HH:MM`.
- Parse user input from HH:MM into minutes at the boundary.
- Naming convention: any duration field ends in `_min` (e.g., `hdv_balance_min`, `duration_min`, `actual_duration_min`).

### 2. The Transaction table is the source of truth for HDV

- **Never** update `User.hdv_balance_min` without inserting a corresponding `Transaction` row in the same DB transaction.
- `User.hdv_balance_min` is denormalized for read performance only — it must always equal `SUM(transactions.amount_min)` for that user.
- Every transaction stores `balance_after_min` so any historical balance can be reconstructed without replaying the full ledger.
- Transaction `type` enum: `package_purchase`, `reservation_debit`, `cancellation_refund`, `flight_reconciliation`, `admin_adjustment`. Do not invent new types without updating the PRD.

### 3. Reservation booking must be atomic

A booking is one DB transaction containing:
1. Lock the user row (or use `SELECT ... FOR UPDATE`)
2. Check no overlap with existing `confirmed` reservations on the same date
3. Check `user.hdv_balance_min >= reservation.duration_min`
4. INSERT Reservation (`status = confirmed`)
5. INSERT Transaction (`type = reservation_debit`, `amount_min = -duration_min`)
6. UPDATE `user.hdv_balance_min`

If any step fails, roll back the entire transaction. Never half-book.

### 4. Reservation → Flights is 1:N (V1.1)

- Every flight references exactly one reservation via `reservation_id` (NOT NULL).
- A reservation may hold **zero or more** flights — a pilot can log each leg of a multi-leg trip as a separate Flight (own photos, own route, own duration).
- **The reservation is the sole unit of HDV consumption.** The pre-debit at booking time is the entire HDV story for that slot. Flights are immutable logbook records and have **no HDV impact whatsoever** — no reconciliation, no credit for unused time, no debit for overrun. Whatever the pilot actually flew is paperwork, not accounting.
- This rule replaced the V1.0 1:1+reconciliation model in the `simplify_drop_reconciliation` migration. The `FlightStatus` enum and `FLIGHT_RECONCILIATION` transaction type were dropped at the same time. Historical FLIGHT_RECONCILIATION rows in the ledger were re-typed to `ADMIN_ADJUSTMENT` so balances reconstructed from the ledger still tie out.

### 5. Stripe webhook idempotency

- Always verify the webhook signature before processing.
- Store the Stripe session ID on the resulting Transaction's `reference` field.
- Before crediting, check whether a Transaction already exists with that session ID — if so, no-op and return 200. Stripe retries webhooks; double-crediting is unacceptable.

### 6. Photos: R2 bucket is FULLY PRIVATE — presigned URLs for both reads and writes

- The app server **never** transits photo bytes — neither on upload nor on read.
- **Bucket has no public access path.** No custom domain, no `r2.dev` URL, no `R2_PUBLIC_BASE_URL`. Anyone hitting `https://...r2.cloudflarestorage.com/cavok-flight-photos/<key>` without a valid signature gets 403. This is non-negotiable: logbook photos contain license numbers, signatures, and identifying flight data.
- **Write flow:** client requests `/api/upload/presign` → server checks the user owns the flight → server generates presigned PUT URL (15 min expiry, scoped per object key) → browser PUTs to R2 → client submits flight with R2 object keys.
- **Read flow:** when rendering a flight that has photos, the server (not the client) generates presigned GET URLs (15 min expiry) and passes them to the page. The user is authorized server-side first (pilot owns the flight, OR user is admin). Never return photo URLs in any API endpoint that doesn't first authorize the caller.
- Flight record stores `photos: text[]` (array of R2 object keys, e.g. `flights/{flight_id}/photo_1.jpg` — never URLs).
- **Server is the SOLE source of object keys.** Use `makePhotoKey(userId)` from `src/lib/r2.ts`. Flight submit re-validates each key with `isPhotoKeyOwnedBy()` and HEADs each one in R2 to confirm the upload landed.
- HEIC: V1 accepts `image/heic` mime-type as-is. Modern iOS Safari typically serves JPEG from the camera roll, so client-side conversion is deferred until proven needed on a real iPhone.
- **CORS is REQUIRED for the cross-origin browser → R2 PUT.** R2 buckets ship with no CORS policy by default. The policy must be set via the **Cloudflare REST API**, not the S3 `PutBucketCors` API — R2 access keys lack `s3:PutBucketCors` and return `AccessDenied`. Use `scripts/r2-cors-setup.ts` (idempotent, run once per bucket). Allowed origins are pinned to `https://flyschedule.org` (and `https://www.flyschedule.org`) plus localhost variants.
- Limits: max 5 photos per flight, max 10 MB per photo.
- Bucket: `cavok-flight-photos`, region WEUR. S3 endpoint is `R2_ENDPOINT` in `.env`; access keys are scoped to that single bucket (read+write only).

### 7. Cancellation rules

- **Pilot cancellation:** allowed only if `now < start_time - 24h`. Server-side enforcement, not just UI.
- **Admin cancellation:** allowed at any time, no time restriction.
- Both cancellations refund 100% of the originally deducted HDV via a `cancellation_refund` Transaction.
- After cancellation, status becomes `cancelled_by_pilot` or `cancelled_by_admin` — never just `cancelled`. Audit trail matters.

### 8. AvailabilityBlock precedence

- A `specific_date` override takes precedence over any `day_of_week` recurring block for that date.
- A `type = unavailable` override blocks bookings even on a normally available day.
- Pilots can ONLY book within `available` windows. Outside availability = uncreatable, not just hidden.

### 9. Flights are immutable on insert (V1.1)

- A flight is inserted into the database the moment the pilot submits the form. There is no `pending` → `validated` lifecycle, no admin queue, no validation step, no edit path. The `FlightStatus` enum was dropped in the `simplify_drop_reconciliation` migration.
- **No reconciliation, ever.** The flight has no `reservedDurationMin` or `reconciliationDeltaMin` columns anymore. It records `actualDurationMin` for the logbook only, with no link to the user's HDV balance.
- If an HDV correction is genuinely needed (rare — usually only for off-platform events like a wire transfer or a paper-logbook discrepancy), the admin uses the existing `ADMIN_ADJUSTMENT` Transaction path on `/admin/pilots/[id]` with a clear reason. There is no other way to mutate `User.hdvBalanceMin` from a flight context.
- **Cancellation belongs to reservations, not flights.** A pilot or admin can cancel a *reservation* (which refunds the HDV) up to 24 h before its start (admin: anytime). Once *any* flight has been logged against a reservation, the reservation is locked against cancellation — see rule #7. Flights themselves cannot be cancelled, edited, or deleted from the UI.
- The `/admin/flights` route was deleted entirely in V1.1.

### 10. Soft delete users only

- `User.is_active = false` for deactivation. Never `DELETE FROM users`.
- All other entities (Reservation, Flight, Transaction, AvailabilityBlock) preserve full history. No soft delete needed; status enums handle lifecycle.

---

## Authentication Notes

- Closed user group: admin creates accounts, no public registration endpoint.
- New accounts get a temp password and `must_reset_pw = true`. First login forces redirect to `/setup-password`.
- bcrypt for password hashing.
- Session-based auth via NextAuth Credentials provider.
- All `/admin/*` routes require `role = admin`. Enforce in middleware AND in route handlers (defense in depth).
- Rate-limit `/api/auth/*` and `/login`.

---

## Code & UX Conventions

- **Mobile-first Tailwind:** start with the small-screen layout, add `md:`/`lg:` breakpoints upward.
- **Touch targets ≥ 44px** for any interactive element on flight entry / calendar pages.
- **Numeric inputs** for durations should use `inputMode="numeric"` (or a custom HH:MM picker) to surface the numeric keyboard on mobile.
- **Time and date formatting:** French locale (`fr-FR`). Dates as `dd/MM/yyyy`, times as `HH:mm` (24h).
- **HDV display:** always `HH:MM`, never decimal hours. e.g., 1h30, not 1.5h.
- **Color hierarchy on balance:** green > 5h, amber 2–5h, red < 2h. Defined once as a constant, reused.
- **Forms:** validate on the server. Client-side validation is for UX only, never trust it.
- **Errors:** user-facing in French; logs in English are fine.
- **Don't introduce new dependencies casually.** The stack is intentionally small.

---

## Routes Map

Pilot: `/dashboard`, `/calendar`, `/flights/new`, `/flights`, `/account`, `/account/checkout/{success,cancel}`
Admin: `/admin`, `/admin/pilots`, `/admin/pilots/[id]`, `/admin/calendar`, `/admin/availability`
API: `/api/webhooks/stripe`, `/api/upload/presign`
Auth: `/login`, `/setup-password`

See PRD.md §6 for purpose of each route.

---

## V1 Boundary

The PRD §9 has the full out-of-scope list. The most common temptations to resist:

- ❌ Notifications (email/push on bookings, low balance) — V2
- ❌ Multi-aircraft support — V2+
- ❌ Maintenance tracking — V2
- ❌ Recurring pilot reservations — V2
- ❌ iCal / Google Calendar export — V2
- ❌ Financial reporting / dashboards beyond the basic admin overview — V2
- ❌ Native mobile app — web only (PWA possible)
- ❌ Internationalization — French only
- ❌ In-app refunds — handled in Stripe dashboard
- ❌ OCR on logbook photos — V2

If a feature request seems to fit one of these, push back and confirm before implementing.

---

## Data Integrity Checklist

Before merging any code that touches HDV, reservations, or flights, verify:

- [ ] Every balance change has a corresponding Transaction
- [ ] `User.hdv_balance_min` updates and Transaction insert are in the same DB transaction
- [ ] Stripe webhook handler is idempotent (checks Stripe session ID)
- [ ] Reservation booking is atomic (no overlap + balance check + insert in one transaction)
- [ ] Server-side enforcement of cancellation 24h rule
- [ ] Server-side enforcement of admin-only operations
- [ ] Validated flights cannot be edited
- [ ] Photos referenced by R2 keys, not transited through the app

---

## Dev Workflow

### Port allocation (this server, not arbitrary)

This VPS already runs other apps under the same Caddy. FlySchedule deliberately uses non-default ports to stay clear of them:

| Service        | Host port  | Container port | Binding     | Why                                                          |
|----------------|------------|----------------|-------------|--------------------------------------------------------------|
| `cavok-web`    | **6000**   | 3000           | `0.0.0.0`   | `library.oscarmairey.com` already proxies to `localhost:3000`|
| `cavok-db`     | **5442**   | 5432           | `127.0.0.1` | `library-db-1` already binds `127.0.0.1:5433`                |

> The container names are still `cavok-*` because they identify a running deployment with a live Postgres volume (`cavok_postgres_data`). Renaming them is a separate, scheduled operation — see "Legacy `cavok-*` names" below.

If you change these, also update `.env` (`DATABASE_URL`) and the Caddyfile entry for `flyschedule.org`.

### Docker is production-only — no `Dockerfile.dev`

The `Dockerfile` is a multi-stage **production** build: deps → builder (`prisma generate` + `next build` with `output: 'standalone'`) → runner (`node server.js`, non-root, ~50 MB final image). There is no dev-mode Dockerfile and no bind-mount of source. The single deploy command is:

```bash
docker compose up -d --build     # rebuilds image, recreates containers
                                 # web → 0.0.0.0:6000, db → 127.0.0.1:5442
docker compose logs -f web       # tail server.js logs
```

**Why production-only:** dev mode in containers caused painful collisions (a stale `.next/dev/lock` from a host `next dev` getting bind-mounted into the container blocking the container's own `next dev`). The operator's strong preference is that one command sets up everything cleanly. If you need hot-reload during local iteration, run `pnpm dev` directly on the host — separately from the Docker stack.

The `pnpm.supportedArchitectures` block in `package.json` forces pnpm to fetch BOTH glibc (host = Ubuntu) and musl (container = Alpine) variants of `next-swc` so the same `pnpm install` works for both.

### Local Postgres only (host Next.js dev)

```bash
docker compose up -d db          # start Postgres (bound to 127.0.0.1:5442)
pnpm install                     # one-time
pnpm db:migrate                  # apply migrations
pnpm db:seed                     # create the bootstrap admin
pnpm dev                         # Next.js on http://localhost:3000
```

Public URL via Caddy + Cloudflare: **https://flyschedule.org**

### Common Prisma scripts

| Command            | Purpose                                                  |
|--------------------|----------------------------------------------------------|
| `pnpm db:migrate`  | Create and apply a new migration in dev                  |
| `pnpm db:generate` | Regenerate the Prisma client after schema edits          |
| `pnpm db:push`     | Push schema to DB without creating a migration (dev only)|
| `pnpm db:seed`     | Run `prisma/seed.ts` (idempotent — uses upsert)          |
| `pnpm db:studio`   | Open Prisma Studio at localhost:5555                     |

### Bootstrap admin (set in `.env`)

`ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_NAME` / `ADMIN_BOOTSTRAP_PASSWORD` — consumed by `prisma/seed.ts`. The seeded admin has `mustResetPw=false` because the password is operator-set.

---

## Production access (this server)

- **Public URL:** https://flyschedule.org
- **Server IP:** 89.167.7.195 (Hetzner)
- **DNS:** Cloudflare proxied records for `flyschedule.org` (apex + `www`) → server IP. Proxied (orange cloud) is **required** because Caddy serves a Cloudflare Origin CA cert at the origin that browsers only trust when traffic comes via Cloudflare's edge.
- **TLS at the origin:** `/etc/caddy/certs/flyschedule.org.{pem,key}` — Cloudflare Origin CA cert covering `flyschedule.org` + `www.flyschedule.org`. Dedicated to this app (other apps on the same VPS use a separate `*.oscarmairey.com` cert).
- **Caddy block** (in `/etc/caddy/Caddyfile`, applied with `sudo systemctl reload caddy`):

  ```
  flyschedule.org {
      tls /etc/caddy/certs/flyschedule.org.pem /etc/caddy/certs/flyschedule.org.key
      reverse_proxy localhost:6000
  }

  www.flyschedule.org {
      tls /etc/caddy/certs/flyschedule.org.pem /etc/caddy/certs/flyschedule.org.key
      redir https://flyschedule.org{uri} permanent
  }
  ```

- **Other apps on this same VPS** (different ports, same Caddy):
  - `library.oscarmairey.com` → `localhost:3000` (uses Postgres on `127.0.0.1:5433`)
  - `oscarmairey.com` → `localhost:3100`
  - `miniflux.oscarmairey.com` → `localhost:8080`
  - `rss.oscarmairey.com` → `localhost:1200`
  - `www.oscarmairey.com` → 301 to apex
- **Cloudflare account:** ID `7004afe5481e5474f5d12a6fd180a84f`. The DNS+R2 management token has prefix `cfat_`. Verify it via `GET /accounts/{account_id}/tokens/verify` (the **account-scoped** verify endpoint, not `/user/tokens/verify`).
- **R2:** bucket `cavok-flight-photos` in WEUR, fully private (no custom domain, no public r2.dev URL). See architectural rule #6. The bucket was created under the old project name and has not been renamed — see "Legacy `cavok-*` names" below.

---

## Project Status

**Foundation laid as of April 2026.** Working scaffold includes:

- Next.js 16 + React 19 + Tailwind 4 + TypeScript, running in Docker behind Caddy at https://flyschedule.org
- Prisma 7 schema covering all V1 entities (User, Reservation, Flight, Transaction, AvailabilityBlock) — first migration applied
- Auth.js v5 Credentials provider + JWT sessions + route protection via `proxy.ts` (split into `auth.config.ts` edge-safe / `auth.ts` Node)
- Placeholder pages: `/login` (working sign-in form), `/dashboard`, `/setup-password`
- Docker Compose: Postgres on `127.0.0.1:5442` + Next.js on `0.0.0.0:6000`
- Bootstrap admin seeded (`o@mairey.net`)
- Cloudflare R2 bucket `cavok-flight-photos` (private), S3 access keys in `.env`
- GitHub repo: `oscarmairey/flyschedule` (private)

**V1 fully built and deployed as of commit `4544dc8`.** Live behind Caddy at https://flyschedule.org via the production multi-stage Docker image. All 21 routes registered; Stripe Checkout end-to-end (test mode) verified with a successful 5h credit; admin pilot CRUD, calendar + atomic booking, flight entry with R2 photo upload (CORS configured), admin validation queue, and admin overview all live.

**V1.1 simplification (April 2026, decision D5)** — `simplify_drop_reconciliation` migration removed three things at once:
1. **HDV reconciliation** — flights no longer credit/debit the user. The reservation pre-debit is the entire HDV story for a slot.
2. **1:1 reservation↔flight constraint** — a reservation can now hold multiple flights (multi-leg trips, "+ ajouter un vol" UX on `/flights/new`).
3. **Admin flight validation** — flights are immutable on insert. The `/admin/flights` route, the `validateFlight`/`editFlight` server actions, the `FlightStatus` enum, and the `FLIGHT_RECONCILIATION` transaction type were all dropped. Historical FLIGHT_RECONCILIATION rows in the ledger were re-typed to `ADMIN_ADJUSTMENT` so balances reconstructed from history still tie out to the minute.

**One-shot setup scripts** (operator runs once per environment, all idempotent):
- `corepack pnpm tsx scripts/stripe-setup.ts` — creates Products + Prices + webhook endpoint, prints env block to paste into `.env`
- `corepack pnpm tsx scripts/r2-cors-setup.ts` — applies the CORS policy to the R2 bucket via the Cloudflare REST API
- `scripts/backup-db.sh` — nightly encrypted Postgres dump → R2 (cron on the host)

**Operator preferences worth respecting** (these came up during V1 implementation):
- When credentials are present in `.env`, USE them to do setup work autonomously. Don't punt to "the operator runs `stripe listen`" — the API works.
- Docker = production build. Never propose dev mode in containers.

---

## Legacy `cavok-*` names

The project was originally called CAVOK Glass Cockpit. It was rebranded to **FlySchedule** (the app to easily manage the reservation schedule of your plane) at the flyschedule.org cutover. The user-visible brand, repo, domain, and source code now all use the FlySchedule name. A few **infrastructure identifiers** still carry the old `cavok` prefix, deliberately, because renaming them is a stateful migration rather than a string-replace:

| Identifier                          | Where                       | Why it stayed                                                                                  |
|-------------------------------------|-----------------------------|------------------------------------------------------------------------------------------------|
| Working directory `/opt/cavok`      | filesystem                  | The deploy path is referenced by the `cavok-web` container CWD, the cron job in `crontab`, the systemd-managed Caddy config, and operator muscle memory. Move = coordinated downtime. |
| Container `cavok-web` / `cavok-db`  | `docker-compose.yml`        | Cosmetic in `docker ps`, but `docker compose` keys identity by service+container name. A rename = `down` + `up`, scheduled.                             |
| Volume `cavok_postgres_data`        | `docker-compose.yml`        | **Holds the live database.** Renaming the key would orphan it and create a new empty volume; recovery requires `external: true` re-binding.            |
| Postgres user/db `cavok` / `cavok`  | `.env`, `POSTGRES_*`        | The schema and grants live in this DB. A rename is a `pg_dump` + reload + `DATABASE_URL` rotate.                                                        |
| R2 bucket `cavok-flight-photos`     | `.env`, `r2.ts`             | Holds existing flight photos. Renaming a bucket means recreating it and copying objects (R2 has no native rename) — and reissuing scoped access keys.   |
| R2 bucket `cavok-db-backups`        | `scripts/backup-db.sh`      | Holds historical encrypted Postgres dumps. Same constraint as above.                                                                                    |
| Image tag `cavok-web:latest`        | `docker-compose.yml`        | Local image name only — harmless. Will flip when the compose file is next touched.                                                                      |

**Rule for the agent:** when working in this repo, treat the legacy `cavok-*` identifiers as opaque infrastructure handles, not branding. Do **not** propose mass renames as a cleanup pass — every one of them is a planned operation that needs operator coordination. If a future task explicitly schedules the cutover, the order is: stop traffic → `pg_dump` → recreate volume + DB under new names → restore → rotate `DATABASE_URL` → recreate R2 buckets + copy objects → rotate R2 keys → `docker compose down && up -d` with new container names → move `/opt/cavok` → update Caddy + cron → smoke test.
