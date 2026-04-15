-- FlightSchedule V2.3 — add tachymeter (hour-meter) readings to Flight.
--
-- The pilot can now record the aircraft's tach reading at bloc OFF and
-- bloc ON alongside the existing engine wall-clock times. Tach readings
-- are hour-meter values in the form "XXXX.XX" (hours with hundredths).
--
-- Per architectural rule #1 (no floats in the DB), we store the value
-- as hundredths of an hour in an Int column:
--   user input "1234.56"  →  persisted 123456
--   user input "1235.12"  →  persisted 123512
--
-- Both columns are nullable because:
--   - historic Flight rows predate the field, and
--   - not every aircraft has a working tach worth logging.

ALTER TABLE "Flight"
  ADD COLUMN "tachyStartHundredths" INTEGER,
  ADD COLUMN "tachyStopHundredths"  INTEGER;
