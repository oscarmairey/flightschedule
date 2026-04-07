// FlySchedule — /admin/calendar — admin calendar with cancel-anytime affordance.

import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateFR } from "@/lib/format";
import { formatHHMM } from "@/lib/duration";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";
import { WeekCalendar } from "@/components/calendar/WeekCalendar";
import { adminCancelReservation } from "@/app/calendar/actions";

const TZ = "Europe/Paris";

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
  const ymd = `${get("year")}-${get("month")}-${get("day")}`;
  const monday = new Date(`${ymd}T00:00:00+02:00`);
  monday.setUTCDate(monday.getUTCDate() - diff);
  return monday;
}

function shiftWeek(weekStart: Date, weeks: number): Date {
  return new Date(weekStart.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
}

function fmtWeekStartParam(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function fmtWeekRangeFR(start: Date): string {
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    timeZone: TZ,
    day: "numeric",
    month: "long",
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; cancelled?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;

  const now = new Date();
  const weekStart = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week)
    ? startOfParisWeek(new Date(`${sp.week}T12:00:00+02:00`))
    : startOfParisWeek(now);

  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const reservations = await prisma.reservation.findMany({
    where: {
      status: "CONFIRMED",
      startsAt: { lt: weekEnd },
      endsAt: { gt: weekStart },
    },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { startsAt: "asc" },
  });

  const banner =
    sp.cancelled === "1"
      ? { tone: "success" as const, msg: "Réservation annulée." }
      : sp.error === "locked"
        ? {
            tone: "error" as const,
            msg: "Réservation verrouillée par un vol existant.",
          }
        : null;

  const buildSlotHref = () => "#"; // admin calendar is read-only on the grid

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
              <CalendarRange className="h-4 w-4" aria-hidden="true" />
              {COPY.nav.adminCalendar}
            </p>
            <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
              {fmtWeekRangeFR(weekStart)}
            </h1>
            <p className="mt-2 text-sm text-text-muted">
              Vue admin — annulation possible à tout moment.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/calendar?week=${fmtWeekStartParam(shiftWeek(weekStart, -1))}`}
            >
              <Button variant="secondary" size="sm" aria-label="Semaine précédente">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Précédente</span>
              </Button>
            </Link>
            <Link
              href={`/admin/calendar?week=${fmtWeekStartParam(startOfParisWeek(now))}`}
            >
              <Button variant="secondary" size="sm">
                Aujourd&apos;hui
              </Button>
            </Link>
            <Link
              href={`/admin/calendar?week=${fmtWeekStartParam(shiftWeek(weekStart, 1))}`}
            >
              <Button variant="secondary" size="sm" aria-label="Semaine suivante">
                <span className="hidden sm:inline">Suivante</span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </header>

        {banner && (
          <div className="mb-6">
            <Alert tone={banner.tone}>{banner.msg}</Alert>
          </div>
        )}

        <Card padded={false} className="overflow-hidden">
          <WeekCalendar
            weekStart={weekStart}
            currentUserId={admin.user.id}
            isAdmin
            buildSlotHref={buildSlotHref}
          />
        </Card>

        <section className="mt-12">
          <h2 className="font-display mb-4 text-2xl font-semibold tracking-tight text-text-strong">
            Réservations de la semaine
          </h2>
          {reservations.length === 0 ? (
            <Card tone="sunken">
              <p className="text-sm text-text-muted">
                Aucune réservation cette semaine.
              </p>
            </Card>
          ) : (
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {reservations.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div>
                    <p className="font-display text-base font-semibold text-text-strong">
                      {r.user.name}
                      <span className="mx-2 text-text-subtle">·</span>
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
                  <form action={adminCancelReservation}>
                    <input type="hidden" name="reservationId" value={r.id} />
                    <Button type="submit" variant="danger" size="sm">
                      Annuler
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
