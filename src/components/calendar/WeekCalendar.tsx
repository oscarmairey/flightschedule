// FlightSchedule — weekly calendar grid.
//
// Server component. Renders a Mon→Sun week with time-of-day rows on the
// left axis. V2: the aircraft is available 24/7 by default, so cells are
// rendered "open" by default. Cells inside an unavailability exception
// get a red overlay. Reservations render as colored blocks on top — sky
// blue for own bookings, warm slate for others.
//
// Design constraints:
//   - Mobile-first: on small screens, scrolls horizontally with snap
//     so the whole week is reachable from a phone.
//   - 3-hour slot granularity (matches RESERVATION_LIMITS — V2 inversion).
//   - 00:00–24:00 visible band (8 rows of 3 hours: 00–03, 03–06, 06–09,
//     09–12, 12–15, 15–18, 18–21, 21–24). Each row is ≥44px tall.
//   - Own reservations highlighted in brand sky blue; others in stone.
//   - Bookable slots are clickable links to /calendar?slot=...
//   - Every interactive cell has an explicit aria-label so screen
//     readers (and the title tooltip) describe the slot.
//
// This is a server component — clicking a slot navigates to a query
// param that the page reads to pre-fill the booking form. No client JS
// needed for the calendar grid itself.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { getUnavailabilityForDate } from "@/lib/availability";
import {
  formatDayMonthShortFR,
  formatDateFR,
  DAY_LABELS_FR,
} from "@/lib/format";

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

