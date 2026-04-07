# CAVOK Glass Cockpit — Product Requirements Document (V1)

**Project:** Digital management platform for the Cessna 182 F-GBQA
**Codename:** Glass Cockpit
**Domain:** cavok.ovh
**Version:** 1.0
**Date:** April 2026
**Status:** V1 Scope Locked

---

## 1. Overview

### 1.1 Context

CAVOK is a small private aviation company operating a single Cessna 182 (F-GBQA) shared among a group of private pilots. Current operations rely on a fragmented patchwork:

- **Reservations:** Google Sheet with half-day blocks, updated biannually by the administrator
- **Communication:** WhatsApp group
- **Flight logging:** Paper logbook, photographed and texted to the administrator
- **Accounting:** Offline Excel file, manually re-entered by the administrator

This creates an administrative bottleneck: every flight must be manually re-entered from photos, pilots have no visibility into their flight hour (HDV) balance, and all updates depend on the admin.

### 1.2 Objective

Replace this fragmented workflow with a **single centralized web application** where:
- Pilots book the aircraft, log flights, and monitor their account autonomously
- The administrator manages pilots, validates entries, and handles accounting from a unified dashboard
- Data flows digitally end-to-end, eliminating manual Excel re-entry

### 1.3 Success Metrics

- All active pilots use `cavok.ovh` as their sole tool for reservations and flight logging within **30 days of launch**
- The administrator no longer re-enters data from photos
- Pilot self-service reduces admin workload to validation only

### 1.4 Non-Goals for V1

See Section 9 for the explicit out-of-scope list. V1 prioritizes replacing current manual workflow, not adding new capabilities beyond that.

---

## 2. Users & Roles

### 2.1 Pilot (Standard User)

**Profile:** Licensed private pilot authorized to fly F-GBQA.

**Capabilities:**
- Purchase HDV packages via Stripe
- Book time slots within admin-defined availability windows
- Log flights after landing
- View HDV balance and transaction history
- Cancel own reservations (≥24h before start)

**Expected population:** 5–12 active pilots.

### 2.2 Administrator (Super-User)

**Profile:** Person managing CAVOK operations (currently one individual).

**Capabilities (in addition to pilot capabilities):**
- Create / deactivate pilot accounts
- Define and modify aircraft availability windows (recurring + overrides)
- Manually credit or debit any pilot's HDV balance (with mandatory justification)
- Validate, edit, or reject pilot flight entries
- Cancel any reservation

**Expected population:** 1–2.

### 2.3 Authentication Rules

- **Closed user group** — no self-registration
- Admin creates accounts with email + temporary password
- Pilot sets own password on first login (`must_reset_pw` flag)
- Session-based auth (JWT or cookie)
- Password reset via email (Resend)
- No OAuth / social login for V1

---

## 3. Functional Requirements

### 3.1 HDV Packages & Billing

**Goal:** Replace manual bank-transfer-and-wait with instant Stripe-powered package purchase.

#### 3.1.1 Package Catalog

| Package  | Hours  | Unit Price | Discount | Total     |
|----------|--------|------------|----------|-----------|
| Starter  | 5 HDV  | €100/h     | —        | €500      |
| Standard | 10 HDV | €90/h      | -10%     | €900      |
| Premium  | 25 HDV | €85/h      | -15%     | €2,125    |

#### 3.1.2 Purchase Flow

1. Pilot navigates to `/account` and selects a package
2. Redirected to Stripe Checkout (hosted)
3. On successful payment, Stripe webhook (`checkout.session.completed`) credits the HDV balance
4. A `package_purchase` Transaction is recorded with Stripe session ID as reference
5. Pilot is redirected to `/account/checkout/success` showing the updated balance

#### 3.1.3 Stripe Integration Requirements

- Stripe Checkout (hosted) — no custom payment form
- Webhook endpoint `/api/webhooks/stripe` verifies signature before crediting
- Each package is a Stripe Product with a fixed Price
- **Idempotency:** Stripe session ID stored on Transaction to prevent double-crediting on webhook retry

#### 3.1.4 Admin Manual Adjustments

- Admin can credit or debit any pilot's balance
- Mandatory `reason` field on every manual adjustment
- Creates an `admin_adjustment` Transaction with `performed_by = admin.id`

