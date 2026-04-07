// CAVOK — /calendar — pilot weekly calendar with booking.

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateFR } from "@/lib/format";
import { formatHHMM, balanceTier } from "@/lib/duration";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
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

  // Pre-selected slot for booking dialog
  const slotMatch = sp.slot?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  const preselectDate = slotMatch?.[1] ?? sp.date ?? null;
  const preselectTime = slotMatch?.[2] ?? null;

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

  const balance = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { hdvBalanceMin: true },
  });
  const balanceMin = balance?.hdvBalanceMin ?? 0;

  const banner =
    sp.error === "overlap"
      ? { tone: "error" as const, msg: "Cette plage chevauche une réservation existante." }
      : sp.error === "balance"
        ? { tone: "error" as const, msg: COPY.errors.insufficientBalance }
        : sp.error === "window"
          ? { tone: "error" as const, msg: sp.msg ?? "Plage hors disponibilité." }
          : sp.error === "late_cancel"
            ? { tone: "error" as const, msg: "Annulation impossible à moins de 24 h." }
            : sp.error === "locked"
              ? { tone: "error" as const, msg: "Réservation verrouillée par un vol existant." }
              : sp.booked === "1"
                ? { tone: "success" as const, msg: "Réservation confirmée." }
                : sp.cancelled === "1"
                  ? { tone: "success" as const, msg: "Réservation annulée et HDV remboursés." }
                  : null;

  const buildSlotHref = (date: string, time: string) =>
    `/calendar?week=${fmtWeekStartParam(weekStart)}&slot=${date}T${time}`;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{COPY.nav.calendar}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Solde actuel :{" "}
              <Badge tier={balanceTier(balanceMin)}>{formatHHMM(balanceMin)}</Badge>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/calendar?week=${prevWeek}`}>
              <Button variant="secondary" size="sm">← Sem. préc.</Button>
            </Link>
            <Link href={`/calendar?week=${thisWeek}`}>
              <Button variant="secondary" size="sm">Cette semaine</Button>
            </Link>
            <Link href={`/calendar?week=${nextWeek}`}>
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
            currentUserId={session.user.id}
            buildSlotHref={buildSlotHref}
          />
        </Card>

        {/* Booking form (revealed when a slot is selected) */}
        {preselectDate && preselectTime && (
          <Card>
            <h2 className="mb-4 text-xl font-semibold">Nouvelle réservation</h2>
            <form action={createReservation} className="grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="date" value={preselectDate} />
              <div className="space-y-1">
                <Label>Date</Label>
                <p className="px-1 py-2 text-sm">{preselectDate}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="startStr" required>Heure de début</Label>
                <Input
                  id="startStr"
                  name="startStr"
                  type="time"
                  step="1800"
                  defaultValue={preselectTime}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="durationMin" required>Durée</Label>
                <select
                  id="durationMin"
                  name="durationMin"
                  required
                  className="block w-full min-h-11 rounded-md border border-zinc-300 px-3 py-2 text-base shadow-sm focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {Array.from({ length: 16 }).map((_, i) => {
                    const m = (i + 1) * 30;
                    const h = Math.floor(m / 60);
                    const mm = m % 60;
                    const label = `${h}h${mm.toString().padStart(2, "0")}`;
                    return (
                      <option key={m} value={m}>{label}</option>
                    );
                  })}
                </select>
              </div>
              <div className="flex items-end">
                <Button type="submit" fullWidth>Réserver</Button>
              </div>
            </form>
            <p className="mt-3 text-xs text-zinc-500">
              Le solde HDV sera débité immédiatement à la confirmation. Les annulations
              à moins de 24 h ne sont pas autorisées sans intervention de l'administrateur.
            </p>
          </Card>
        )}

        {/* My upcoming reservations */}
        <Card>
          <h2 className="mb-4 text-xl font-semibold">Mes réservations à venir</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucune réservation à venir.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {upcoming.map((r) => {
                const cutoff = new Date(r.startsAt.getTime() - 24 * 60 * 60 * 1000);
                const cancellable = new Date() < cutoff;
                return (
                  <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <div className="font-medium">{formatDateFR(r.startsAt)}</div>
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
                    {cancellable ? (
                      <form action={cancelReservationAction}>
                        <input type="hidden" name="reservationId" value={r.id} />
                        <Button type="submit" variant="ghost" size="sm">Annuler</Button>
                      </form>
                    ) : (
                      <span className="text-xs text-zinc-500">— 24 h écoulées</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
