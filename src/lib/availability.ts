// FlightSchedule — availability windows.
//
// ════════════════════════════════════════════════════════════════════
// V2 — OPEN PERIODS + UNAVAILABILITY EXCEPTIONS
// ════════════════════════════════════════════════════════════════════
//
// V2 (CLAUDE.md rule #8): the aircraft is bookable inside any OpenPeriod
// (date range, 24/7 within), MINUS any AvailabilityBlock exception that
// applies to the requested window.
//
// Special case: if NO OpenPeriod rows exist, the aircraft is treated as
// always open. This preserves the V2.0 behavior on fresh installs and
// avoids breaking the booking flow before any season has been defined.
//
// MULTI-DAY: a reservation may span multiple Paris-local days. The check
// iterates each day the request touches and validates BOTH that the day
// is inside an OpenPeriod AND that no exception overlaps the local
// time-of-day range on that day.
//
// PRECEDENCE for exceptions: a `specificDate` exception always wins over
// a `dayOfWeek` recurring exception for that date.
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
//   - Half-open intervals: a request for 09:00–12:00 is contained in
//     a window of 09:00–12:00 (boundaries are inclusive on the left,
//     exclusive on the right).

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
 * Iterate Paris-local YYYY-MM-DD dates from startYmd to endYmd, inclusive.
 */
function iterateLocalDates(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let cursor = new Date(`${startYmd}T12:00:00.000Z`); // noon = DST-safe
  const end = new Date(`${endYmd}T12:00:00.000Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}

/**
 * JS day-of-week (Sun=0..Sat=6) for a Paris-local YYYY-MM-DD.
 */
function dayOfWeekForLocalDate(ymd: string): number {
  // Use noon to dodge DST edges; the day-of-week is stable within the day.
  return new Date(`${ymd}T12:00:00.000Z`).getUTCDay();
}

/**
 * Determine whether a UTC time window is bookable.
 *
 * V2 logic:
 *   1. Reject if endsAtUtc <= startsAtUtc.
 *   2. Iterate every Paris-local day the window touches.
 *   3. For each day, require it to fall inside some OpenPeriod (unless
 *      no OpenPeriod rows exist at all → always-open fallback).
 *   4. For each day, compute the local minutes range the window covers
 *      on that day (clamped to 0..1440) and reject if any exception
 *      overlaps it. Specific-date exceptions take precedence over
 *      recurring weekday exceptions for that day.
 */
export async function isWithinAvailability(
  startsAtUtc: Date,
  endsAtUtc: Date,
): Promise<AvailabilityCheckResult> {
  if (endsAtUtc <= startsAtUtc) {
    return { ok: false, reason: "Plage horaire invalide." };
  }

  const startParts = toLocalParts(startsAtUtc);
  // For the end, subtract a millisecond so a 21:00–24:00 (== next-day 00:00)
  // request only touches the start day, not the next.
  const endParts = toLocalParts(new Date(endsAtUtc.getTime() - 1));

  const days = iterateLocalDates(startParts.yyyymmdd, endParts.yyyymmdd);

  // Check OpenPeriod gating once for the whole window.
  const openPeriodCount = await prisma.openPeriod.count();
  if (openPeriodCount > 0) {
    for (const ymd of days) {
      const dayUtc = parisDateToUtcMidnight(ymd);
      const period = await prisma.openPeriod.findFirst({
        where: {
          startDate: { lte: dayUtc },
          endDate: { gte: dayUtc },
        },
        select: { id: true },
      });
      if (!period) {
        return {
          ok: false,
          reason: `Hors période d'ouverture (${ymd}).`,
        };
      }
    }
  }

  // For each day, check unavailability exceptions against the window's
  // local minutes-of-day on that day.
  for (const ymd of days) {
    const isFirstDay = ymd === startParts.yyyymmdd;
    const isLastDay = ymd === endParts.yyyymmdd;

    let startMin: number;
    let endMin: number;
    if (isFirstDay && isLastDay) {
      startMin = startParts.minutesFromMidnight;
      const rawEnd = toLocalParts(endsAtUtc).minutesFromMidnight;
      endMin = rawEnd === 0 ? 1440 : rawEnd;
    } else if (isFirstDay) {
      startMin = startParts.minutesFromMidnight;
      endMin = 1440;
    } else if (isLastDay) {
      startMin = 0;
      const rawEnd = toLocalParts(endsAtUtc).minutesFromMidnight;
      endMin = rawEnd === 0 ? 1440 : rawEnd;
    } else {
      startMin = 0;
      endMin = 1440;
    }

    const dayUtc = parisDateToUtcMidnight(ymd);
    const overrideBlocks = await prisma.availabilityBlock.findMany({
      where: { specificDate: dayUtc },
    });

    const blocks =
      overrideBlocks.length > 0
        ? overrideBlocks
        : await prisma.availabilityBlock.findMany({
            where: { dayOfWeek: dayOfWeekForLocalDate(ymd) },
          });

    const hit = blocks.find(
      (b) => b.startMinutes < endMin && b.endMinutes > startMin,
    );
    if (hit) {
      return {
        ok: false,
        reason: hit.reason
          ? `Période bloquée : ${hit.reason}`
          : "Période bloquée par l'administrateur.",
      };
    }
  }

  return { ok: true };
}

/**
 * Return the unavailability exception windows for a given Paris-local
 * date. Used by the calendar UI to render the red overlay on cells
 * that fall inside a blocking exception.
 */
export async function getUnavailabilityForDate(
  parisLocalDate: Date,
): Promise<{ startMinutes: number; endMinutes: number; reason: string | null }[]> {
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

  return blocks.map((b) => ({
    startMinutes: b.startMinutes,
    endMinutes: b.endMinutes,
    reason: b.reason,
  }));
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