#### 3.1.5 Out of Scope

- Subscriptions / recurring billing
- In-app invoicing (Stripe handles receipts)
- In-app refunds (handled via Stripe dashboard)
- Promo codes / variable pricing

---

### 3.2 Calendar & Reservation System

**Goal:** Replace the biannually-updated Google Sheet with a real-time, conflict-aware booking calendar constrained by admin-defined availability.

#### 3.2.1 Availability Windows (Admin-Defined)

- Admin defines **availability windows** as:
  - **Recurring weekly defaults** (e.g., Monday 08:00–18:00)
  - **Per-date overrides** for exceptions (maintenance, holidays, extended hours)
- Pilots can **only** book within these windows
- Slots outside windows are greyed out and unbookable
- When admin removes a window containing existing confirmed reservations, those reservations are flagged for admin resolution

#### 3.2.2 Pilot Calendar View

- **Default view:** Weekly calendar
- **Alternative view:** Monthly overview for planning
- **Visibility window:** Current month + 3 months forward (4 months total)
- **Visual states:**
  - Own bookings (highlighted)
  - Other pilots' bookings (pilot name visible)
  - Available windows (bookable)
  - Unavailable / blocked periods (greyed)

#### 3.2.3 Booking Rules

- Pilot selects date + time range within an availability window
- Booking only succeeds if:
  - Slot is free (no overlap with any confirmed reservation)
  - Pilot has sufficient HDV balance for the requested duration
- **HDV deducted at booking time** — not at flight time
- A `reservation_debit` Transaction is recorded on booking

#### 3.2.4 Cancellation Rules

- Pilot may cancel own reservations **only ≥24h before start time**
- On pilot cancellation: full HDV refund via `cancellation_refund` Transaction, status → `cancelled_by_pilot`
- Late cancellations (<24h) require admin intervention
- Admin may cancel any reservation at any time: full HDV refund, status → `cancelled_by_admin`

#### 3.2.5 Reservation Data Model

| Field               | Type         | Notes                                                     |
|---------------------|--------------|-----------------------------------------------------------|
| id                  | uuid         |                                                           |
| user_id             | fk User      |                                                           |
| date                | date         |                                                           |
| start_time          | time         |                                                           |
| end_time            | time         |                                                           |
| duration_min        | int          | Computed; used for HDV deduction                          |
| hdv_deducted_min    | int          | Stored for refund accuracy                                |
| status              | enum         | `confirmed` / `cancelled_by_pilot` / `cancelled_by_admin` |
| cancelled_at        | timestamp    | nullable                                                  |
| cancelled_by        | fk User      | nullable                                                  |
| created_at          | timestamp    |                                                           |
| updated_at          | timestamp    |                                                           |

#### 3.2.6 AvailabilityBlock Data Model

| Field          | Type      | Notes                                      |
|----------------|-----------|--------------------------------------------|
| id             | uuid      |                                            |
| day_of_week    | int 0–6   | Nullable — for recurring defaults          |
| specific_date  | date      | Nullable — for one-off overrides           |
| start_time     | time      |                                            |
| end_time       | time      |                                            |
| type           | enum      | `available` / `unavailable`                |
| reason         | text      | Nullable (e.g., "annual inspection")       |
| created_by     | fk User   | Admin who created the block                |
| created_at     | timestamp |                                            |
| updated_at     | timestamp |                                            |

**Precedence rule:** A `specific_date` override takes priority over any `day_of_week` recurring block for that date.

#### 3.2.7 Out of Scope

- Recurring reservations for pilots
- Waitlist / priority system
- Notifications on reservation changes
- iCal / Google Calendar export

---

### 3.3 Flight Entry (Saisie de Vol)

**Goal:** Replace paper → photo → WhatsApp → Excel chain with direct digital entry by the pilot, tied to their reservation.

#### 3.3.1 Pilot Entry Flow

After landing (and filling the regulatory paper logbook, which remains mandatory), the pilot opens `/flights/new` and completes:

