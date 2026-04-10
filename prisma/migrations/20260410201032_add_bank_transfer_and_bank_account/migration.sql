-- FlightSchedule V2.1 — Bank transfers + inline card payments.
--
-- This migration reworks the payment feature around two goals:
--   1. Inline Stripe Elements card payments (no more Checkout redirect).
--   2. Admin-validated bank transfers (async payments).
--
-- A previous attempt (`20260408140755_payment_lifecycle`) added PENDING
-- status + method columns directly to the Transaction table. That
-- approach has been abandoned in favour of a separate `BankTransfer`
-- table so the Transaction ledger stays a clean immutable record of
-- completed facts (CLAUDE.md rule #2 invariant preserved verbatim).
--
-- Drift cleanup:
--   - 14 test PENDING/CANCELLED Transaction rows are deleted (they had
--     NULL `balanceAfterMin` and do not affect any user's hdvBalanceMin).
--   - 2 ACCEPTED rows tagged `method = BANK_TRANSFER` are re-typed to the
--     new `TransactionType.BANK_TRANSFER` — this preserves the HDV
--     balance invariant (they still count as credits with the same
--     amountMin), only the `type` label changes.
--   - `status`, `method`, `statusUpdatedAt`, `statusUpdatedBy` columns
--     and their `TransactionStatus` / `TransactionMethod` enums are
--     dropped.
--   - `balanceAfterMin` is re-asserted NOT NULL (every remaining row has
--     a value after the PENDING/CANCELLED cleanup above).
--   - `User.stripeCustomerId` and the `BankAccount` table survive intact
--     — they match the new schema exactly, so nothing to change.

-- ─── 1. Drift cleanup on Transaction ────────────────────────────────

-- Delete PENDING / CANCELLED test rows. These never contributed to
-- any user's hdvBalanceMin (Transaction.balanceAfterMin is NULL on
-- these rows, and the denormalised User.hdvBalanceMin was only ever
-- updated inside applyHdvMutation for ACCEPTED rows). Safe to drop.
DELETE FROM "Transaction" WHERE "status" IN ('PENDING', 'CANCELLED');

-- ─── 2. TransactionType enum — recreate with BANK_TRANSFER ───────────

-- Postgres forbids using ALTER TYPE ADD VALUE's new value in the same
-- transaction block. Prisma runs migrations in a single transaction by
-- default, so we use the recreate-and-cast idiom instead. This also
-- lets us re-type the 2 surviving accepted wire payments in the same
-- step: the USING clause maps each row's current text representation
-- into the new enum, and we can't do the PACKAGE_PURCHASE→BANK_TRANSFER
-- remap in a simple cast, so we do it via a CASE expression.
CREATE TYPE "TransactionType_new" AS ENUM (
  'PACKAGE_PURCHASE',
  'FLIGHT_DEBIT',
  'CANCELLATION_REFUND',
  'ADMIN_ADJUSTMENT',
  'BANK_TRANSFER'
);

ALTER TABLE "Transaction"
  ALTER COLUMN "type" TYPE "TransactionType_new"
  USING (
    CASE
      WHEN "type"::text = 'PACKAGE_PURCHASE' AND "method"::text = 'BANK_TRANSFER'
        THEN 'BANK_TRANSFER'::"TransactionType_new"
      ELSE "type"::text::"TransactionType_new"
    END
  );

DROP TYPE "TransactionType";
ALTER TYPE "TransactionType_new" RENAME TO "TransactionType";

-- ─── 3. BankTransferStatus enum ──────────────────────────────────────

CREATE TYPE "BankTransferStatus" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED');

-- ─── 4. Drop drifted Transaction columns + supporting enums ──────────

DROP INDEX IF EXISTS "Transaction_status_type_idx";

ALTER TABLE "Transaction"
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "method",
  DROP COLUMN IF EXISTS "statusUpdatedAt",
  DROP COLUMN IF EXISTS "statusUpdatedBy";

DROP TYPE IF EXISTS "TransactionStatus";
DROP TYPE IF EXISTS "TransactionMethod";

-- Restore NOT NULL on balanceAfterMin. All surviving rows have a value:
--   - FLIGHT_DEBIT / ADMIN_ADJUSTMENT / CANCELLATION_REFUND rows always
--     had balanceAfterMin set (ACCEPTED was the only status for them).
--   - PACKAGE_PURCHASE ACCEPTED rows had balanceAfterMin set by the
--     webhook.
--   - PENDING rows (where balanceAfterMin was nullable) were deleted
--     in step 1b.
ALTER TABLE "Transaction"
  ALTER COLUMN "balanceAfterMin" SET NOT NULL;

-- ─── 5. BankAccount — add createdAt column ───────────────────────────

-- The existing table (from the 20260408140755 migration) is missing
-- the createdAt column our new schema requires. Add it with a default
-- so the existing row gets a sensible timestamp.
ALTER TABLE "BankAccount"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ─── 6. BankTransfer table ───────────────────────────────────────────

CREATE TABLE "BankTransfer" (
    "id"            UUID                 NOT NULL DEFAULT gen_random_uuid(),
    "userId"        UUID                 NOT NULL,
    "packageId"     UUID                 NOT NULL,
    "packageName"   TEXT                 NOT NULL,
    "hdvMinutes"    INTEGER              NOT NULL,
    "priceCentsTTC" INTEGER              NOT NULL,
    "reference"     TEXT                 NOT NULL,
    "status"        "BankTransferStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" UUID,
    "reviewedById"  UUID,
    "reviewedAt"    TIMESTAMP(3),
    "rejectionNote" TEXT,
    "createdAt"     TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)         NOT NULL,

    CONSTRAINT "BankTransfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankTransfer_reference_key"      ON "BankTransfer"("reference");
CREATE UNIQUE INDEX "BankTransfer_transactionId_key"  ON "BankTransfer"("transactionId");
CREATE INDEX        "BankTransfer_userId_createdAt_idx" ON "BankTransfer"("userId", "createdAt");
CREATE INDEX        "BankTransfer_status_idx"         ON "BankTransfer"("status");
CREATE INDEX        "BankTransfer_reference_idx"      ON "BankTransfer"("reference");

ALTER TABLE "BankTransfer"
  ADD CONSTRAINT "BankTransfer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BankTransfer_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BankTransfer_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
