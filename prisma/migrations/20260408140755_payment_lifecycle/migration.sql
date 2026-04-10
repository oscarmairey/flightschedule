-- FlightSchedule V2.1 — Payment lifecycle (status / method, bank transfer).
-- See plan: delightful-chasing-wren.md
--
-- Adds:
--   - TransactionStatus enum (PENDING / ACCEPTED / CANCELLED)
--   - TransactionMethod enum (STRIPE_CARD / BANK_TRANSFER)
--   - Transaction.status, Transaction.method, Transaction.statusUpdatedAt,
--     Transaction.statusUpdatedBy
--   - Transaction.balanceAfterMin made NULLABLE (null while PENDING)
--   - User.stripeCustomerId (lazily populated on first inline card payment)
--   - BankAccount table (single-row, holds the operator's IBAN/BIC)
--   - Index (status, type) for the admin pending bank-transfer queue
--
-- Architectural impact: extends CLAUDE.md rule #2. The SUM-invariant
-- evolves from
--     User.hdvBalanceMin = SUM(amountMin)
-- to
--     User.hdvBalanceMin = SUM(amountMin WHERE status = ACCEPTED)
-- The migration is value-preserving: every existing row gets
-- status=ACCEPTED, so the invariant continues to hold for every user
-- without any backfill of balance values.
--
-- Rule #5 idempotency is preserved: the Stripe webhook now stores the
-- payment_intent id (not session id) on Transaction.reference and looks
-- it up before flipping PENDING → ACCEPTED. The reference index is
-- unchanged.

-- 1. Create the new enums.
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED');
CREATE TYPE "TransactionMethod" AS ENUM ('STRIPE_CARD', 'BANK_TRANSFER');

-- 2. Add the new Transaction columns. status defaults to ACCEPTED so
--    every existing row remains valid under the new SUM invariant.
ALTER TABLE "Transaction"
  ADD COLUMN "status"          "TransactionStatus" NOT NULL DEFAULT 'ACCEPTED',
  ADD COLUMN "method"          "TransactionMethod",
  ADD COLUMN "statusUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "statusUpdatedBy" UUID;

-- 3. Make balanceAfterMin nullable. Existing rows already have a value
--    (they're all ACCEPTED), so no backfill needed — going forward,
--    PENDING rows will be inserted with balanceAfterMin = NULL until
--    they're flipped to ACCEPTED.
ALTER TABLE "Transaction"
  ALTER COLUMN "balanceAfterMin" DROP NOT NULL;

-- 4. Backfill: every historical PACKAGE_PURCHASE row was a Stripe
--    Checkout payment (the only purchase channel that existed in V2),
--    so tag them as STRIPE_CARD. FLIGHT_DEBIT / ADMIN_ADJUSTMENT /
--    CANCELLATION_REFUND keep method = NULL (no payment method
--    associated).
UPDATE "Transaction"
   SET "method" = 'STRIPE_CARD'
 WHERE "type" = 'PACKAGE_PURCHASE';

-- 5. Add User.stripeCustomerId. UNIQUE so we can lazily look up by
--    customer id from a Stripe webhook. Null until the pilot's first
--    inline card payment creates the Customer.
ALTER TABLE "User"
  ADD COLUMN "stripeCustomerId" TEXT;
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- 6. New BankAccount table — single-row in practice, enforced by the
--    server action upsert (always upsert into the first row, create if
--    none). The IBAN is stored normalized (no spaces); the display
--    layer groups it 4-by-4.
CREATE TABLE "BankAccount" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "holderName"   TEXT NOT NULL,
    "iban"         TEXT NOT NULL,
    "bic"          TEXT NOT NULL,
    "bankName"     TEXT,
    "instructions" TEXT,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    "updatedById"  UUID NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- 7. Index for the admin pending bank-transfer queue. The query is
--    `WHERE status = 'PENDING' AND method = 'BANK_TRANSFER'` — the
--    leading status column makes this fast even as the ledger grows.
CREATE INDEX "Transaction_status_type_idx" ON "Transaction"("status", "type");
