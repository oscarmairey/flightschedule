// FlySchedule — availability windows.
//
// ════════════════════════════════════════════════════════════════════
// EUROPE/PARIS TIMEZONE TRAP — READ THIS BEFORE EDITING
// ════════════════════════════════════════════════════════════════════
//
// `AvailabilityBlock` stores `startMinutes` / `endMinutes` as MINUTES
// FROM MIDNIGHT IN EUROPE/PARIS LOCAL TIME, not UTC. This matters
// because:
//
//   1. A window of 08:00–18:00 is 08:00–18:00 *Paris time*, not UTC.
//      In summer (UTC+2), that's 06:00–16:00 UTC. In winter (UTC+1),
//      it's 07:00–17:00 UTC. The conversion CANNOT be cached.
//
//   2. DST transitions on the last Sundays of March and October are
//      real. On the spring transition, "01:00–04:00 Paris time" is
//      actually 2 hours of wall-clock duration, not 3. We don't have
//      to handle this for V1 (the airfield isn't open at 03:00) but
//      DON'T add naive arithmetic that would break it.
//
// Conventions used here:
//   - All `Date` objects passed in are interpreted in their wall-clock
//     Europe/Paris representation. Callers convert UTC ↔ local using
//     the helpers in `src/lib/format.ts` (which use Intl.DateTimeFormat
//     with timeZone: "Europe/Paris").
//   - Day-of-week is the JavaScript convention: Sunday=0, Saturday=6,
//     same as the AvailabilityBlock.dayOfWeek field.
//   - Half-open intervals: a request for 10:00–11:00 is contained in
//     a window of 10:00–11:00 (boundaries are inclusive on the left,
//     exclusive on the right).
//
// PRECEDENCE RULE (PRD §3.2.1):
//   1. If a `specificDate` block exists for the requested date, those
//      blocks WIN — recurring (`dayOfWeek`) blocks are ignored entirely.
//   2. Among the chosen set, an `UNAVAILABLE` block always overrides
//      `AVAILABLE`. The request is allowed only if it falls inside an
//      AVAILABLE block AND outside every UNAVAILABLE block.

import { prisma } from "@/lib/db";
import type { AvailabilityBlockModel } from "@/generated/prisma/models/AvailabilityBlock";

const TZ = "Europe/Paris";

/**
 * Convert a UTC Date into the Paris-local minutes-from-midnight + day-of-week.
 * Used to compare a UTC reservation slot against AvailabilityBlock fields.
 */
function toLocalParts(d: Date): {
  dayOfWeek: number;
  minutesFromMidnight: number;
  yyyymmdd: string;
} {
  // Format in Paris locale, then re-parse the components.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const weekdayShort = get("weekday"); // "Sun" .. "Sat"
  const DAY_MAP: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = DAY_MAP[weekdayShort] ?? 0;

  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const minutesFromMidnight = hour * 60 + minute;

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const yyyymmdd = `${year}-${month}-${day}`;

  return { dayOfWeek, minutesFromMidnight, yyyymmdd };
}

/**
 * The earliest UTC midnight for a given Paris-local YYYY-MM-DD. Used
 * to query AvailabilityBlock.specificDate (a `@db.Date` column).
 */
function parisDateToUtcMidnight(yyyymmdd: string): Date {
  // Postgres `date` columns are stored as UTC midnight by Prisma. We
  // construct the same value here.
  return new Date(`${yyyymmdd}T00:00:00.000Z`);
}

export type AvailabilityCheckResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Determine whether a UTC time window falls entirely within an
 * AVAILABLE block, with no UNAVAILABLE override blocking it.
 *
 * Both bounds must be in the same Paris-local day. Cross-midnight
 * reservations are rejected (out of V1 scope).
 */
