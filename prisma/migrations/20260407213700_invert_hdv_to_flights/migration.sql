-- FlySchedule V2 — Invert HDV consumption from Reservation to Flight.
-- See plan: cached-wondering-patterson.md
--
-- Architectural impact: rewrites CLAUDE.md rules #2, #3, #3b, #4, #6, #7, #8, #9.
-- Reservations become pure scheduling blocks; flights become the unit of HDV
-- consumption (debited from bloc OFF / bloc ON engine times). Availability
-- inverts from "allowed only inside an AVAILABLE block" to "allowed unless
-- inside an UNAVAILABLE exception" (24/7 default). New Package table for
-- admin-driven Stripe Product/Price CRUD.
--
-- ════════════════════════════════════════════════════════════════════
-- IRREVERSIBLE — drops columns, an enum, and an enum value. The migration
-- is NOT destructive of the HDV ledger arithmetic: existing
-- RESERVATION_DEBIT rows in the Transaction ledger are re-typed to
-- ADMIN_ADJUSTMENT *before* the enum value is dropped, so balances
-- reconstructed from the ledger still tie out to User.hdvBalanceMin.
-- AvailabilityBlock rows are wiped because their semantics are inverted.
-- ════════════════════════════════════════════════════════════════════

-- 1. Convert any historical RESERVATION_DEBIT rows to ADMIN_ADJUSTMENT so
--    the enum value can be safely dropped without losing balance history.
--    The reference field is rewritten so the audit trail still explains
--    what each row represents. Same recipe used by the V1.1
--    `simplify_drop_reconciliation` migration.
UPDATE "Transaction"
   SET type = 'ADMIN_ADJUSTMENT',
       reference = CASE
         WHEN reference IS NULL OR reference = ''
           THEN 'Débit réservation (legacy V1, retypé lors de la bascule V2 vers FLIGHT_DEBIT)'
         ELSE 'Débit réservation (legacy V1, retypé V2): ' || reference
       END
 WHERE type = 'RESERVATION_DEBIT';

-- 2. Wipe AvailabilityBlock rows. V2 inverts the semantics: rows now
--    represent UNAVAILABILITY exceptions only, not AVAILABLE windows.
--    Existing rows would be misinterpreted under the new rules.
DELETE FROM "AvailabilityBlock";

-- 3. Drop the type column from AvailabilityBlock. All rows are now
--    implicitly UNAVAILABLE.
ALTER TABLE "AvailabilityBlock" DROP COLUMN "type";

-- 4. Drop the AvailabilityType enum entirely (no remaining references).
DROP TYPE "AvailabilityType";

-- 5. Drop hdvDeductedMin from Reservation. V2 reservations have no HDV
--    impact, so there is nothing to snapshot for refunds.
ALTER TABLE "Reservation" DROP COLUMN "hdvDeductedMin";

-- 6. Add autoCreatedFromFlight to Reservation. True iff the row was
--    created server-side at flight-submission time for an "on the go"
--    flight (no prior booking). These reservations cannot be cancelled
--    because the underlying immutable flight is the source of truth.
ALTER TABLE "Reservation"
  ADD COLUMN "autoCreatedFromFlight" BOOLEAN NOT NULL DEFAULT false;

-- 7. Make Flight engine times NOT NULL. They now drive actualDurationMin.
--    All existing test rows already have non-null engine times — verified
--    via SELECT before writing this migration.
ALTER TABLE "Flight" ALTER COLUMN "engineStart" SET NOT NULL;
ALTER TABLE "Flight" ALTER COLUMN "engineStop"  SET NOT NULL;

-- 8. Rebuild TransactionType enum: drop RESERVATION_DEBIT, add FLIGHT_DEBIT.
--    Postgres can't drop a single enum value in place — use the rename +
--    recreate + cast recipe. Step 1 has already converted any
--    RESERVATION_DEBIT rows so the cast cannot fail.
ALTER TYPE "TransactionType" RENAME TO "TransactionType_old";

CREATE TYPE "TransactionType" AS ENUM (
  'PACKAGE_PURCHASE',
  'FLIGHT_DEBIT',
  'CANCELLATION_REFUND',
  'ADMIN_ADJUSTMENT'
);

ALTER TABLE "Transaction"
  ALTER COLUMN type TYPE "TransactionType"
  USING type::text::"TransactionType";

DROP TYPE "TransactionType_old";

-- 9. Add priceCents to Transaction. Populated by the Stripe webhook on
--    PACKAGE_PURCHASE so admin reports can show "Montant dépensé" without
--    a Stripe API round-trip. Null for non-purchase rows and legacy rows.
ALTER TABLE "Transaction" ADD COLUMN "priceCents" INTEGER;

-- 10. Create Package table. Admin CRUD on /admin/tarifs writes here and
--     mirrors changes to Stripe Products + Prices. Pilot dashboard reads
--     from here directly. Soft-delete only via isActive=false.
CREATE TABLE "Package" (
  "id"              UUID         NOT NULL,
  "stripeProductId" TEXT         NOT NULL,
  "stripePriceId"   TEXT         NOT NULL,
  "name"            TEXT         NOT NULL,
  "description"     TEXT,
  "priceCentsHT"    INTEGER      NOT NULL,
  "hdvMinutes"      INTEGER      NOT NULL,
  "isActive"        BOOLEAN      NOT NULL DEFAULT true,
  "sortOrder"       INTEGER      NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Package_stripeProductId_key" ON "Package"("stripeProductId");
CREATE UNIQUE INDEX "Package_stripePriceId_key"   ON "Package"("stripePriceId");
CREATE        INDEX "Package_isActive_sortOrder_idx" ON "Package"("isActive", "sortOrder");