| Field                  | Required | Notes                                               |
|------------------------|----------|-----------------------------------------------------|
| Linked reservation     | Yes      | Selected from confirmed reservations (current pre-selected) |
| Date of flight         | Yes      | Pre-filled from reservation                         |
| Departure airport      | Yes      | ICAO code (e.g., LFPN); common airports suggested   |
| Arrival airport        | Yes      | ICAO code                                           |
| Actual flight duration | Yes      | HH:MM — may differ from reserved duration           |
| Engine start time      | No       | HH:MM, for precision                                |
| Engine stop time       | No       | HH:MM                                               |
| Remarks                | No       | Free text                                           |
| Number of landings     | Yes      | Integer, defaults to 1                              |
| Post-flight photos     | Yes      | 1–5 images, JPEG/PNG/HEIC, max 10MB each           |

#### 3.3.2 HDV Reconciliation

Since HDV was deducted at reservation time, flight submission triggers reconciliation:

- `actual_duration == reserved_duration` → no balance change
- `actual_duration < reserved_duration` → difference credited back
- `actual_duration > reserved_duration` → difference debited

A `flight_reconciliation` Transaction records any non-zero delta, referencing the flight.

#### 3.3.3 Photo Upload (Cloudflare R2)

- Photos uploaded **directly to Cloudflare R2** via server-generated presigned URLs (browser → R2, bypassing app server)
- Flight record stores array of R2 object keys (e.g., `flights/{flight_id}/photo_1.jpg`)
- Presigned URLs are short-lived (15 min expiry)
- HEIC converted to JPEG on upload
- Max 5 photos per flight

#### 3.3.4 Admin Validation Queue

- Admin sees feed of `pending` flight entries across all pilots, **sorted by date (oldest first)**
- Each entry shows: flight details, reconciliation delta, uploaded photos inline
- Admin actions:
  - **Validate:** locks the entry, flight becomes final
  - **Reject:** reverts ALL HDV changes (original reservation debit + reconciliation), flags entry
  - **Edit:** corrects duration before validation, triggers new reconciliation
- Validated flights are **locked and immutable**

#### 3.3.5 Flight Data Model

| Field                     | Type       | Notes                                          |
|---------------------------|------------|------------------------------------------------|
| id                        | uuid       |                                                |
| user_id                   | fk User    |                                                |
| reservation_id            | fk         | Required — every flight ties to a reservation  |
| date                      | date       |                                                |
| dep_airport               | text       | ICAO                                           |
| arr_airport               | text       | ICAO                                           |
| actual_duration_min       | int        |                                                |
| reserved_duration_min     | int        | Snapshot at creation for reconciliation        |
| reconciliation_delta_min  | int        | Signed (+ credit / - debit)                    |
| engine_start              | time       | Nullable                                       |
| engine_stop               | time       | Nullable                                       |
| landings                  | int        | Default 1                                      |
| remarks                   | text       | Nullable                                       |
| photos                    | text[]     | Array of R2 object keys                        |
| status                    | enum       | `pending` / `validated` / `rejected`           |
| admin_notes               | text       | Reason for edit/rejection                      |
| validated_at              | timestamp  | Nullable                                       |
| rejected_at               | timestamp  | Nullable                                       |
| created_at                | timestamp  |                                                |
| updated_at                | timestamp  |                                                |

#### 3.3.6 Out of Scope

- Automatic cross-referencing with paper logbook
- Fuel consumption tracking
- Waypoint / route logging
- External flight tracking integration
- OCR on logbook photos

---

### 3.4 Pilot Dashboard

**Goal:** Give each pilot real-time autonomy over their HDV balance and history — the single most requested improvement.

#### 3.4.1 Balance Display

- Current HDV balance prominently displayed (HH:MM format)
- Color indicator:
  - **Green:** > 5h
  - **Amber:** 2–5h
  - **Red:** < 2h
- Quick-access "Buy HDV" button linking to packages

#### 3.4.2 Flight History

- Chronological list (most recent first)
- Each row: date, route (DEP → ARR), duration, status badge, photo thumbnails
- Filterable by date range
- Stats: total flights, total hours (all time / YTD)

#### 3.4.3 Transaction History

Combined view of all balance movements:
- Package purchases (credits)
- Reservation bookings (debits)
- Cancellation refunds (credits)
- Flight reconciliations (± )
- Admin adjustments (±)

Each line: date, type, description, amount (±), resulting balance.

**Purpose:** Pilot can fully reconcile their own account without asking the admin.

