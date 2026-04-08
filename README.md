# FlightSchedule

The app to easily manage the reservation schedule of your plane. Used by a small group of private pilots sharing a Cessna 182 (F-GBQA). See [PRD.md](./PRD.md) for the product spec and [CLAUDE.md](./CLAUDE.md) for the architectural rules.

## Quick start (local dev)

The full stack runs in Docker (Next.js + Postgres). The host port is **6000** for the web container and **5442** for Postgres — both intentionally non-default to coexist with other apps on the same VPS.

```bash
docker compose up -d            # boots the web container (0.0.0.0:6000) + db (127.0.0.1:5442)
docker compose logs -f web      # tail Next.js logs
```

Public URL via Caddy + Cloudflare: <https://flightschedule.org>

If you prefer to run Next.js on the host (with only the DB in Docker):

```bash
docker compose up -d db
corepack pnpm install
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm dev               # listens on http://localhost:3000
```

> **Note:** port 3000 may already be taken by another app on the same VPS. The Docker `web` container listens internally on `:3000` but is published as `:6000` on the host.

## Stripe one-shot setup

The three HDV packages need Stripe Products + Prices created once per Stripe account (test or live):

```bash
corepack pnpm tsx scripts/stripe-setup.ts
```

The script prints `STRIPE_PRICE_*` values for `.env`. After pasting them in:

```bash
docker compose restart web
```

It also reminds you to enable Stripe Tax in the dashboard so 20% French VAT is computed at checkout (per PRD §3.1.1, prices are HT).

## Stripe webhook (local dev)

```bash
# Terminal 1
docker compose up -d

# Terminal 2 — forward Stripe events to the local web container
stripe listen --forward-to http://localhost:6000/api/webhooks/stripe
# Copy the printed whsec_... into STRIPE_WEBHOOK_SECRET in .env
docker compose restart web
```

## Database

Schema lives in `prisma/schema.prisma`. Common commands:

| Command | Purpose |
|---|---|
| `corepack pnpm db:migrate` | Create + apply a new migration in dev |
| `corepack pnpm db:generate` | Regenerate the Prisma client after schema edits |
| `corepack pnpm db:push` | Push schema to DB without a migration (dev only) |
| `corepack pnpm db:seed` | Run `prisma/seed.ts` (idempotent — uses upsert) |
| `corepack pnpm db:studio` | Open Prisma Studio at <http://localhost:5555> |

## Backups

Daily encrypted Postgres dumps to a separate R2 bucket:

```bash
./scripts/backup-db.sh
```

Add to cron on the host (`crontab -e`):

```cron
0 3 * * * /opt/cavok/scripts/backup-db.sh >> /var/log/cavok-backup.log 2>&1
```

The script reads `BACKUP_PASSPHRASE` from `.env` and uploads to bucket `cavok-db-backups`. The bucket must be **fully private** (same rule as the photo bucket — see CLAUDE.md rule #6). The deploy directory is still `/opt/cavok` and the backup bucket name still carries the `cavok-` prefix from the original project name — see "Legacy `cavok-*` names" in CLAUDE.md.

## Production deployment

Already deployed at <https://flightschedule.org>:

- Caddy reverse-proxies the public hostname → `localhost:6000`
- TLS at the origin via a dedicated Cloudflare Origin CA cert at `/etc/caddy/certs/flightschedule.org.{pem,key}`
- Cloudflare DNS must be **proxied** (orange cloud) for the cert to be trusted by browsers

To deploy a code change:

```bash
git pull
docker compose up -d --build    # rebuild + recreate containers
```

## Architectural rules (TL;DR)

See [CLAUDE.md](./CLAUDE.md) for the full list and rationale. Highlights:

1. All durations in **integer minutes**. HH:MM only at display.
2. Every HDV change goes through `applyHdvMutation` (`src/lib/hdv.ts`) inside a Prisma transaction.
3. Booking is atomic (`src/lib/reservations.ts`) with serializable isolation + retry.
4. Stripe webhook is idempotent (`src/app/api/webhooks/stripe/route.ts`).
5. R2 bucket is fully private — server signs both PUT and GET URLs.
6. Pilot cancellation only ≥24 h before start (server-enforced).
7. Flights are immutable on insert (V1.1) — no admin validation, no edit, no reconciliation. HDV corrections go through an `ADMIN_ADJUSTMENT` Transaction.
