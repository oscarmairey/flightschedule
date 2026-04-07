// CAVOK — /admin/calendar — admin calendar with cancel-anytime affordance.

import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateFR } from "@/lib/format";
import { formatHHMM } from "@/lib/duration";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
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
        ? { tone: "error" as const, msg: "Réservation verrouillée par un vol existant." }
        : null;

  const buildSlotHref = () => "#"; // admin calendar is read-only on the grid

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{COPY.nav.adminCalendar}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Vue admin — annulation possible à tout moment.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/admin/calendar?week=${fmtWeekStartParam(shiftWeek(weekStart, -1))}`}>
              <Button variant="secondary" size="sm">← Sem. préc.</Button>
            </Link>
            <Link href={`/admin/calendar?week=${fmtWeekStartParam(startOfParisWeek(now))}`}>
              <Button variant="secondary" size="sm">Cette semaine</Button>
            </Link>
            <Link href={`/admin/calendar?week=${fmtWeekStartParam(shiftWeek(weekStart, 1))}`}>
              <Button variant="secondary" size="sm">Sem. suiv. →</Button>
            </Link>
          </div>
        </header>

        {banner && (
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              banner.tone === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-red-300 bg-red-50 text-red-900"
            }`}
            role="alert"
          >
            {banner.msg}
          </div>
        )}

        <Card className="overflow-hidden p-0">
          <WeekCalendar
            weekStart={weekStart}
            currentUserId={admin.user.id}
            isAdmin
            buildSlotHref={buildSlotHref}
          />
        </Card>

        <Card>
          <h2 className="mb-4 text-xl font-semibold">Réservations de la semaine</h2>
          {reservations.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucune réservation cette semaine.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {reservations.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <div className="font-medium">
                      {r.user.name} · {formatDateFR(r.startsAt)}
                    </div>
                    <div className="text-zinc-500">
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
                      {" · "}
                      {formatHHMM(r.durationMin)}
                    </div>
                  </div>
                  <form action={adminCancelReservation}>
                    <input type="hidden" name="reservationId" value={r.id} />
                    <Button type="submit" variant="danger" size="sm">Annuler</Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