#### 3.4.4 Out of Scope

- Export to PDF/CSV
- Personal flight statistics (avg duration, most visited airports)
- Regulatory currency tracking
- Third-party logbook app integration

---

### 3.5 Admin Dashboard

**Goal:** Give the administrator a centralized control panel replacing the Excel workflow.

#### 3.5.1 Pilot Management

- List all pilots: name, email, current HDV balance, status (active/inactive)
- Create new pilot account (name, email; generates temp password)
- Deactivate pilot (blocks login and bookings, preserves history)
- Reactivate pilot

#### 3.5.2 HDV Account Management

- Select pilot → manual credit or debit
- Required inputs: amount (HH:MM), reason/reference
- Logged as `admin_adjustment` Transaction with timestamp and `performed_by = admin.id`

#### 3.5.3 Availability Management

- Define recurring weekly availability (e.g., Mon–Fri 07:00–19:00, Sat 08:00–17:00, Sun closed)
- Override specific dates (block for maintenance, extend for holiday)
- Upcoming availability viewable as calendar overlay

#### 3.5.4 Flight Validation Queue

- List of all `pending` flight entries, sorted by date (oldest first)
- Inline details: flight info, reconciliation delta, photos
- One-click validate, or expand to edit/reject with reason
- Badge counter showing pending count

#### 3.5.5 Overview Panel

- Total pending flights to validate
- Pilots with low balance (< 2h) — alert list
- Recent activity feed (last 10 actions)
- Recent Stripe payments received

#### 3.5.6 Out of Scope

- Financial reporting (revenue, trends)
- Maintenance scheduling
- Document management (insurance, airworthiness)
- Multi-aircraft support

---

## 4. Data Model

### 4.1 Core Entities

```
User ──┬─< Reservation ──1:1── Flight
       ├─< Transaction
       └─< AvailabilityBlock (as creator)
```

### 4.2 User

| Field             | Type      | Notes                                 |
|-------------------|-----------|---------------------------------------|
| id                | uuid      |                                       |
| email             | text      | Unique                                |
| name              | text      |                                       |
| password_hash     | text      | bcrypt                                |
| role              | enum      | `pilot` / `admin`                     |
| hdv_balance_min   | int       | Denormalized; source of truth is Transaction table |
| is_active         | boolean   | Soft delete flag                      |
| must_reset_pw     | boolean   | Forces password change on first login |
| created_at        | timestamp |                                       |
| updated_at        | timestamp |                                       |
| last_login_at     | timestamp | Nullable                              |

### 4.3 Transaction (Ledger)

| Field             | Type      | Notes                                              |
|-------------------|-----------|----------------------------------------------------|
| id                | uuid      |                                                    |
| user_id           | fk User   |                                                    |
| type              | enum      | `package_purchase` / `reservation_debit` / `cancellation_refund` / `flight_reconciliation` / `admin_adjustment` |
| amount_min        | int       | Signed (+credit / -debit)                          |
| balance_after_min | int       | Enables point-in-time reconstruction               |
| reference         | text      | Stripe session ID, admin reason, etc.              |
| flight_id         | fk Flight | Nullable                                           |
| reservation_id    | fk Reservation | Nullable                                       |
| performed_by      | fk User   | Who triggered it (self or admin)                   |
| created_at        | timestamp |                                                    |

### 4.4 Key Design Decisions

1. **All durations in minutes (integer).** No floating-point. Display as HH:MM everywhere.
2. **Transaction table is the source of truth.** `User.hdv_balance_min` is denormalized for read performance but can always be reconstructed from Transactions.
3. **`balance_after_min` snapshot on every transaction** enables point-in-time balance reconstruction without replaying full history.
4. **Every HDV mutation creates a Transaction.** No raw UPDATEs on `hdv_balance_min`. Period.
5. **Reservation ↔ Flight is 1:1.** Every flight references a reservation. The reservation holds the original deduction; the flight holds any reconciliation delta.
6. **AvailabilityBlock dual-key:** `day_of_week` for recurring, `specific_date` for overrides. Overrides take precedence.
7. **Photos via presigned URLs.** Browser uploads directly to R2. The app server never transits photo bytes.
8. **Soft delete on users only.** All other entities preserve history; deactivation ≠ deletion.

