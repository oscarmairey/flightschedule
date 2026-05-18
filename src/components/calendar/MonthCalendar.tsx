// FlightSchedule — month overview grid.
//
// Server component. Renders a 7-column Mon→Sun grid covering every week
// the target month touches (5 or 6 rows). Each cell shows the day number
// and a small gray dot iff the day is "busy" — that is, it has at least
// one CONFIRMED reservation, or any AvailabilityBlock exception applies,
// or it falls outside every OpenPeriod (when any OpenPeriod row exists).
//
// Click target: every cell wraps a <Link href={buildDayHref(yyyymmdd)}>
// — clicking jumps back to the corresponding week view (the parent page
// decides whether to also pre-select the date in a booking form).
//
// Why no per-day query loop: the WeekCalendar pattern of calling
// `getUnavailabilityForDate` once per day would mean ~35 queries per
// month render. We fetch the relevant rows in 4 batched queries and
// resolve the precedence in memory.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { DAY_LABELS_FR, formatDayMonthFR } from "@/lib/format";

type MonthCalendarProps = {
  monthStart: Date; // 1st of month at 00:00 Europe/Paris (UTC instant)
  buildDayHref: (yyyymmdd: string) => string;
};

const TZ = "Europe/Paris";

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function toParisYmd(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

/**
 * Build the visible Monday-anchored grid for the month containing
 * `monthStart`. Returns 35 or 42 day cells (5 or 6 weeks) with metadata.
 */
function buildMonthGrid(monthStart: Date): {
  yyyymmdd: string;
  inMonth: boolean;
  dayNum: number;
  dayOfWeekJs: number; // 0=Sun..6=Sat (matches AvailabilityBlock.dayOfWeek)
}[] {
  // Resolve "month" by reading the YYYY-MM of monthStart in Paris time.
  const ymd0 = toParisYmd(monthStart);
  const [yearStr, monthStr] = ymd0.split("-");
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1; // 0-indexed

  // First day of month, Paris-local
  const firstParisYmd = `${yearStr}-${monthStr}-01`;
  const firstNoonUtc = new Date(`${firstParisYmd}T12:00:00.000Z`);
  // Day-of-week in JS convention (0=Sun..6=Sat). For a Mon-anchored
  // grid, the offset back to Monday is ((dow + 6) % 7).
  const firstDow = firstNoonUtc.getUTCDay();
  const offsetToMonday = (firstDow + 6) % 7;

  // Last day of month
  const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const lastParisYmd = `${yearStr}-${monthStr}-${pad2(lastDay)}`;
  const lastNoonUtc = new Date(`${lastParisYmd}T12:00:00.000Z`);
  const lastDow = lastNoonUtc.getUTCDay();
  const offsetAfterSunday = (7 - lastDow) % 7; // 0 if Sunday, else fill to Sunday

  const totalDays = offsetToMonday + lastDay + offsetAfterSunday;
  const cells: {
    yyyymmdd: string;
    inMonth: boolean;
    dayNum: number;
    dayOfWeekJs: number;
  }[] = [];

  for (let i = 0; i < totalDays; i++) {
    // Walk forward from (firstParisYmd - offsetToMonday days), one day at a time.
    const dayOffset = i - offsetToMonday;
    const cursor = new Date(firstNoonUtc.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const ymd = toParisYmd(cursor);
    const [, , dayStr] = ymd.split("-");
    const dayNum = Number(dayStr);
    const noon = new Date(`${ymd}T12:00:00.000Z`);
    const inMonth =
      noon.getUTCMonth() === monthIdx && noon.getUTCFullYear() === year;
    cells.push({
      yyyymmdd: ymd,
      inMonth,
      dayNum,
      dayOfWeekJs: noon.getUTCDay(),
    });
  }
  return cells;
}

export async function MonthCalendar({
  monthStart,
  buildDayHref,
}: MonthCalendarProps) {
  const cells = buildMonthGrid(monthStart);
  const gridStart = new Date(`${cells[0].yyyymmdd}T00:00:00.000Z`);
  const gridEnd = new Date(
    `${cells[cells.length - 1].yyyymmdd}T00:00:00.000Z`,
  );
  // Push end a full day so the inclusive last day is covered.
  const gridEndExclusive = new Date(gridEnd.getTime() + 24 * 60 * 60 * 1000);

  const [reservations, availabilityBlocks, openPeriodCount, gridOpenPeriods] =
    await Promise.all([
      prisma.reservation.findMany({
        where: {
          status: "CONFIRMED",
          startsAt: { lt: gridEndExclusive },
          endsAt: { gt: gridStart },
        },
        select: { startsAt: true, endsAt: true },
      }),
      prisma.availabilityBlock.findMany({
        where: {
          OR: [
            { dayOfWeek: { not: null } },
            {
              specificDate: {
                gte: gridStart,
                lt: gridEndExclusive,
              },
            },
          ],
        },
        select: {
          dayOfWeek: true,
          specificDate: true,
        },
      }),
      prisma.openPeriod.count(),
      prisma.openPeriod.findMany({
        where: {
          startDate: { lt: gridEndExclusive },
          endDate: { gte: gridStart },
        },
        select: { startDate: true, endDate: true },
      }),
    ]);

  // Build per-day busy lookup
  const reservationDays = new Set<string>();
  for (const r of reservations) {
    // Iterate every Paris-local date the reservation touches.
    let cursor = toParisYmd(r.startsAt);
    const lastDayYmd = toParisYmd(new Date(r.endsAt.getTime() - 1));
    while (true) {
      reservationDays.add(cursor);
      if (cursor === lastDayYmd) break;
      const next = new Date(`${cursor}T12:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      cursor = toParisYmd(next);
    }
  }

  const specificBlockDays = new Set<string>();
  const recurringBlockDays = new Set<number>(); // dayOfWeek values
  for (const b of availabilityBlocks) {
    if (b.specificDate) {
      specificBlockDays.add(toParisYmd(b.specificDate));
    } else if (b.dayOfWeek !== null) {
      recurringBlockDays.add(b.dayOfWeek);
    }
  }

  function isClosedDay(yyyymmdd: string): boolean {
    if (openPeriodCount === 0) return false;
    const dayUtcMidnight = new Date(`${yyyymmdd}T00:00:00.000Z`);
    return !gridOpenPeriods.some(
      (p) => p.startDate <= dayUtcMidnight && p.endDate >= dayUtcMidnight,
    );
  }

  function isBusy(cell: (typeof cells)[number]): boolean {
    if (reservationDays.has(cell.yyyymmdd)) return true;
    if (isClosedDay(cell.yyyymmdd)) return true;
    // specificDate exception takes precedence over dayOfWeek
    if (specificBlockDays.has(cell.yyyymmdd)) return true;
    // If the day has a specific exception list, the recurring rule is
    // ignored (matches `getUnavailabilityForDate`'s precedence). But
    // since `specificBlockDays.has` already returned true above when a
    // specific exception exists, here we know there's none — fall through
    // to the recurring rule.
    if (recurringBlockDays.has(cell.dayOfWeekJs)) return true;
    return false;
  }

  const todayYmd = toParisYmd(new Date());

  return (
    <div className="overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-border bg-surface-soft text-center text-[0.65rem] font-medium uppercase tracking-[0.08em] text-text-subtle">
        {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
          <div key={dow} className="px-1 py-2.5 sm:px-2">
            {DAY_LABELS_FR[dow].slice(0, 3)}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 bg-surface-elevated">
        {cells.map((cell) => {
          const busy = isBusy(cell);
          const isToday = cell.yyyymmdd === todayYmd;
          const fullDateLabel = formatDayMonthFR(
            new Date(`${cell.yyyymmdd}T12:00:00.000Z`),
          );
          const aria = busy
            ? `${fullDateLabel} — au moins une réservation ou indisponibilité`
            : `${fullDateLabel} — disponible`;

          return (
            <Link
              key={cell.yyyymmdd}
              href={buildDayHref(cell.yyyymmdd)}
              aria-label={aria}
              title={aria}
              className={`relative flex min-h-16 flex-col items-center justify-start border-b border-l border-border-subtle px-1 py-2 text-center transition-colors hover:bg-surface-sunken/50 sm:min-h-20 ${
                isToday ? "bg-warning-soft/30" : ""
              } ${cell.inMonth ? "" : "text-text-subtle/70"}`}
            >
              <span
                className={`font-display text-base font-semibold tabular leading-none sm:text-lg ${
                  isToday
                    ? "text-warning-soft-fg"
                    : cell.inMonth
                      ? "text-text-strong"
                      : "text-text-subtle"
                }`}
              >
                {cell.dayNum}
              </span>
              {busy && (
                <span
                  aria-hidden="true"
                  className="mt-auto mb-1 inline-block h-1.5 w-1.5 rounded-full bg-text-muted/70"
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
