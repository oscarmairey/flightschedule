-- FlightSchedule V2.4 — per-type HDV wallets (FlightHourType).
--
-- Before this migration:
--   - `User.hdvBalanceMin` held a single global balance per user.
--   - Every `Transaction` was fungible — all hours counted the same.
--   - `Package` was un-categorized; every HDV minute came from the same pool.
--
-- After this migration:
--   - A new `FlightHourType` model carries admin-defined categories
--     (École, Voyage, Local, …). A "Standard" seed row is inserted by this
--     migration so existing data backfills to a valid FK.
--   - `Package`, `Transaction`, `BankTransfer` get a required
--     `flightHourTypeId` FK. Existing rows are backfilled to Standard.
--   - `BankTransfer` additionally gets a `flightHourTypeName` snapshot
--     (same shape as `packageName`) so historical rows keep a readable
--     label even if the type is renamed later.
--   - A new `UserFlightHourBalance` join table holds the denormalized
--     balance per (user, type). Existing `User.hdvBalanceMin` values are
--     migrated into it, bound to Standard, then the column is dropped.
--   - `Transaction.balanceAfterMin` is re-interpreted as the per-type
--     balance snapshot (the value is byte-identical because pre-migration
--     every transaction belonged to the single Standard wallet — so
--     SUM(amountMin) for Standard equals the original global SUM).
--
-- Rule #2 (updated invariant) holds by construction: for every
--   (userId, flightHourTypeId),
--     UserFlightHourBalance.balanceMin = SUM(Transaction.amountMin).
--
-- Atomicity: the whole migration runs in a single Prisma-managed DB
-- transaction, so if any step fails the schema and data stay consistent.

-- ─── 1. FlightHourType table + seed Standard ────────────────────────

CREATE TABLE "FlightHourType" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "isActive"    BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlightHourType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlightHourType_name_key" ON "FlightHourType"("name");
CREATE INDEX "FlightHourType_isActive_name_idx" ON "FlightHourType"("isActive", "name");

-- The seed row: we use a deterministic UUID so later references in this
-- same migration can all point at the same id. gen_random_uuid() in a
-- subquery would work too, but a literal keeps the SQL readable.
INSERT INTO "FlightHourType" ("id", "name", "description", "isActive")
VALUES (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'Standard',
  'Type par défaut créé automatiquement lors de la migration V2.4. Renommez-le ou créez d''autres types depuis /admin/tarifs.',
  true
);

-- ─── 2. Package.flightHourTypeId ─────────────────────────────────────

ALTER TABLE "Package" ADD COLUMN "flightHourTypeId" UUID;

UPDATE "Package"
   SET "flightHourTypeId" = '00000000-0000-4000-8000-000000000001'::uuid;

ALTER TABLE "Package"
  ALTER COLUMN "flightHourTypeId" SET NOT NULL,
  ADD CONSTRAINT "Package_flightHourTypeId_fkey"
    FOREIGN KEY ("flightHourTypeId") REFERENCES "FlightHourType"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Package_flightHourTypeId_idx" ON "Package"("flightHourTypeId");

-- ─── 3. Transaction.flightHourTypeId ─────────────────────────────────

ALTER TABLE "Transaction" ADD COLUMN "flightHourTypeId" UUID;

UPDATE "Transaction"
   SET "flightHourTypeId" = '00000000-0000-4000-8000-000000000001'::uuid;

ALTER TABLE "Transaction"
  ALTER COLUMN "flightHourTypeId" SET NOT NULL,
  ADD CONSTRAINT "Transaction_flightHourTypeId_fkey"
    FOREIGN KEY ("flightHourTypeId") REFERENCES "FlightHourType"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Transaction_flightHourTypeId_idx" ON "Transaction"("flightHourTypeId");
CREATE INDEX "Transaction_userId_flightHourTypeId_createdAt_idx"
  ON "Transaction"("userId", "flightHourTypeId", "createdAt");

-- ─── 4. BankTransfer.flightHourTypeId + name snapshot ────────────────

ALTER TABLE "BankTransfer"
  ADD COLUMN "flightHourTypeId"   UUID,
  ADD COLUMN "flightHourTypeName" TEXT;

UPDATE "BankTransfer"
   SET "flightHourTypeId"   = '00000000-0000-4000-8000-000000000001'::uuid,
       "flightHourTypeName" = 'Standard';

ALTER TABLE "BankTransfer"
  ALTER COLUMN "flightHourTypeId"   SET NOT NULL,
  ALTER COLUMN "flightHourTypeName" SET NOT NULL,
  ADD CONSTRAINT "BankTransfer_flightHourTypeId_fkey"
    FOREIGN KEY ("flightHourTypeId") REFERENCES "FlightHourType"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "BankTransfer_flightHourTypeId_idx" ON "BankTransfer"("flightHourTypeId");

-- ─── 5. UserFlightHourBalance + backfill from User.hdvBalanceMin ─────

CREATE TABLE "UserFlightHourBalance" (
    "userId"           UUID         NOT NULL,
    "flightHourTypeId" UUID         NOT NULL,
    "balanceMin"       INTEGER      NOT NULL DEFAULT 0,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFlightHourBalance_pkey" PRIMARY KEY ("userId", "flightHourTypeId"),
    CONSTRAINT "UserFlightHourBalance_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserFlightHourBalance_flightHourTypeId_fkey"
        FOREIGN KEY ("flightHourTypeId") REFERENCES "FlightHourType"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "UserFlightHourBalance_userId_idx" ON "UserFlightHourBalance"("userId");
CREATE INDEX "UserFlightHourBalance_flightHourTypeId_idx" ON "UserFlightHourBalance"("flightHourTypeId");

-- One row per user, pointing at Standard, with the pre-existing balance.
INSERT INTO "UserFlightHourBalance" ("userId", "flightHourTypeId", "balanceMin", "updatedAt")
SELECT
  "id",
  '00000000-0000-4000-8000-000000000001'::uuid,
  "hdvBalanceMin",
  CURRENT_TIMESTAMP
FROM "User";

-- ─── 6. Drop the old global balance column ───────────────────────────

ALTER TABLE "User" DROP COLUMN "hdvBalanceMin";