---

## 5. Tech Stack

| Layer        | Choice                          | Rationale                                                |
|--------------|---------------------------------|----------------------------------------------------------|
| Frontend     | Next.js 14+ (App Router)        | SSR, React ecosystem, familiar                           |
| Styling      | Tailwind CSS                    | Rapid iteration, mobile-first utility-first             |
| Database     | PostgreSQL                      | Robust, time-based queries, hosted on Hetzner            |
| ORM          | Prisma                          | Type-safe, migrations, Next.js synergy                   |
| Auth         | NextAuth.js (Credentials)       | Simple email/password for closed group                   |
| Payments     | Stripe Checkout + Webhooks      | Hosted checkout, no PCI burden, receipts handled         |
| File Storage | Cloudflare R2                   | S3-compatible, no egress fees, presigned URLs            |
| Hosting      | Hetzner VPS + Caddy             | Existing infra; Caddy auto-TLS on cavok.ovh              |
| Email        | Resend                          | Password reset; future notifications                     |

**No Redis, no message queue, no additional third-party APIs for V1.** Stripe and R2 are the only external services beyond hosting and email.

---

## 6. Pages & Routes

### 6.1 Public / Auth

| Route              | Purpose                                    |
|--------------------|--------------------------------------------|
| `/`                | Redirect to `/dashboard` or `/login`       |
| `/login`           | Email + password form                      |
| `/setup-password`  | First-login password setup                 |

### 6.2 Pilot Routes

| Route                        | Purpose                                                         |
|------------------------------|-----------------------------------------------------------------|
| `/dashboard`                 | HDV balance, recent flights, quick stats, buy HDV               |
| `/calendar`                  | Weekly calendar, book slots within availability                 |
| `/flights/new`               | Flight entry form                                               |
| `/flights`                   | Flight history                                                  |
| `/account`                   | Transaction history + HDV package purchase                      |
| `/account/checkout/success`  | Post-Stripe success redirect                                    |
| `/account/checkout/cancel`   | Stripe checkout abandoned                                       |

### 6.3 Admin Routes

| Route                   | Purpose                                                |
|-------------------------|--------------------------------------------------------|
| `/admin`                | Overview (pending, low balances, activity, payments)   |
| `/admin/flights`        | Validation queue with inline photos                    |
| `/admin/pilots`         | Pilot list + management                                |
| `/admin/pilots/[id]`    | Pilot detail + manual credit/debit                     |
| `/admin/calendar`       | Calendar with availability management                  |
| `/admin/availability`   | Recurring + override availability configuration        |

### 6.4 API Routes

| Route                    | Purpose                                       |
|--------------------------|-----------------------------------------------|
| `/api/webhooks/stripe`   | Stripe webhook — `checkout.session.completed` |
| `/api/upload/presign`    | Generate R2 presigned upload URL              |

---

## 7. Non-Functional Requirements

### 7.1 Performance

- Page loads < 2s on mobile 4G
- Calendar navigation feels instant (prefetch adjacent weeks)

### 7.2 Mobile

- Fully responsive — pilots will use this on their phone at the airfield
- Flight entry form optimized for touch (large tap targets, numeric keyboard for durations)
- Photo upload from camera roll or direct camera capture

### 7.3 Security

- HTTPS only (Caddy auto-TLS)
- bcrypt password hashing
- Role-based access control on all admin routes
- CSRF protection on all mutations
- Rate limiting on `/login`
- Stripe webhook signature verification
- R2 presigned URLs scoped per-flight, 15 min expiry

### 7.4 Data Integrity

- All balance mutations go through the Transaction table — no direct UPDATE on `hdv_balance_min` without a corresponding Transaction
- Reservation booking is **atomic**: HDV check + deduction + reservation creation in a single DB transaction
- Soft deletes on users (deactivate, never delete)
- Audit trail on all admin actions (who, when, what)
- Stripe session ID stored on Transaction for idempotent webhook handling

### 7.5 Availability

- Single-server deployment is acceptable for V1 (5–12 users)
- Daily automated PostgreSQL backups to offsite storage (R2 or Backblaze B2)

### 7.6 Internationalization

- V1 is **French-only**. Copy should be written in French from the start.

---

