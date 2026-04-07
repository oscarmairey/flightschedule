# CAVOK Glass Cockpit

Digital management platform for the Cessna 182 F-GBQA, replacing a fragmented Google Sheet + WhatsApp + paper logbook + Excel workflow with a single web app at **cavok.ovh**.

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
- **Auth.js v5** API differs from NextAuth v4. `auth()` from `@/auth` is the canonical way to read sessions in server components. The middleware uses the `auth()` higher-order wrapper. Augment `next-auth` and `next-auth/jwt` modules via `declare module` for typed sessions.

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

### 4. Reservation ↔ Flight is 1:1 and mandatory

- Every flight references exactly one reservation via `reservation_id` (NOT NULL).
- A reservation has at most one flight.
- The reservation holds the original HDV deduction; the flight holds any reconciliation delta when actual ≠ reserved duration.

### 5. Stripe webhook idempotency

- Always verify the webhook signature before processing.
- Store the Stripe session ID on the resulting Transaction's `reference` field.
- Before crediting, check whether a Transaction already exists with that session ID — if so, no-op and return 200. Stripe retries webhooks; double-crediting is unacceptable.

### 6. Photos go directly browser → R2

- The app server **never** transits photo bytes.
- Flow: client requests `/api/upload/presign` → server generates presigned PUT URL (15 min expiry, scoped per flight) → browser PUTs to R2 → client submits flight with R2 object keys.
- Flight record stores `photos: text[]` (array of R2 object keys, not URLs).
- HEIC must be converted to JPEG on upload (client-side).
- Limits: max 5 photos per flight, max 10 MB per photo.

### 7. Cancellation rules

- **Pilot cancellation:** allowed only if `now < start_time - 24h`. Server-side enforcement, not just UI.
- **Admin cancellation:** allowed at any time, no time restriction.
- Both cancellations refund 100% of the originally deducted HDV via a `cancellation_refund` Transaction.
- After cancellation, status becomes `cancelled_by_pilot` or `cancelled_by_admin` — never just `cancelled`. Audit trail matters.

### 8. AvailabilityBlock precedence

- A `specific_date` override takes precedence over any `day_of_week` recurring block for that date.
- A `type = unavailable` override blocks bookings even on a normally available day.
- Pilots can ONLY book within `available` windows. Outside availability = uncreatable, not just hidden.

### 9. Flight validation lifecycle

- New flights start as `pending`.
- Admin can: `validate` (locks the entry forever), `edit` (corrects duration → new reconciliation Transaction → still pending until validated), or `reject` (REVERTS all HDV changes including the original reservation debit, and flags the entry).
- **Validated flights are immutable.** No edits, no reversals. If a validated flight is wrong, the admin must use a manual `admin_adjustment` Transaction with a clear reason.

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
Admin: `/admin`, `/admin/flights`, `/admin/pilots`, `/admin/pilots/[id]`, `/admin/calendar`, `/admin/availability`
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

### Local development (Postgres in Docker, Next.js on host)

```bash
docker compose up -d db          # start Postgres only (bound to 127.0.0.1:5432)
pnpm install                     # one-time
pnpm db:migrate                  # apply migrations
pnpm db:seed                     # create the bootstrap admin
pnpm dev                         # Next.js on http://localhost:3000
```

### Full Docker (Postgres + Next.js both in containers)

```bash
docker compose up                # builds web image on first run, then runs both
                                 # web bound to 0.0.0.0:3000 (externally reachable)
                                 # db bound to 127.0.0.1:5432 (host-only)
```

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

## Project Status

**Foundation laid as of April 2026.** Working scaffold includes:

- Next.js 16 + React 19 + Tailwind 4 + TypeScript
- Prisma 7 schema covering all V1 entities (User, Reservation, Flight, Transaction, AvailabilityBlock) — first migration applied
- Auth.js v5 Credentials provider + JWT sessions + route protection middleware
- Placeholder pages: `/login`, `/dashboard`, `/setup-password`
- Docker Compose: Postgres (host-only) + Next.js dev (externally exposed)
- Bootstrap admin seeded

**What's NOT built yet:** every feature page beyond the placeholders, Stripe Checkout/webhook, R2 upload presigning, calendar/booking UI, flight entry, admin panels, pilot CRUD. See PRD §3 for the spec and the suggested implementation order.
