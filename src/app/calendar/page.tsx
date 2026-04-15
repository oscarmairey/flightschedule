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
import {
  formatDateFR,
  formatDateTimeFR,
  parisLocalDateString,
  startOfParisWeek,
  shiftParisWeek,
  parisWeekParam,
  formatParisWeekRange,
  parseWeekParam,
} from "@/lib/format";
import { formatHHMM } from "@/lib/duration";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";
import { WeekCalendar } from "@/components/calendar/WeekCalendar";
import { CancelReservationButton } from "@/components/calendar/CancelReservationButton";
import { TimeBlockPicker, type TimeBlock } from "@/components/calendar/TimeBlockPicker";
import { resolveBanner } from "@/lib/banners";
import { createReservation } from "./actions";

const TZ = "Europe/Paris";

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
  const weekStart = parseWeekParam(sp.week) ?? startOfParisWeek(now);

  const prevWeek = parisWeekParam(shiftParisWeek(weekStart, -1));
  const nextWeek = parisWeekParam(shiftParisWeek(weekStart, 1));
  const thisWeek = parisWeekParam(startOfParisWeek(now));

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
  const defaultStartTime = (preselectTime ?? "09:00") as TimeBlock;
  // Default end = start + 3h. "21:00" + 3 = "24:00" (midnight end-of-day).
  const [dh] = defaultStartTime.split(":").map(Number);
  const defaultEndTime: TimeBlock = (dh + 3 >= 24
    ? "24:00"
    : `${(dh + 3).toString().padStart(2, "0")}:00`) as TimeBlock;

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

  const banner = resolveBanner(sp, {
    "error:overlap": {
      tone: "error",
      msg: "Cette plage chevauche une réservation existante.",
    },
    "error:past": {
      tone: "error",
      msg: "Impossible de réserver dans le passé.",
    },
    "error:window": {
      tone: "error",
      msg: (sp) => sp.msg ?? "Plage hors disponibilité.",
    },
    "error:negative_balance": {
      tone: "error",
      msg: "Rechargez votre compte pour pouvoir réserver.",
    },
    "error:late_cancel": {
      tone: "error",
      msg: "Annulation impossible à moins de 24 h.",
    },
    "error:locked": {
      tone: "error",
      msg: "Réservation verrouillée par un vol existant.",
    },
    "error:auto_created": {
      tone: "error",
      msg: "Cette réservation a été créée par un vol et ne peut pas être annulée.",
    },
    "error:invalid": { tone: "error", msg: COPY.errors.invalidInput },
    booked: { tone: "success", msg: "Réservation confirmée." },
    cancelled: { tone: "success", msg: "Réservation annulée." },
  });

  const buildSlotHref = (date: string, time: string) =>
    `/calendar?week=${parisWeekParam(weekStart)}&slot=${date}T${time}`;

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

        {/* 1. Upcoming reservations — hidden when empty */}
        {upcoming.length > 0 && (
          <section className="mb-12">
            <h2 className="font-display mb-4 text-2xl font-semibold tracking-tight text-text-strong">
              Mes réservations à venir
            </h2>
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {upcoming.map((r) => {
                const cutoff = new Date(
                  r.startsAt.getTime() - 24 * 60 * 60 * 1000,
                );
                const cancellable =
                  new Date() < cutoff && !r.autoCreatedFromFlight;

                // Multi-day = spans more than 24h OR crosses a Paris-local
                // calendar date boundary. In both cases we show "Du … au …"
                // and count the calendar days the reservation touches
                // rather than raw hours — "2 jours" reads better than "48h".
                const startYmd = parisLocalDateString(r.startsAt);
                const endYmd = parisLocalDateString(r.endsAt);
                const isMultiDay =
                  startYmd !== endYmd || r.durationMin > 24 * 60;
                const nbDays =
                  Math.round(
                    (new Date(endYmd).getTime() -
                      new Date(startYmd).getTime()) /
                      (24 * 60 * 60 * 1000),
                  ) + 1;
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div>
                      <p className="font-display text-base font-semibold text-text-strong">
                        {isMultiDay
                          ? `Du ${formatDateFR(r.startsAt)} au ${formatDateFR(r.endsAt)}`
                          : formatDateFR(r.startsAt)}
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
                          {isMultiDay
                            ? `${nbDays} ${nbDays > 1 ? "jours" : "jour"}`
                            : formatHHMM(r.durationMin)}
                        </span>
                      </p>
                    </div>
                    {cancellable ? (
                      <CancelReservationButton
                        reservationId={r.id}
                        startsAtLabel={formatDateTimeFR(r.startsAt)}
                      />
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
          </section>
        )}

        {/* 2. New reservation form — always visible */}
        <Card className="mb-12" tone="brand">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong">
            Nouvelle réservation
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Choisissez la date et l&apos;heure de début ainsi que de fin. Les
            créneaux sont alignés sur des blocs de 3 heures (durée minimum
            3 h).
          </p>
          <form
            action={createReservation}
            className="mt-6 grid gap-6 sm:grid-cols-2"
          >
            <div key={`start-col-${defaultDate}-${defaultStartTime}`} className="space-y-3">
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
              <Label required>Heure de début</Label>
              <TimeBlockPicker
                name="startTime"
                defaultValue={defaultStartTime}
                ariaLabel="Heure de début"
              />
            </div>
            <div key={`end-col-${defaultDate}-${defaultEndTime}`} className="space-y-3">
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
              <Label required>Heure de fin</Label>
              <TimeBlockPicker
                name="endTime"
                defaultValue={defaultEndTime}
                ariaLabel="Heure de fin"
              />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton size="lg" pendingLabel="Réservation…">
                Réserver
              </SubmitButton>
            </div>
          </form>
        </Card>

        {/* 3. Week calendar grid */}
        <div id="calendrier" className="mb-4 flex flex-wrap items-end justify-between gap-3 scroll-mt-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong">
            {formatParisWeekRange(weekStart)}
          </h2>
          <div className="flex items-center gap-2">
            <Link href={`/calendar?week=${prevWeek}`} scroll={false}>
              <Button variant="secondary" size="sm" aria-label="Semaine précédente">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Précédente</span>
              </Button>
            </Link>
            <Link href={`/calendar?week=${thisWeek}`} scroll={false}>
              <Button variant="secondary" size="sm">
                Aujourd&apos;hui
              </Button>
            </Link>
            <Link href={`/calendar?week=${nextWeek}`} scroll={false}>
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
