// CAVOK — French date and time formatters.
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
  hour12: false,
});

const DATETIME_FMT = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
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
