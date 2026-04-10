<div align="center">

# FlightSchedule

### The app to easily manage the reservation schedule of your plane.

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](#)
[![Next.js](https://img.shields.io/badge/Next.js_16-000?logo=nextdotjs&logoColor=white)](#)
[![React](https://img.shields.io/badge/React_19-61DAFB?logo=react&logoColor=black)](#)
[![Prisma](https://img.shields.io/badge/Prisma_7-2D3748?logo=prisma&logoColor=white)](#)
[![Postgres](https://img.shields.io/badge/PostgreSQL_16-4169E1?logo=postgresql&logoColor=white)](#)
[![Stripe](https://img.shields.io/badge/Stripe-635BFF?logo=stripe&logoColor=white)](#)
[![Tailwind](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?logo=tailwindcss&logoColor=white)](#)

---

</div>

## The problem

A group of private pilots share a Cessna 182 (F-GBQA) at a French aeroclub. Scheduling the aircraft, tracking flight hours, managing the shared account — all of it runs on a fragmented stack of Google Sheets, WhatsApp threads, paper logbooks, and Excel files. Who has the plane next Saturday? How many hours do I have left? Did someone log that flight from last week? Nobody is ever sure, and the answers live in four different places.

FlightSchedule replaces that entire workflow with a single web app. Pilots book the aircraft, log flights with engine times, and monitor their HDV (flight-hour) balance — all from their phone at the airfield. Admins manage pilot accounts, configure availability, and sell hour packages through Stripe. One source of truth, in your pocket, in French.

## How it works

### Booking the aircraft

The calendar shows a week view with existing reservations. Pilots pick a day, tap a time block, and confirm. The booking is atomic — a single serializable Postgres transaction checks for overlap, validates against unavailability exceptions, and inserts the reservation. If two pilots try to grab the same slot at the same instant, one wins and the other gets a clear conflict message. No double bookings, ever.

The aircraft is available 24/7 by default. Admins can block specific dates or recurring day-of-week windows for maintenance, inspections, or club events. A specific-date exception always takes precedence over a recurring one.

Pilots can cancel their own reservations up to 12 hours before departure — server-enforced, not just a UI rule. Admins can cancel at any time. Cancellations are tagged `cancelled_by_pilot` or `cancelled_by_admin` for the audit trail. Reservations that have associated flights are locked against cancellation.

### Logging a flight

After flying, the pilot opens the flight form — designed for a phone in sunlight with one hand. Large tap targets, numeric keyboards for engine times, and an optional photo upload (0–5 photos, max 10 MB each, stored as R2 object keys).

The pilot enters bloc OFF and bloc ON times (HH:MM, 24h format, Paris timezone). The system computes the duration in integer minutes — no floats, no decimals, ever. Cross-midnight flights are handled automatically.

Flight submission is one atomic transaction: insert the flight, compute the duration from engine times, debit the pilot's HDV balance with a `FLIGHT_DEBIT` transaction, and link to the reservation. Overdrafts are allowed — the admin reconciles off-platform. If the pilot flew without a booking, the system auto-creates a reservation and marks it `autoCreatedFromFlight`.

Flights are immutable on insert. No edit, no delete, no validation queue. The engine times are the truth. If a correction is needed, the admin creates an `ADMIN_ADJUSTMENT` transaction with a reason.

### HDV balance and packages

Every pilot has an HDV (heures de vol) balance displayed in `HH:MM` — large, monospaced, color-coded: green above 5h, amber between 2–5h, red below 2h. The balance is a denormalized field on the user, but the Transaction table is the source of truth. Every mutation — package purchase, flight debit, cancellation refund, admin adjustment — inserts a Transaction row with `balance_after_min` for full auditability.

Pilots buy hour packages through Stripe Checkout. Three tiers are configured by the admin from the tarifs page. After payment, the Stripe webhook credits the balance idempotently — it checks the session ID before crediting, so retried webhooks never double-count. Prices are HT (hors taxes); Stripe Tax computes the 20% French VAT at checkout.

### Photos

The R2 bucket is fully private — no public URL, no custom domain. Upload works via presigned PUT URLs (15 min expiry) generated server-side after authorization. Display works via presigned GET URLs, also server-side. The app server never transits photo bytes. Object keys are generated server-side only, validated on submit, and HEAD-checked against R2 to confirm the upload landed.

### Admin

Admins manage everything from three pages:

- **Pilots** — create accounts (closed group, no self-registration), adjust HDV balances with a reason, view full transaction history, deactivate users (soft delete only)
- **Disponibilites** — configure unavailability exceptions (specific dates override recurring day-of-week rules)
- **Tarifs** — CRUD Stripe packages (product + price), prices in euros HT

New pilots get a temporary password and `must_reset_pw = true`. First login forces a redirect to `/setup-password`.

## Architecture

```
flightschedule/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Landing / auth redirect
│   │   ├── layout.tsx                  # Root layout + font + PWA
│   │   ├── globals.css                 # Tailwind 4 CSS-first theme
│   │   ├── login/page.tsx              # Credentials sign-in
│   │   ├── setup-password/page.tsx     # First-login password reset
│   │   ├── dashboard/
│   │   │   ├── page.tsx                # HDV balance, packages, transaction history
│   │   │   └── actions.ts             # Purchase + balance server actions
│   │   ├── calendar/
│   │   │   ├── page.tsx                # Week view + booking flow
│   │   │   └── actions.ts             # Reservation CRUD
│   │   ├── flights/new/
│   │   │   ├── page.tsx                # Flight entry form (mobile-first)
│   │   │   └── actions.ts             # Atomic flight submission
│   │   ├── admin/
│   │   │   ├── page.tsx                # Admin overview
│   │   │   ├── pilots/                 # Pilot CRUD + HDV adjustments
│   │   │   ├── disponibilites/         # Availability exceptions
│   │   │   ├── tarifs/                 # Stripe package management
│   │   │   └── parametres/             # App settings
│   │   └── api/
│   │       ├── auth/[...nextauth]/     # Auth.js v5 route handler
│   │       ├── upload/presign/         # R2 presigned URL generation
│   │       └── webhooks/stripe/        # Idempotent payment webhook
│   │
│   ├── components/
│   │   ├── AppShell.tsx                # Sidebar nav + mobile bottom bar
│   │   ├── PwaRegister.tsx             # Service worker registration
│   │   ├── calendar/                   # WeekCalendar, TimeBlockPicker, CancelButton
│   │   ├── dashboard/                  # PayPackageButton
│   │   ├── flights/                    # PhotoUpload (R2 presigned PUT)
│   │   └── ui/                         # Button, Card, Input, Label, Badge, Dialog, Alert
│   │
│   ├── lib/
│   │   ├── db.ts                       # Lazy Prisma singleton (proxy pattern)
│   │   ├── hdv.ts                      # applyHdvMutation — atomic balance + transaction
│   │   ├── reservations.ts             # Atomic booking with serializable isolation
│   │   ├── availability.ts             # Unavailability overlap checks
│   │   ├── pricing.ts                  # Package pricing logic
│   │   ├── stripe.ts                   # Stripe server SDK
│   │   ├── stripe-client.ts            # Stripe client SDK
│   │   ├── r2.ts                       # R2 presigned URLs + key generation
│   │   ├── session.ts                  # Auth session helpers
│   │   ├── duration.ts                 # HH:MM <> minutes, balance tiers
│   │   ├── format.ts                   # Date/time formatting (fr-FR)
│   │   ├── copy.ts                     # All French UI strings
│   │   ├── validation.ts               # Server-side form validation
│   │   ├── email.ts                    # Resend transactional email
│   │   ├── rate-limit.ts              # Login rate limiting
│   │   ├── airports.ts                # Airport reference data
│   │   └── payment-ref.ts            # Payment reference generation
│   │
│   ├── auth.ts                         # Auth.js — Node runtime (Prisma + bcrypt)
│   ├── auth.config.ts                  # Auth.js — edge-safe (JWT/session callbacks)
│   └── proxy.ts                        # Next.js 16 proxy (was middleware.ts)
│
├── prisma/
│   ├── schema.prisma                   # User, Reservation, Flight, Transaction, AvailabilityBlock
│   ├── seed.ts                         # Bootstrap admin (idempotent upsert)
│   └── migrations/                     # Full migration history
│
├── scripts/
│   ├── stripe-setup.ts                 # One-shot: create Stripe products + prices + webhook
│   ├── r2-cors-setup.ts                # One-shot: apply CORS policy via Cloudflare REST API
│   └── backup-db.sh                    # Nightly encrypted Postgres dump → R2
│
├── docker-compose.yml                  # Production stack: web (port 6000) + db (port 5442)
├── Dockerfile                          # Multi-stage production build (standalone output)
└── CLAUDE.md                           # Architectural rules + dev workflow
```

## Data model

```
User               — pilots + admins, HDV balance (denormalized), soft-delete via is_active
Reservation        — time slot booking, status enum, optional autoCreatedFromFlight flag
Flight             — immutable log entry, engine start/stop, duration in minutes, photo keys
Transaction        — HDV ledger (package_purchase, flight_debit, cancellation_refund, admin_adjustment)
AvailabilityBlock  — unavailability exceptions (specific date or recurring day-of-week)
Package            — Stripe product/price pairs for HDV hour bundles
BankAccount        — aeroclub bank details for the tarifs page
```

## Tech stack

| Layer | What | Why |
|-------|------|-----|
| **Framework** | Next.js 16 (App Router) | Server components, server actions, Turbopack |
| **Language** | TypeScript 5 | Type safety across UI and server |
| **UI** | React 19, Tailwind CSS 4 | CSS-first theme config, mobile-first responsive |
| **Database** | PostgreSQL 16 + Prisma 7 | Driver adapter (`@prisma/adapter-pg`), serializable transactions |
| **Auth** | Auth.js v5 (Credentials) | JWT sessions, edge-safe split (`auth.config.ts` / `auth.ts`) |
| **Payments** | Stripe Checkout + Webhooks | Hour package purchases, idempotent webhook processing |
| **Storage** | Cloudflare R2 | Flight photos — fully private, presigned URLs only |
| **Email** | Resend | Transactional emails (password reset, welcome) |
| **Hosting** | Hetzner VPS + Docker + Caddy | Multi-stage production image, auto-TLS via Cloudflare Origin CA |

## Getting started

```bash
# Clone
git clone git@github.com:oscarmairey/flightschedule.git
cd flightschedule

# Start Postgres
docker compose up -d db          # 127.0.0.1:5442

# Install and set up
pnpm install
pnpm db:migrate
pnpm db:seed                     # creates bootstrap admin from .env

# Run
pnpm dev                         # http://localhost:3000
```

### Production deployment

```bash
docker compose up -d --build     # rebuilds image, recreates containers
                                 # web → 0.0.0.0:6000, db → 127.0.0.1:5442
docker compose logs -f web       # tail server logs
```

Public URL via Caddy + Cloudflare: [flightschedule.org](https://flightschedule.org)

### One-shot setup scripts

```bash
# Create Stripe products + prices + webhook endpoint
corepack pnpm tsx scripts/stripe-setup.ts

# Apply CORS policy to R2 bucket (Cloudflare REST API, not S3)
corepack pnpm tsx scripts/r2-cors-setup.ts
```

### Database commands

| Command | Purpose |
|---------|---------|
| `pnpm db:migrate` | Create + apply a new migration |
| `pnpm db:generate` | Regenerate Prisma client after schema edits |
| `pnpm db:push` | Push schema without a migration (dev only) |
| `pnpm db:seed` | Seed bootstrap admin (idempotent) |
| `pnpm db:studio` | Prisma Studio at http://localhost:5555 |

## Environment variables

```env
# Database
DATABASE_URL=postgresql://cavok:cavok@localhost:5442/cavok

# Auth
AUTH_SECRET=
NEXTAUTH_URL=https://flightschedule.org

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_5H=
STRIPE_PRICE_10H=
STRIPE_PRICE_20H=

# Cloudflare R2 (flight photos — fully private bucket)
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=cavok-flight-photos

# Resend (transactional email)
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Bootstrap admin (consumed by prisma/seed.ts)
ADMIN_BOOTSTRAP_EMAIL=
ADMIN_BOOTSTRAP_NAME=
ADMIN_BOOTSTRAP_PASSWORD=
```

## Backups

Daily encrypted Postgres dumps to a separate R2 bucket:

```bash
./scripts/backup-db.sh
```

Cron on the host:

```cron
0 3 * * * /opt/cavok/scripts/backup-db.sh >> /var/log/cavok-backup.log 2>&1
```

---

<div align="center">

Built by [Oscar Mairey](https://oscarmairey.com)

</div>
