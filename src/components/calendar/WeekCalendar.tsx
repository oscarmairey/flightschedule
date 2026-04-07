// FlySchedule — weekly calendar grid.
//
// Server component. Renders a Mon→Sun week with time-of-day rows on the
// left axis. Availability windows are tinted in success-soft (sun on
// grass), reservations render as colored blocks on top — sky blue for
// own bookings, warm slate for others.
//
// Design constraints (PRD §3.2.2 + §7.2 + .impeccable.md):
//   - Mobile-first: on small screens, scrolls horizontally with snap
//     so the whole week is reachable from a phone.
//   - 30-minute slot granularity (matches RESERVATION_LIMITS).
//   - 06:00–22:00 visible band (32 rows). Each row is ≥44px tall to
//     give pilots a fat-finger target on a phone in sunlight.
//   - Own reservations highlighted in brand sky blue; others in stone.
//   - Bookable slots are clickable links to /calendar?slot=...
//   - Every interactive cell has an explicit aria-label so screen
//     readers (and the title tooltip) describe the slot.
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
function buildWeekDays(weekStart: Date): {
  date: Date;
  yyyymmdd: string;
  dayOfWeek: number;
}[] {
  const days: { date: Date; yyyymmdd: string; dayOfWeek: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
    const wc = toParisWallClock(d);
    days.push({
      date: d,
      yyyymmdd: wc.yyyymmdd,
      dayOfWeek: (d.getUTCDay() + 0) % 7,
    });
  }
  return days;
}

function fmtTimeLabel(min: number): string {
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
}

export async function WeekCalendar({
  weekStart,
  currentUserId,
  isAdmin: _isAdmin = false,
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

  // Index reservations by Paris-local yyyymmdd
  const resByDay = new Map<string, Reservation[]>();
  for (const r of reservations) {
    const wc = toParisWallClock(r.startsAt);
    const list = resByDay.get(wc.yyyymmdd) ?? [];
    list.push(r);
    resByDay.set(wc.yyyymmdd, list);
  }

  // Determine "today" in Paris for highlighting the current column
  const todayWC = toParisWallClock(new Date());

  return (
    <div className="overflow-x-auto" aria-label="Calendrier de la semaine">
      <div className="min-w-[760px]">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border-subtle bg-surface-soft px-4 py-3 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-sm border border-success-soft-border bg-success-soft"
            />
            Disponible
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-sm bg-brand"
            />
            Vos réservations
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-sm bg-text-muted/40"
            />
            Réservé par un autre pilote
          </span>
        </div>

        {/* Header row */}
        <div
          className="grid border-b border-border bg-surface-soft text-xs font-medium uppercase tracking-[0.08em] text-text-subtle"
          style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}
        >
          <div className="px-2 py-3" aria-hidden="true" />
          {days.map((d, i) => {
            const isToday = d.yyyymmdd === todayWC.yyyymmdd;
            return (
              <div
                key={i}
                className={`border-l border-border-subtle px-2 py-3 text-center ${
                  isToday ? "bg-brand-soft" : ""
                }`}
              >
                <div
                  className={isToday ? "text-brand-soft-fg" : "text-text-subtle"}
                >
                  {DAY_LABELS_FR[d.date.getUTCDay()].slice(0, 3)}
                </div>
                <div
                  className={`font-display text-base font-semibold normal-case tracking-tight tabular ${
                    isToday ? "text-brand" : "text-text-strong"
                  }`}
                >
                  {formatDayMonthFR(d.date)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Slot grid */}
        <div className="relative bg-surface-elevated">
          {Array.from({ length: ROWS }).map((_, rowIdx) => {
            const slotMin = VISIBLE_START_MIN + rowIdx * SLOT_MIN;
            const isHourBoundary = slotMin % 60 === 0;
            return (
              <div
                key={rowIdx}
                className={`grid ${
                  isHourBoundary
                    ? "border-t border-border-subtle"
                    : "border-t border-dashed border-border-subtle/60"
                }`}
                style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}
              >
                <div className="flex min-h-11 items-start justify-end px-2 pt-1 text-xs tabular text-text-subtle">
                  {isHourBoundary ? `${pad2(slotMin / 60)}h` : ""}
                </div>
                {days.map((d, dayIdx) => {
                  const dayAvail = availPerDay[dayIdx] ?? [];
                  const inAvail = dayAvail.some(
                    (a) =>
                      a.startMinutes <= slotMin && a.endMinutes > slotMin,
                  );
                  const dayRes = resByDay.get(d.yyyymmdd) ?? [];
                  const blocking = dayRes.find((r) => {
                    const rs = toParisWallClock(r.startsAt).minutes;
                    const re = toParisWallClock(r.endsAt).minutes;
                    return rs <= slotMin && re > slotMin;
                  });
                  const isOwn = blocking?.userId === currentUserId;
                  const isToday = d.yyyymmdd === todayWC.yyyymmdd;

                  if (blocking) {
                    const bs = toParisWallClock(blocking.startsAt).minutes;
                    const be = toParisWallClock(blocking.endsAt).minutes;
                    const isFirstSlot = bs === slotMin;
                    const isLastSlot = be - SLOT_MIN === slotMin;
                    return (
                      <div
                        key={dayIdx}
                        role="img"
                        aria-label={`Réservé par ${blocking.user.name}, ${fmtTimeLabel(bs)} à ${fmtTimeLabel(be)}`}
                        title={`${blocking.user.name} · ${fmtTimeLabel(bs)}–${fmtTimeLabel(be)}`}
                        className={`relative min-h-11 border-l border-border-subtle ${
                          isOwn
                            ? "bg-brand text-text-on-brand"
                            : "bg-text-muted/30 text-text"
                        } ${isFirstSlot ? "rounded-t-md" : ""} ${
                          isLastSlot ? "rounded-b-md" : ""
                        }`}
                      >
                        {isFirstSlot && (
                          <div className="absolute inset-x-1.5 top-1 space-y-0.5">
                            <p className="truncate text-[0.7rem] font-semibold leading-tight">
                              {blocking.user.name}
                            </p>
                            <p className="truncate text-[0.65rem] tabular leading-tight opacity-80">
                              {fmtTimeLabel(bs)}–{fmtTimeLabel(be)}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (inAvail) {
                    const timeStr = fmtTimeLabel(slotMin);
                    return (
                      <Link
                        key={dayIdx}
                        href={buildSlotHref(d.yyyymmdd, timeStr)}
                        aria-label={`Réserver le ${formatDayMonthFR(d.date)} à ${timeStr}`}
                        title={`Disponible — réserver à ${timeStr}`}
                        className={`min-h-11 border-l border-border-subtle bg-success-soft/50 transition-colors hover:bg-success-soft ${
                          isToday ? "ring-1 ring-inset ring-brand-soft-border/30" : ""
                        }`}
                      />
                    );
                  }

                  return (
                    <div
                      key={dayIdx}
                      aria-hidden="true"
                      className="min-h-11 border-l border-border-subtle bg-surface-sunken/40"
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
