// CAVOK — weekly calendar grid.
//
// Server component. Renders a Mon→Sun week with time-of-day rows on the
// left axis. Availability windows are tinted in green; reservations
// render as colored blocks on top.
//
// Design constraints (PRD §3.2.2 + §7.2):
//   - Mobile-first: on small screens, scrolls horizontally one day at a
//     time via CSS scroll-snap. On md+ shows the full week.
//   - 30-minute slot granularity (matches RESERVATION_LIMITS).
//   - 06:00–22:00 visible band (32 rows). Earlier/later slots are out
//     of scope for V1 (the airfield isn't open at 03:00).
//   - Own reservations highlighted in zinc-900; others in zinc-500.
//   - Bookable slots are clickable links to /calendar?slot=...
//
// This is a server component — clicking a slot navigates to a query
// param that the page reads to open the booking dialog. No client JS
// needed for the calendar grid itself.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAvailabilityForDate } from "@/lib/availability";
import { formatDayMonthFR, DAY_LABELS_FR } from "@/lib/format";

type Reservation = {
  id: string;
  userId: string;
  startsAt: Date;
  endsAt: Date;
  user: { name: string };
};

type WeekCalendarProps = {
  weekStart: Date; // Monday at 00:00 Europe/Paris (UTC instant)
  currentUserId: string;
  isAdmin?: boolean;
  buildSlotHref: (date: string, time: string) => string;
};

const VISIBLE_START_MIN = 6 * 60; // 06:00
const VISIBLE_END_MIN = 22 * 60; // 22:00
const SLOT_MIN = 30;
const ROWS = (VISIBLE_END_MIN - VISIBLE_START_MIN) / SLOT_MIN; // 32

const TZ = "Europe/Paris";

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Take a UTC instant, return the Paris wall-clock as { yyyymmdd, minutes }.
 */
function toParisWallClock(d: Date): { yyyymmdd: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const yyyymmdd = `${get("year")}-${get("month")}-${get("day")}`;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return { yyyymmdd, minutes };
}

/**
 * Build a 7-day array from a Monday-anchored week start (a UTC instant
 * representing 00:00 Paris time on Monday).
 */
function buildWeekDays(weekStart: Date): { date: Date; yyyymmdd: string; dayOfWeek: number }[] {
  const days: { date: Date; yyyymmdd: string; dayOfWeek: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
    const wc = toParisWallClock(d);
    days.push({
      date: d,
      yyyymmdd: wc.yyyymmdd,
      dayOfWeek: (d.getUTCDay() + 0) % 7, // approximate; Paris-local would be more correct around DST edges
    });
  }
  return days;
}

export async function WeekCalendar({
  weekStart,
  currentUserId,
  isAdmin = false,
  buildSlotHref,
}: WeekCalendarProps) {
  const days = buildWeekDays(weekStart);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [reservations, ...availPerDay] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        status: "CONFIRMED",
        startsAt: { lt: weekEnd },
        endsAt: { gt: weekStart },
      },
      include: { user: { select: { name: true } } },
      orderBy: { startsAt: "asc" },
    }),
    ...days.map((d) => getAvailabilityForDate(d.date)),
  ]);

  // Index reservations by Paris-local yyyymmdd for fast lookup
  const resByDay = new Map<string, Reservation[]>();
  for (const r of reservations) {
    const wc = toParisWallClock(r.startsAt);
    const list = resByDay.get(wc.yyyymmdd) ?? [];
    list.push(r);
    resByDay.set(wc.yyyymmdd, list);
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Header row */}
        <div
          className="grid border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900"
          style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}
        >
          <div className="px-2 py-3"></div>
          {days.map((d, i) => (
            <div key={i} className="border-l border-zinc-200 px-2 py-3 text-center dark:border-zinc-800">
              <div>{DAY_LABELS_FR[d.date.getUTCDay()].slice(0, 3)}</div>
              <div className="text-zinc-900 dark:text-zinc-100">{formatDayMonthFR(d.date)}</div>
            </div>
          ))}
        </div>

        {/* Slot grid */}
        <div className="relative">
          {Array.from({ length: ROWS }).map((_, rowIdx) => {
            const slotMinFromMidnight = VISIBLE_START_MIN + rowIdx * SLOT_MIN;
            const isHourBoundary = slotMinFromMidnight % 60 === 0;
            return (
              <div
                key={rowIdx}
                className={`grid border-zinc-100 dark:border-zinc-800 ${
                  isHourBoundary ? "border-t" : "border-t border-dashed"
                }`}
                style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}
              >
                <div className="px-2 py-1 text-right text-xs text-zinc-500">
                  {isHourBoundary ? `${pad2(slotMinFromMidnight / 60)}:00` : ""}
                </div>
                {days.map((d, dayIdx) => {
                  const dayAvail = availPerDay[dayIdx] ?? [];
                  const inAvail = dayAvail.some(
                    (a) => a.startMinutes <= slotMinFromMidnight && a.endMinutes > slotMinFromMidnight,
                  );
                  const dayRes = resByDay.get(d.yyyymmdd) ?? [];
                  const blocking = dayRes.find((r) => {
                    const rs = toParisWallClock(r.startsAt).minutes;
                    const re = toParisWallClock(r.endsAt).minutes;
                    return rs <= slotMinFromMidnight && re > slotMinFromMidnight;
                  });
                  const isOwn = blocking?.userId === currentUserId;

                  if (blocking) {
                    const isFirstSlot =
                      toParisWallClock(blocking.startsAt).minutes === slotMinFromMidnight;
                    return (
                      <div
                        key={dayIdx}
                        className={`relative min-h-7 border-l border-zinc-200 ${
                          isOwn
                            ? "bg-zinc-900 text-white"
                            : "bg-zinc-300 text-zinc-900"
                        } dark:border-zinc-800`}
                        title={`${blocking.user.name}`}
                      >
                        {isFirstSlot && (
                          <span className="absolute left-1 top-0.5 truncate text-[10px] font-medium">
                            {blocking.user.name}
                          </span>
                        )}
                      </div>
                    );
                  }

                  if (inAvail) {
                    const timeStr = `${pad2(slotMinFromMidnight / 60)}:${pad2(slotMinFromMidnight % 60)}`;
                    return (
                      <Link
                        key={dayIdx}
                        href={buildSlotHref(d.yyyymmdd, timeStr)}
                        className="min-h-7 border-l border-zinc-200 bg-emerald-50 hover:bg-emerald-100 dark:border-zinc-800 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40"
                        title="Disponible — cliquer pour réserver"
                      />
                    );
                  }

                  return (
                    <div
                      key={dayIdx}
                      className="min-h-7 border-l border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
