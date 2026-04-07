-- CAVOK V1.1 — Remove HDV reconciliation, allow multiple flights per reservation,
-- remove admin validation. See plan: glowing-cuddling-squirrel.md.
--
-- Architectural impact: rewrites CLAUDE.md rules #4 and #9. The reservation
-- becomes the sole unit of HDV consumption; flights become immutable logbook
-- records with no HDV impact and no validation lifecycle.
--
-- ════════════════════════════════════════════════════════════════════
-- IRREVERSIBLE — drops columns and an enum value. The migration is NOT
-- destructive of balance arithmetic: existing FLIGHT_RECONCILIATION rows
-- in the Transaction ledger are re-typed to ADMIN_ADJUSTMENT *before*
-- the enum value is dropped, so balances reconstructed from the ledger
-- still tie out to User.hdvBalanceMin to the minute.
-- ════════════════════════════════════════════════════════════════════

-- 1. Convert any historical FLIGHT_RECONCILIATION rows to ADMIN_ADJUSTMENT
--    so the enum value can be safely dropped without losing balance history.
--    The reference field is rewritten so the audit trail still explains
--    what each row represents.
UPDATE "Transaction"
   SET type = 'ADMIN_ADJUSTMENT',
       reference = CASE
         WHEN reference IS NULL OR reference = ''
           THEN 'Réconciliation vol (legacy V1.0, migration vers modèle simplifié)'
         ELSE 'Réconciliation vol (legacy V1.0): ' || reference
       END
 WHERE type = 'FLIGHT_RECONCILIATION';

-- 2. Drop the lifecycle/reconciliation columns from Flight. They no longer
--    have any meaning under the V1.1 model.
ALTER TABLE "Flight" DROP COLUMN "reservedDurationMin";
ALTER TABLE "Flight" DROP COLUMN "reconciliationDeltaMin";
ALTER TABLE "Flight" DROP COLUMN "status";
ALTER TABLE "Flight" DROP COLUMN "adminNotes";
ALTER TABLE "Flight" DROP COLUMN "validatedAt";
ALTER TABLE "Flight" DROP COLUMN "rejectedAt";

-- 3. Drop the (now-orphaned) composite index that referenced the dropped
--    `status` column. Postgres dropped it implicitly with the column, but
--    we explicitly drop it for clarity if it still exists.
DROP INDEX IF EXISTS "Flight_status_createdAt_idx";

-- 4. Replace the unique index on Flight(reservationId) with a non-unique
--    FK lookup index. A reservation can now hold multiple flights.
DROP INDEX "Flight_reservationId_key";
CREATE INDEX "Flight_reservationId_idx" ON "Flight"("reservationId");

-- 5. Drop the FlightStatus enum entirely — no remaining references.
DROP TYPE "FlightStatus";

-- 6. Drop FLIGHT_RECONCILIATION from TransactionType. Postgres can't drop
--    a single enum value in place — recreate the enum and re-cast the
--    column. Step 1 has already converted any FLIGHT_RECONCILIATION rows
--    so the cast cannot fail.
ALTER TYPE "TransactionType" RENAME TO "TransactionType_old";

CREATE TYPE "TransactionType" AS ENUM (
  'PACKAGE_PURCHASE',
  'RESERVATION_DEBIT',
  'CANCELLATION_REFUND',
  'ADMIN_ADJUSTMENT'
);

ALTER TABLE "Transaction"
  ALTER COLUMN type TYPE "TransactionType"
  USING type::text::"TransactionType";

DROP TYPE "TransactionType_old";
