// FlightSchedule — /calendar — "Mes réservations".
//
// V2 layout (top-to-bottom): upcoming reservations → new reservation form
// → week calendar grid. The form is always visible (not gated on a slot
// click) and posts a 4-field date+time start / date+time end window.
// Bookings have no HDV impact — they only block the slot.

import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateFR } from "@/lib/format";
// `fmtWeekRangeFR` builds the H1 "13/04/2026 – 19/04/2026" string from
// the Monday-anchored week start, using the canonical formatDateFR helper
// (locked to fr-FR + Europe/Paris). Defined inline below; do not inline
// any Intl.DateTimeFormat call elsewhere.
import { formatHHMM } from "@/lib/duration";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";
import { WeekCalendar } from "@/components/calendar/WeekCalendar";
import { createReservation, cancelReservationAction } from "./actions";

const TZ = "Europe/Paris";

/**
 * Compute the Monday-anchored start of the week containing a given UTC
 * instant, expressed as a UTC instant representing 00:00 Paris time.
 */
function startOfParisWeek(d: Date): Date {
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
  const DOW: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const diff = DOW[weekday] ?? 0;
  // Construct a UTC instant for Paris-local Monday 00:00 of this week.
  const ymd = `${get("year")}-${get("month")}-${get("day")}`;
  const monday = new Date(`${ymd}T00:00:00+02:00`); // CEST guess
  monday.setUTCDate(monday.getUTCDate() - diff);
  return monday;
}

