// FlightSchedule — French date and time formatters.
//
// CRITICAL: every date/time rendered in the app must come through one of
// these helpers. Never call `date.toLocaleString()` or `Intl.DateTimeFormat`
// inline — the timezone (Europe/Paris) and locale (fr-FR) must be locked
// at the formatter level so the next agent can't accidentally render UTC
// or English month names.
//
// All formatters accept a Date or null. Null returns an em-dash so the
// caller doesn't have to special-case empty cells.

const TZ = "Europe/Paris";
const LOCALE = "fr-FR";

const DATE_FMT = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const TIME_FMT = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const DATETIME_FMT = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const WEEKDAY_FMT = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  weekday: "long",
});

const WEEKDAY_SHORT_FMT = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  weekday: "short",
});

const DAY_MONTH_FMT = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  day: "2-digit",
  month: "long",
});

// Compact DD/MM display for calendar grid column headers — the year is
// already shown in the page H1 week range, so the column header just
// needs the day + month without the year.
const DAY_MONTH_SHORT_FMT = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
});

export function formatDateFR(d: Date | null | undefined): string {
  if (!d) return "—";
  return DATE_FMT.format(d);
}

export function formatTimeFR(d: Date | null | undefined): string {
  if (!d) return "—";
  return TIME_FMT.format(d);
}

export function formatDateTimeFR(d: Date | null | undefined): string {
  if (!d) return "—";
  return DATETIME_FMT.format(d);
}

export function formatWeekdayFR(d: Date | null | undefined): string {
  if (!d) return "—";
  return WEEKDAY_FMT.format(d);
}

export function formatWeekdayShortFR(d: Date | null | undefined): string {
  if (!d) return "—";
  return WEEKDAY_SHORT_FMT.format(d);
}

export function formatDayMonthFR(d: Date | null | undefined): string {
  if (!d) return "—";
  return DAY_MONTH_FMT.format(d);
}

/**
 * Compact DD/MM for calendar column headers. Use this in the grid where
 * vertical and horizontal space matters; pair it with formatDateFR for
 * tooltips/aria where the full DD/MM/YYYY is appropriate.
 */
export function formatDayMonthShortFR(d: Date | null | undefined): string {
  if (!d) return "—";
  return DAY_MONTH_SHORT_FMT.format(d);
}

/**
 * French day-of-week labels indexed Sunday=0..Saturday=6, matching
 * `AvailabilityBlock.dayOfWeek` and JavaScript's `Date.getDay()`.
 */
export const DAY_LABELS_FR = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
] as const;

/**
 * Convert a Paris-local YYYY-MM-DD + HH:MM into a UTC Date.
 *
 * Strategy: treat the wall-clock components as if they were UTC (giving us
 * a candidate instant), then ask Intl what offset Paris was at that
 * instant, and shift back. Handles DST correctly because the offset is
 * derived from the instant rather than hardcoded.
 *
 * Use this any time the user picks a date + time in the UI and you need
 * to persist or query against UTC.
 */
export function parisLocalToUtc(
  ymd: string,
  hh: number,
  mm: number,
): Date {
  const guess = new Date(
    `${ymd}T${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}:00.000Z`,
  );
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    timeZoneName: "shortOffset",
  });
  const parts = fmt.formatToParts(guess);
  const tzPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const offsetMatch = tzPart.match(/GMT([+-]\d+)/);
  const offsetHours = offsetMatch ? Number(offsetMatch[1]) : 1;
  return new Date(guess.getTime() - offsetHours * 60 * 60 * 1000);
}

/**
 * The Paris-local YYYY-MM-DD calendar date for a given UTC instant.
 * Used by the flight submission flow to derive `Flight.date` from the
 * bloc-OFF engine time (the day the flight started, in pilot wall-clock).
 */
export function parisLocalDateString(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // YYYY-MM-DD
}

// ────────────────────────────────────────────────────────────────────
// Week-navigation helpers for the Mon→Sun calendar grid.
//
// Extracted in Pass 3.2 from /calendar and /admin/disponibilites where
// they were duplicated verbatim with a DST-unsafe hard-coded "+02:00"
// string. The shared version routes through `parisLocalToUtc`, which
// derives the offset from Intl at the target instant — correct for
// CEST (UTC+2) and CET (UTC+1) alike.
// ────────────────────────────────────────────────────────────────────

/**
 * Paris-local Monday 00:00 for the week containing the given instant,
 * returned as a UTC Date.
 */
export function startOfParisWeek(d: Date): Date {
  // Which weekday (0=Mon…6=Sun) is `d` in Paris?
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  const DOW: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const diff = DOW[weekday] ?? 0;

  // Paris-local midnight of the current day, then shift back by `diff`
  // calendar days to land on Monday. Using parisLocalToUtc for both
  // steps means DST transitions are handled by Intl, not by a
  // hard-coded offset.
  const ymd = `${get("year")}-${get("month")}-${get("day")}`;
  const todayMidnight = parisLocalToUtc(ymd, 0, 0);
  const monday = new Date(todayMidnight.getTime() - diff * 24 * 60 * 60 * 1000);

  // Re-snap to Paris-local midnight so the result is always exactly
  // 00:00 Paris-local of the target Monday, even if the subtraction
  // crossed a DST boundary (spring-forward means the raw −24h math
  // lands at 01:00 the day before in Paris-local).
  const mondayYmd = parisLocalDateString(monday);
  return parisLocalToUtc(mondayYmd, 0, 0);
}

/** Shift a Paris-anchored week-start by N weeks. */
export function shiftParisWeek(weekStart: Date, weeks: number): Date {
  const shifted = new Date(
    weekStart.getTime() + weeks * 7 * 24 * 60 * 60 * 1000,
  );
  // Re-snap to Paris midnight for DST safety.
  return startOfParisWeek(shifted);
}

/** Format a Paris-local date as YYYY-MM-DD for ?week=… URLs. */
export function parisWeekParam(d: Date): string {
  return parisLocalDateString(d);
}

/** "DD/MM/YYYY – DD/MM/YYYY" for a Paris-anchored Mon→Sun week. */
export function formatParisWeekRange(weekStart: Date): string {
  const end = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  return `${formatDateFR(weekStart)} – ${formatDateFR(end)}`;
}

/**
 * Parse a ?week=YYYY-MM-DD param (validated) into a Paris-anchored
 * Monday. Returns `null` on malformed input so callers can fall back
 * to "current week".
 */
export function parseWeekParam(raw: string | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  // Noon to dodge DST transition edge cases when the raw date is the
  // day of spring-forward or fall-back.
  return startOfParisWeek(parisLocalToUtc(raw, 12, 0));
}