export async function isWithinAvailability(
  startsAtUtc: Date,
  endsAtUtc: Date,
): Promise<AvailabilityCheckResult> {
  if (endsAtUtc <= startsAtUtc) {
    return { ok: false, reason: "Plage horaire invalide." };
  }

  const startParts = toLocalParts(startsAtUtc);
  const endParts = toLocalParts(endsAtUtc);

  if (startParts.yyyymmdd !== endParts.yyyymmdd) {
    return {
      ok: false,
      reason: "Une réservation ne peut pas chevaucher minuit (heure de Paris).",
    };
  }

  const dayOfWeek = startParts.dayOfWeek;
  const startMin = startParts.minutesFromMidnight;
  // For the end, recompute in case end is exactly midnight (1440)
  const endMin = endParts.minutesFromMidnight === 0
    ? 1440
    : endParts.minutesFromMidnight;

  const specificDate = parisDateToUtcMidnight(startParts.yyyymmdd);

  const overrideBlocks = await prisma.availabilityBlock.findMany({
    where: { specificDate },
  });

  // Precedence: if any specific_date blocks exist for this day, only
  // those count — recurring blocks are ignored.
  const blocks =
    overrideBlocks.length > 0
      ? overrideBlocks
      : await prisma.availabilityBlock.findMany({
          where: { dayOfWeek },
        });

  if (blocks.length === 0) {
    return {
      ok: false,
      reason: "Aucune disponibilité définie pour cette date.",
    };
  }

  // Reject if any UNAVAILABLE block overlaps the requested window.
  const unavailableHit = blocks.find(
    (b) =>
      b.type === "UNAVAILABLE" &&
      b.startMinutes < endMin &&
      b.endMinutes > startMin,
  );
  if (unavailableHit) {
    return {
      ok: false,
      reason: unavailableHit.reason
        ? `Période bloquée : ${unavailableHit.reason}`
        : "Période bloquée par l'administrateur.",
    };
  }

  // Accept if some AVAILABLE block fully contains [startMin, endMin).
  const containingAvailable = blocks.find(
    (b) =>
      b.type === "AVAILABLE" &&
      b.startMinutes <= startMin &&
      b.endMinutes >= endMin,
  );
  if (!containingAvailable) {
    return {
      ok: false,
      reason: "Plage hors des fenêtres de disponibilité.",
    };
  }

  return { ok: true };
}

/**
 * Return the effective AVAILABLE windows for a given Paris-local date.
 * Used by the calendar UI to render the bookable background tints.
 */
export async function getAvailabilityForDate(
  parisLocalDate: Date,
): Promise<{ startMinutes: number; endMinutes: number }[]> {
  const parts = toLocalParts(parisLocalDate);
  const specificDate = parisDateToUtcMidnight(parts.yyyymmdd);

  const overrides = await prisma.availabilityBlock.findMany({
    where: { specificDate },
    orderBy: { startMinutes: "asc" },
  });

  const blocks =
    overrides.length > 0
      ? overrides
      : await prisma.availabilityBlock.findMany({
          where: { dayOfWeek: parts.dayOfWeek },
          orderBy: { startMinutes: "asc" },
        });

  // Return AVAILABLE windows minus UNAVAILABLE overlays. For the simple
  // V1 case the UI doesn't need pixel-perfect splitting — it can render
  // available tints and the booking server-side check will reject any
  // overlap with UNAVAILABLE blocks. So we just return the AVAILABLE list.
  return blocks
    .filter((b) => b.type === "AVAILABLE")
    .map((b) => ({ startMinutes: b.startMinutes, endMinutes: b.endMinutes }));
}

/**
 * List confirmed reservations that overlap a given window. Used by the
 * admin availability page when blocking a deletion that would orphan
 * existing reservations.
 */
export async function listConfirmedReservationsInWindow(input: {
  startsAtUtc: Date;
  endsAtUtc: Date;
}): Promise<{ id: string; userId: string; startsAt: Date; endsAt: Date }[]> {
  const rows = await prisma.reservation.findMany({
    where: {
      status: "CONFIRMED",
      startsAt: { lt: input.endsAtUtc },
      endsAt: { gt: input.startsAtUtc },
    },
    select: { id: true, userId: true, startsAt: true, endsAt: true },
    orderBy: { startsAt: "asc" },
  });
  return rows;
}

export type AvailabilityBlockRow = AvailabilityBlockModel;
