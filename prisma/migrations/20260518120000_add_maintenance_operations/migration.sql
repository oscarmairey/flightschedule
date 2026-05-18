-- FlightSchedule — MaintenanceOperation table.
--
-- Records airframe-wide maintenance events (annual visit, workshop visit).
-- The admin logs each event with its date from /admin/carnet-de-route.
-- The page surfaces the latest event of each type plus the HDV (flight
-- minutes) accumulated since that event — computed as
-- SUM(Flight.actualDurationMin WHERE date > latestEvent.date).
--
-- Events are aircraft-wide, not per-pilot: this is a single shared
-- airframe in V1/V2.

CREATE TYPE "MaintenanceOperationType" AS ENUM (
  'ANNUAL_VISIT',
  'WORKSHOP_VISIT'
);

CREATE TABLE "MaintenanceOperation" (
    "id"          UUID                       NOT NULL DEFAULT gen_random_uuid(),
    "type"        "MaintenanceOperationType" NOT NULL,
    "date"        DATE                       NOT NULL,
    "notes"       TEXT,
    "createdById" UUID                       NOT NULL,
    "createdAt"   TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MaintenanceOperation_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- (type, date DESC) covers the "latest of each type" lookup as a single
-- index-only scan, and (date DESC) covers the audit list view.
CREATE INDEX "MaintenanceOperation_type_date_idx"
    ON "MaintenanceOperation" ("type", "date" DESC);
CREATE INDEX "MaintenanceOperation_date_idx"
    ON "MaintenanceOperation" ("date" DESC);
CREATE INDEX "MaintenanceOperation_createdById_idx"
    ON "MaintenanceOperation" ("createdById");
