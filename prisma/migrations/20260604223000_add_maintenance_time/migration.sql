-- FlightSchedule — MaintenanceOperation.timeMin.
--
-- Paris-local time-of-day of the visit (minutes since midnight, 0–1439).
-- Lets a visit sit between two flights on the same calendar day so the
-- "HDV depuis" calc only counts flights flown after it. NULL = legacy /
-- whole-day visit: same-day flights are excluded (original `date >`
-- strict behaviour preserved for rows logged before this column existed).

ALTER TABLE "MaintenanceOperation" ADD COLUMN "timeMin" INTEGER;