function shiftWeek(weekStart: Date, weeks: number): Date {
  return new Date(weekStart.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
}

function fmtWeekStartParam(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // YYYY-MM-DD
}

function fmtWeekRangeFR(start: Date): string {
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return `${formatDateFR(start)} – ${formatDateFR(end)}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string;
    slot?: string;
    date?: string;
    error?: string;
    msg?: string;
    booked?: string;
    cancelled?: string;
  }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  // Resolve week
  const now = new Date();
  let weekStart: Date;
  if (sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week)) {
    weekStart = startOfParisWeek(new Date(`${sp.week}T12:00:00+02:00`));
  } else {
    weekStart = startOfParisWeek(now);
  }

  const prevWeek = fmtWeekStartParam(shiftWeek(weekStart, -1));
  const nextWeek = fmtWeekStartParam(shiftWeek(weekStart, 1));
  const thisWeek = fmtWeekStartParam(startOfParisWeek(now));

  // Pre-selected slot for the booking form (clicked from the grid)
  const slotMatch = sp.slot?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  const preselectDate = slotMatch?.[1] ?? sp.date ?? null;
  const preselectTime = slotMatch?.[2] ?? null;
  // Default the form to today and the next 3h block when nothing is preselected.
  // The calendar grid is 24h (00–24) but 09:00 is a sensible default starting hour.
  const todayParisDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const defaultDate = preselectDate ?? todayParisDate;
  const defaultStartTime = preselectTime ?? "09:00";
  // Default end = start + 3h. Wraps "21:00" → "00:00" — the server treats
  // a same-date 00:00 end as next-day midnight (24:00).
  const [dh, dm] = defaultStartTime.split(":").map(Number);
  const defaultEndH = (dh + 3) % 24;
  const defaultEndTime = `${defaultEndH.toString().padStart(2, "0")}:${dm.toString().padStart(2, "0")}`;

  // Pilot's confirmed upcoming reservations (for the cancellation list)
  const upcoming = await prisma.reservation.findMany({
    where: {
      userId: session.user.id,
      status: "CONFIRMED",
      startsAt: { gte: now },
    },
    orderBy: { startsAt: "asc" },
    take: 20,
  });

  const banner =
    sp.error === "overlap"
      ? { tone: "error" as const, msg: "Cette plage chevauche une réservation existante." }
      : sp.error === "window"
        ? { tone: "error" as const, msg: sp.msg ?? "Plage hors disponibilité." }
        : sp.error === "late_cancel"
          ? { tone: "error" as const, msg: "Annulation impossible à moins de 24 h." }
          : sp.error === "locked"
            ? { tone: "error" as const, msg: "Réservation verrouillée par un vol existant." }
            : sp.error === "auto_created"
              ? {
                  tone: "error" as const,
                  msg: "Cette réservation a été créée par un vol et ne peut pas être annulée.",
                }
              : sp.error === "invalid"
                ? { tone: "error" as const, msg: COPY.errors.invalidInput }
                : sp.booked === "1"
                  ? { tone: "success" as const, msg: "Réservation confirmée." }
                  : sp.cancelled === "1"
                    ? { tone: "success" as const, msg: "Réservation annulée." }
                    : null;

  const buildSlotHref = (date: string, time: string) =>
    `/calendar?week=${fmtWeekStartParam(weekStart)}&slot=${date}T${time}`;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-8">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            <CalendarRange className="h-4 w-4" aria-hidden="true" />
            {COPY.nav.calendar}
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            {COPY.nav.calendar}
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-text-muted">
            Bloquez le créneau dont vous avez besoin. Une réservation ne
            décompte aucune HDV — elle empêche simplement un autre pilote de
            poser le même créneau. Les heures sont décomptées à la saisie du
            vol, à partir des heures bloc OFF / bloc ON.
          </p>
        </header>

        {banner && (
          <div className="mb-6">
            <Alert tone={banner.tone}>{banner.msg}</Alert>
          </div>
        )}

        {/* 1. Upcoming reservations */}
        <section className="mb-12">
          <h2 className="font-display mb-4 text-2xl font-semibold tracking-tight text-text-strong">
            Mes réservations à venir
          </h2>
          {upcoming.length === 0 ? (
            <Card tone="sunken">
              <p className="text-sm text-text-muted">
                Aucune réservation à venir. Réservez un créneau ci-dessous.
              </p>
            </Card>
          ) : (
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {upcoming.map((r) => {
                const cutoff = new Date(
                  r.startsAt.getTime() - 24 * 60 * 60 * 1000,
                );
                const cancellable =
                  new Date() < cutoff && !r.autoCreatedFromFlight;
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div>
                      <p className="font-display text-base font-semibold text-text-strong">
                        {formatDateFR(r.startsAt)}
                      </p>
                      <p className="mt-0.5 text-sm tabular text-text-muted">
                        {new Intl.DateTimeFormat("fr-FR", {
                          timeZone: TZ,
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(r.startsAt)}
                        {" – "}
                        {new Intl.DateTimeFormat("fr-FR", {
                          timeZone: TZ,
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(r.endsAt)}
                        <span className="mx-2 text-text-subtle">·</span>
                        <span className="font-semibold text-text">
                          {formatHHMM(r.durationMin)}
                        </span>
                      </p>
                    </div>
                    {cancellable ? (
                      <form action={cancelReservationAction}>
                        <input type="hidden" name="reservationId" value={r.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Annuler
                        </Button>
                      </form>
                    ) : r.autoCreatedFromFlight ? (
                      <span className="text-xs italic text-text-subtle">
                        Réservation liée à un vol
                      </span>
                    ) : (
                      <span className="text-xs italic text-text-subtle">
                        Annulation fermée (moins de 24 h)
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 2. New reservation form — always visible */}
        <Card className="mb-12" tone="brand">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong">
            Nouvelle réservation
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Choisissez la date et l&apos;heure de début ainsi que de fin. Les
            créneaux sont alignés sur des blocs de 3 heures (durée minimum
            3 h, maximum 12 h).
          </p>
          <form
            action={createReservation}
            className="mt-6 grid gap-4 sm:grid-cols-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="startDate" required>
                Date de début
              </Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                defaultValue={defaultDate}
                required
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="startTime" required>
                Heure de début
              </Label>
              <Input
                id="startTime"
                name="startTime"
                type="time"
                step="10800"
                defaultValue={defaultStartTime}
                required
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endDate" required>
                Date de fin
              </Label>
              <Input
                id="endDate"
                name="endDate"
                type="date"
                defaultValue={defaultDate}
                required
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endTime" required>
                Heure de fin
              </Label>
              <Input
                id="endTime"
                name="endTime"
                type="time"
                step="10800"
                defaultValue={defaultEndTime}
                required
                className="tabular"
              />
            </div>
            <div className="sm:col-span-4">
              <Button type="submit" size="lg">
                Réserver
              </Button>
            </div>
          </form>
        </Card>

        {/* 3. Week calendar grid */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong">
            {fmtWeekRangeFR(weekStart)}
          </h2>
          <div className="flex items-center gap-2">
            <Link href={`/calendar?week=${prevWeek}`}>
              <Button variant="secondary" size="sm" aria-label="Semaine précédente">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Précédente</span>
              </Button>
            </Link>
            <Link href={`/calendar?week=${thisWeek}`}>
              <Button variant="secondary" size="sm">
                Aujourd&apos;hui
              </Button>
            </Link>
            <Link href={`/calendar?week=${nextWeek}`}>
              <Button variant="secondary" size="sm" aria-label="Semaine suivante">
                <span className="hidden sm:inline">Suivante</span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>

        <Card padded={false} className="overflow-hidden">
          <WeekCalendar
            weekStart={weekStart}
            currentUserId={session.user.id}
            buildSlotHref={buildSlotHref}
          />
        </Card>
      </div>
    </AppShell>
  );
}
