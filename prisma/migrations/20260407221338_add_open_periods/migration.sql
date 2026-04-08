-- FlySchedule V2.1 — add OpenPeriod model.
--
-- Defines date ranges when the aircraft is bookable (24/7 within them).
-- AvailabilityBlock exceptions are still applied within open periods.
-- Special case: if no OpenPeriod rows exist, the booking layer treats
-- the aircraft as always open (preserves V2.0 behavior on fresh installs).

CREATE TABLE "OpenPeriod" (
  "id"          UUID         NOT NULL,
  "startDate"   DATE         NOT NULL,
  "endDate"     DATE         NOT NULL,
  "reason"      TEXT,
  "createdById" UUID         NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OpenPeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OpenPeriod_startDate_idx" ON "OpenPeriod"("startDate");
CREATE INDEX "OpenPeriod_endDate_idx"   ON "OpenPeriod"("endDate");

ALTER TABLE "OpenPeriod"
  ADD CONSTRAINT "OpenPeriod_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