const VISIBLE_START_MIN = 0; // 00:00
const VISIBLE_END_MIN = 24 * 60; // 24:00
const SLOT_MIN = 180; // 3-hour blocks
const ROWS = (VISIBLE_END_MIN - VISIBLE_START_MIN) / SLOT_MIN; // 8

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

  const [reservations, ...unavailPerDay] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        status: "CONFIRMED",
        startsAt: { lt: weekEnd },
        endsAt: { gt: weekStart },
      },
      include: { user: { select: { name: true } } },
      orderBy: { startsAt: "asc" },
    }),
    ...days.map((d) => getUnavailabilityForDate(d.date)),
  ]);

  // Build per-day segments. A multi-day reservation appears once on each
  // Paris-local day it touches, with `dayStartMin/dayEndMin` clamped to
  // 0..1440 within that day. `isSegmentStart` flags the first segment
  // (where the title is rendered).
  type Segment = {
    r: Reservation;
    dayStartMin: number;
    dayEndMin: number;
    isSegmentStart: boolean;
    overallStartMin: number; // for tooltip — local minutes on this segment's day
    overallEndMin: number;
    overallStartLabel: string;
    overallEndLabel: string;
  };
  const resByDay = new Map<string, Segment[]>();
  for (const r of reservations) {
    const startWC = toParisWallClock(r.startsAt);
    // Subtract 1ms from end so a midnight-end reservation only paints the
    // start day (matches isWithinAvailability's convention).
    const endWC = toParisWallClock(new Date(r.endsAt.getTime() - 1));
    const overallStartLabel = fmtTimeLabel(startWC.minutes);
    const rawEndMinutes = toParisWallClock(r.endsAt).minutes;
    const overallEndLabel = fmtTimeLabel(rawEndMinutes === 0 ? 1440 : rawEndMinutes);

    let cursorYmd = startWC.yyyymmdd;
    let isFirst = true;
    while (true) {
      const isStartDay = cursorYmd === startWC.yyyymmdd;
      const isEndDay = cursorYmd === endWC.yyyymmdd;
      const dayStartMin = isStartDay ? startWC.minutes : 0;
      let dayEndMin: number;
      if (isEndDay) {
        const rawEnd = toParisWallClock(r.endsAt).minutes;
        dayEndMin = rawEnd === 0 || !isStartDay ? (rawEnd === 0 ? 1440 : rawEnd) : rawEnd;
        if (rawEnd === 0) dayEndMin = 1440;
      } else {
        dayEndMin = 1440;
      }

      const list = resByDay.get(cursorYmd) ?? [];
      list.push({
        r,
        dayStartMin,
        dayEndMin,
        isSegmentStart: isFirst,
        overallStartMin: dayStartMin,
        overallEndMin: dayEndMin,
        overallStartLabel,
        overallEndLabel,
      });
      resByDay.set(cursorYmd, list);

      if (isEndDay) break;
      // Advance one Paris-local day (noon to dodge DST edges).
      const next = new Date(`${cursorYmd}T12:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      cursorYmd = next.toISOString().slice(0, 10);
      isFirst = false;
    }
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
              className="inline-block h-3 w-3 rounded-sm border border-border-subtle bg-surface-elevated"
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
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-sm border border-danger-soft-border bg-danger-soft"
            />
            Indisponible
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
                  {DAY_LABELS_FR[new Date(`${d.yyyymmdd}T12:00:00Z`).getUTCDay()].slice(0, 3)}
                </div>
                <div
                  className={`font-display text-base font-semibold normal-case tracking-tight tabular ${
                    isToday ? "text-brand" : "text-text-strong"
                  }`}
                >
                  {formatDayMonthShortFR(d.date)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Slot grid — 5 rows of 3 hours each */}
        <div className="relative bg-surface-elevated">
          {Array.from({ length: ROWS }).map((_, rowIdx) => {
            const slotMin = VISIBLE_START_MIN + rowIdx * SLOT_MIN;
            const slotEndMin = slotMin + SLOT_MIN;
            return (
              <div
                key={rowIdx}
                className="grid border-t border-border-subtle"
                style={{ gridTemplateColumns: "64px repeat(7, 1fr)" }}
              >
                <div className="flex min-h-32 items-start justify-end px-2 pt-2 text-xs tabular text-text-subtle">
                  {`${pad2(slotMin / 60)}h`}
                </div>
                {days.map((d, dayIdx) => {
                  const dayUnavail = unavailPerDay[dayIdx] ?? [];
                  const unavailHit = dayUnavail.find(
                    (a) => a.startMinutes < slotEndMin && a.endMinutes > slotMin,
                  );
                  const daySegments = resByDay.get(d.yyyymmdd) ?? [];
                  const segment = daySegments.find(
                    (s) => s.dayStartMin < slotEndMin && s.dayEndMin > slotMin,
                  );
                  const isOwn = segment?.r.userId === currentUserId;
                  const isToday = d.yyyymmdd === todayWC.yyyymmdd;

                  if (segment) {
                    const bs = segment.dayStartMin;
                    const be = segment.dayEndMin;
                    const isFirstSlot = bs >= slotMin && bs < slotEndMin;
                    const isLastSlot = be > slotMin && be <= slotEndMin;
                    return (
                      <div
                        key={dayIdx}
                        role="img"
                        aria-label={`Réservé par ${segment.r.user.name}, ${segment.overallStartLabel} à ${segment.overallEndLabel}`}
                        title={`${segment.r.user.name} · ${segment.overallStartLabel}–${segment.overallEndLabel}`}
                        className={`relative min-h-32 border-l border-border-subtle ${
                          isOwn
                            ? "bg-brand text-text-on-brand"
                            : "bg-text-muted/30 text-text"
                        } ${isFirstSlot ? "rounded-t-md" : ""} ${
                          isLastSlot ? "rounded-b-md" : ""
                        }`}
                      >
                        {isFirstSlot && segment.isSegmentStart && (
                          <div className="absolute inset-x-1.5 top-1.5 space-y-0.5">
                            <p className="truncate text-xs font-semibold leading-tight">
                              {segment.r.user.name}
                            </p>
                            <p className="truncate text-[0.7rem] tabular leading-tight opacity-80">
                              {segment.overallStartLabel}–{segment.overallEndLabel}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (unavailHit) {
                    return (
                      <div
                        key={dayIdx}
                        role="img"
                        aria-label={`Indisponible${unavailHit.reason ? ` — ${unavailHit.reason}` : ""}`}
                        title={
                          unavailHit.reason
                            ? `Indisponible — ${unavailHit.reason}`
                            : "Indisponible"
                        }
                        className="min-h-32 border-l border-border-subtle bg-danger-soft/60"
                      />
                    );
                  }

                  const timeStr = fmtTimeLabel(slotMin);
                  return (
                    <Link
                      key={dayIdx}
                      href={buildSlotHref(d.yyyymmdd, timeStr)}
                      aria-label={`Réserver le ${formatDateFR(d.date)} à ${timeStr}`}
                      title={`Disponible — réserver à ${timeStr}`}
                      className={`min-h-32 border-l border-border-subtle transition-colors hover:bg-surface-sunken/40 ${
                        isToday
                          ? "ring-1 ring-inset ring-brand-soft-border/30"
                          : ""
                      }`}
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