## 8. User Flows (Critical Paths)

### 8.1 First Login

1. Admin creates account → temp password generated
2. Pilot receives credentials (out-of-band)
3. Pilot signs in at `/login` with temp password
4. Redirected to `/setup-password` (due to `must_reset_pw = true`)
5. Sets new password → flag cleared → redirected to `/dashboard`

### 8.2 Purchase HDV

1. Pilot at `/account` clicks a package
2. Server creates Stripe Checkout Session → redirect to Stripe
3. Pilot pays on Stripe-hosted page
4. Stripe sends webhook to `/api/webhooks/stripe`
5. Webhook verifies signature, checks idempotency (Stripe session ID)
6. Creates `package_purchase` Transaction, updates `hdv_balance_min`
7. Pilot redirected to `/account/checkout/success` with updated balance

### 8.3 Book a Reservation

1. Pilot navigates `/calendar`
2. Selects date + time range within an availability window
3. Client validates range against availability
4. Server atomically:
   - Checks no overlap with existing `confirmed` reservations
   - Checks `hdv_balance_min >= duration_min`
   - Creates Reservation (`status = confirmed`)
   - Creates `reservation_debit` Transaction
   - Updates `hdv_balance_min`
5. Pilot sees booking confirmed

### 8.4 Log a Flight

1. Pilot at `/flights/new` after landing
2. Selects reservation (most recent pre-selected)
3. Fills DEP/ARR, actual duration, engine times, landings, remarks
4. Client requests presigned URLs from `/api/upload/presign` for each photo
5. Browser uploads photos directly to R2
6. Client submits flight record with R2 keys
7. Server:
   - Creates Flight (`status = pending`)
   - Computes `reconciliation_delta_min`
   - If non-zero, creates `flight_reconciliation` Transaction, updates balance
8. Flight enters admin validation queue

### 8.5 Admin Validates a Flight

1. Admin at `/admin/flights` sees pending queue (oldest first)
2. Reviews details + inline photos
3. **Validate path:** status → `validated`, locked
4. **Edit path:** admin corrects `actual_duration_min` → new reconciliation Transaction → then validates
5. **Reject path:** reverts both reservation debit + reconciliation (creates reversing Transactions), status → `rejected`, flagged

### 8.6 Cancel a Reservation

**Pilot cancellation (≥24h before start):**
1. Pilot at `/calendar` or `/dashboard` cancels own reservation
2. Server checks `now < start_time - 24h`
3. Status → `cancelled_by_pilot`, creates `cancellation_refund` Transaction, updates balance

**Admin cancellation (anytime):**
1. Admin cancels any reservation from `/admin/calendar`
2. Status → `cancelled_by_admin`, full HDV refund via `cancellation_refund` Transaction

---

## 9. Explicitly Out of Scope (V1)

Deferred to future versions:

| Feature                                          | Target    |
|--------------------------------------------------|-----------|
| Email/push notifications on booking changes     | V2        |
| Low balance alerts                               | V2        |
| Multi-aircraft support                           | V2+       |
| Maintenance tracking                             | V2        |
| Document vault (insurance, airworthiness)        | V3        |
| Financial reporting (revenue, trends)            | V2        |
| iCal / Google Calendar export                    | V2        |
| Recurring reservations                           | V2        |
| External flight data (ADS-B, weather)            | V3        |
| Third-party integration API                      | V3        |
| Internationalization (non-French)                | TBD       |
| In-app refunds                                   | TBD (Stripe dashboard only) |
| OCR on logbook photos                            | V2        |
| Native mobile app                                | TBD (PWA possible for V1) |
| Export to PDF/CSV                                | V2        |
| Currency tracking (regulatory recency)           | V3        |

---

## 10. Success Criteria Summary

V1 is successful when:

1. **All pilots actively use the platform** within 30 days of launch for booking + logging
2. **Admin has stopped re-entering data from photos** — validation is the only admin flight-related task
3. **Pilots can answer "what's my HDV balance?" without asking the admin** — self-service is real
4. **No data integrity issues** — every balance mutation has a corresponding Transaction, reconcilable
5. **Stripe purchases flow end-to-end** — payment → webhook → credit → pilot sees updated balance without admin involvement

---

*Less time in spreadsheets, more time in the air.*
