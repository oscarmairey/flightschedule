-- FlightSchedule V2.2 — drop the Flight→Reservation link.
--
-- Previously, every Flight row referenced a Reservation via a NOT NULL
-- FK (Flight.reservationId). The atomic flight-submission flow looked
-- up or auto-created a reservation, expanded it if needed, and then
-- inserted the Flight + FLIGHT_DEBIT + reservation mutation in one
-- serializable transaction (CLAUDE.md rules #3b, #4).
--
-- V2.2 decouples them. Flights are now standalone log entries. The
-- pilot just enters engine times + airports + remarks; there is no
-- reservation selector and no auto-creation. Reservations remain as
-- pure scheduling blocks with no impact on or link to the flight log.
--
-- What the migration does:
--   1. Drops the FK constraint Flight_reservationId_fkey.
--   2. Drops the index Flight_reservationId_idx (leftover lookup index).
--   3. Drops the column Flight.reservationId entirely.
--
-- Legacy:
--   - Reservation.autoCreatedFromFlight stays on the schema. It won't
--     be set by new code, but historic rows keep their value so the
--     admin calendar still shows the "créée automatiquement par un vol"
--     label and `cancelReservation` still rejects cancellation of those
--     rows (the flight that produced them is the record of truth).
--   - Existing historic flights lose their reservationId. The FLIGHT_DEBIT
--     transactions on the ledger remain untouched — their flightId FK is
--     preserved.

-- 1. Drop the foreign key constraint.
ALTER TABLE "Flight" DROP CONSTRAINT IF EXISTS "Flight_reservationId_fkey";

-- 2. Drop the lookup index on reservationId.
DROP INDEX IF EXISTS "Flight_reservationId_idx";

-- 3. Drop the column.
ALTER TABLE "Flight" DROP COLUMN IF EXISTS "reservationId";
