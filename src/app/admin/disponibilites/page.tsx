// FlightSchedule — /admin/disponibilites — merged calendar view + unavailability
// exception management. V2: replaces /admin/calendar and /admin/availability.
//
// Layout (top-to-bottom, two stacked sections — NOT an interactive overlay):
//   1. WeekCalendar grid showing all reservations + red overlay on
//      unavailability windows. Admin can cancel any reservation from the
//      list below the grid (anytime, no 24h rule).
//   2. Indisponibilités management:
//      - Recurring exceptions (one form + list per day of week)
//      - Per-date exceptions (date + time + optional reason)

import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  CalendarClock,
  Trash2,
} from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { DAY_LABELS_FR, formatDateFR } from "@/lib/format";
import { formatHHMM } from "@/lib/duration";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";
import { WeekCalendar } from "@/components/calendar/WeekCalendar";
import { adminCancelReservation } from "@/app/calendar/actions";
import {
  createRecurringException,
  createOverrideException,
  deleteException,
  createOpenPeriod,
  deleteOpenPeriod,
} from "./actions";

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
  const DOW: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
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
  return `${formatDateFR(start)} – ${formatDateFR(end)}`;
}

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

export default async function AdminDisponibilitesPage({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string;
    error?: string;
    cancelled?: string;
    created?: string;
    deleted?: string;
    count?: string;
    date?: string;
  }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;

  const now = new Date();
  const weekStart =
    sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week)
      ? startOfParisWeek(new Date(`${sp.week}T12:00:00+02:00`))
      : startOfParisWeek(now);

  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [reservations, recurring, overrides, openPeriods] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        status: "CONFIRMED",
        startsAt: { lt: weekEnd },
        endsAt: { gt: weekStart },
      },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.availabilityBlock.findMany({
      where: { dayOfWeek: { not: null } },
      orderBy: [{ dayOfWeek: "asc" }, { startMinutes: "asc" }],
    }),
    prisma.availabilityBlock.findMany({
      where: { specificDate: { not: null } },
      orderBy: [{ specificDate: "asc" }, { startMinutes: "asc" }],
    }),
    prisma.openPeriod.findMany({
      orderBy: { startDate: "asc" },
    }),
  ]);

  const banner =
    sp.cancelled === "1"
      ? { tone: "success" as const, msg: "Réservation annulée." }
      : sp.created === "1"
        ? { tone: "success" as const, msg: "Indisponibilité créée." }
        : sp.deleted === "1"
          ? { tone: "success" as const, msg: "Indisponibilité supprimée." }
          : sp.error === "locked"
            ? {
                tone: "error" as const,
                msg: "Réservation verrouillée par un vol existant.",
              }
            : sp.error === "auto_created"
              ? {
                  tone: "error" as const,
                  msg: "Cette réservation a été créée automatiquement par un vol et ne peut pas être annulée.",
                }
              : sp.error === "conflicts"
                ? {
                    tone: "error" as const,
                    msg: `${sp.count ?? "?"} réservation(s) confirmée(s) en conflit${sp.date ? ` le ${sp.date}` : ""}. Annulez-les d'abord.`,
                  }
                : sp.error === "bad_range"
                  ? { tone: "error" as const, msg: "Plage horaire invalide." }
                  : sp.error === "invalid"
                    ? { tone: "error" as const, msg: COPY.errors.invalidInput }
                    : null;

  const buildSlotHref = () => "#"; // grid is read-only on the admin page

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-8">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            {COPY.nav.adminDisponibilites}
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            Disponibilités de l'appareil
          </h1>
          <p className="mt-3 max-w-2xl text-base text-text-muted">
            Définissez d&apos;abord les <strong>périodes d&apos;ouverture</strong>{" "}
            (saisons pendant lesquelles l&apos;avion est réservable), puis les
            <strong> indisponibilités</strong> à l&apos;intérieur de ces périodes
            (récurrentes ou ponctuelles). Sans aucune période d&apos;ouverture
            définie, l&apos;avion est considéré ouvert toute l&apos;année.
          </p>
        </header>

        {banner && (
          <div className="mb-6">
            <Alert tone={banner.tone}>{banner.msg}</Alert>
          </div>
        )}

        {/* 1. Week calendar grid */}
        <section className="mb-12">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong">
              <CalendarRange className="mr-2 inline h-5 w-5" aria-hidden="true" />
              {fmtWeekRangeFR(weekStart)}
            </h2>
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/disponibilites?week=${fmtWeekStartParam(shiftWeek(weekStart, -1))}`}
              >
                <Button variant="secondary" size="sm" aria-label="Semaine précédente">
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Précédente</span>
                </Button>
              </Link>
              <Link
                href={`/admin/disponibilites?week=${fmtWeekStartParam(startOfParisWeek(now))}`}
              >
                <Button variant="secondary" size="sm">
                  Aujourd&apos;hui
                </Button>
              </Link>
              <Link
                href={`/admin/disponibilites?week=${fmtWeekStartParam(shiftWeek(weekStart, 1))}`}
              >
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
              currentUserId={admin.user.id}
              isAdmin
              buildSlotHref={buildSlotHref}
            />
          </Card>

          <div className="mt-6">
            <h3 className="font-display mb-3 text-base font-semibold text-text-strong">
              Réservations de la semaine
            </h3>
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
                        {r.autoCreatedFromFlight && (
                          <>
                            <span className="mx-2 text-text-subtle">·</span>
                            <span className="italic text-text-subtle">
                              auto (vol)
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    {!r.autoCreatedFromFlight && (
                      <form action={adminCancelReservation}>
                        <input
                          type="hidden"
                          name="reservationId"
                          value={r.id}
                        />
                        <Button type="submit" variant="danger" size="sm">
                          Annuler
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* 2. Open periods (seasons during which the aircraft is bookable) */}
        <Card className="mb-10">
          <CardHeader>
            <CardTitle>Périodes d&apos;ouverture</CardTitle>
            <CardDescription>
              Plages de dates pendant lesquelles l&apos;avion est réservable
              (24/7 par défaut, hors indisponibilités). Si la liste est vide,
              l&apos;avion est considéré ouvert en permanence.
            </CardDescription>
          </CardHeader>
          <form
            action={createOpenPeriod}
            className="grid gap-3 sm:grid-cols-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="op-start" required>
                Du
              </Label>
              <Input
                id="op-start"
                name="startDate"
                type="date"
                required
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="op-end" required>
                Au (inclus)
              </Label>
              <Input
                id="op-end"
                name="endDate"
                type="date"
                required
                className="tabular"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="op-reason">Motif</Label>
              <Input
                id="op-reason"
                name="reason"
                type="text"
                placeholder="facultatif (ex : saison d'été)"
                maxLength={500}
              />
            </div>
            <div className="sm:col-span-4">
              <Button type="submit">Ajouter une période</Button>
            </div>
          </form>

          {openPeriods.length === 0 ? (
            <p className="mt-6 text-sm text-text-muted">
              Aucune période d&apos;ouverture définie — l&apos;avion est
              actuellement considéré ouvert toute l&apos;année.
            </p>
          ) : (
            <ul className="mt-6 divide-y divide-border-subtle border-t border-border-subtle">
              {openPeriods.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-semibold text-text-strong">
                      {formatDateFR(p.startDate)}
                      <span className="mx-2 text-text-subtle">→</span>
                      {formatDateFR(p.endDate)}
                    </p>
                    {p.reason && (
                      <p className="mt-0.5 text-xs text-text-subtle">
                        {p.reason}
                      </p>
                    )}
                  </div>
                  <form action={deleteOpenPeriod}>
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      aria-label="Supprimer cette période d'ouverture"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 3a. Recurring exceptions */}
        <Card className="mb-10">
          <CardHeader>
            <CardTitle>Indisponibilité récurrente</CardTitle>
            <CardDescription>
              Hebdomadaire — par exemple « Mercredi 14:00–16:00 ». Les
              exceptions ponctuelles (section ci-dessous) prennent toujours
              la priorité.
            </CardDescription>
          </CardHeader>
          <form
            action={createRecurringException}
            className="grid gap-3 sm:grid-cols-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="dayOfWeek" required>
                Jour
              </Label>
              <select
                id="dayOfWeek"
                name="dayOfWeek"
                required
                className="block w-full min-h-11 rounded-md border border-border bg-surface-elevated px-3.5 py-2 text-base text-text shadow-xs focus:border-brand focus:outline-none"
              >
                {DAY_LABELS_FR.map((label, idx) => (
                  <option key={idx} value={idx}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-start" required>
                Début
              </Label>
              <Input
                id="rec-start"
                name="startStr"
                type="time"
                required
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-end" required>
                Fin
              </Label>
              <Input
                id="rec-end"
                name="endStr"
                type="time"
                required
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-reason">Motif</Label>
              <Input
                id="rec-reason"
                name="reason"
                type="text"
                placeholder="facultatif"
                maxLength={500}
              />
            </div>
            <div className="sm:col-span-4">
              <Button type="submit">Ajouter</Button>
            </div>
          </form>

          {recurring.length === 0 ? (
            <p className="mt-6 text-sm text-text-muted">
              Aucune indisponibilité récurrente définie.
            </p>
          ) : (
            <ul className="mt-6 divide-y divide-border-subtle border-t border-border-subtle">
              {recurring.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-semibold text-text-strong">
                      {DAY_LABELS_FR[b.dayOfWeek ?? 0]}
                      <span className="mx-2 text-text-subtle">·</span>
                      <span className="tabular text-text-muted">
                        {fmtMinutes(b.startMinutes)} – {fmtMinutes(b.endMinutes)}
                      </span>
                    </p>
                    {b.reason && (
                      <p className="mt-0.5 text-xs text-text-subtle">
                        {b.reason}
                      </p>
                    )}
                  </div>
                  <form action={deleteException}>
                    <input type="hidden" name="id" value={b.id} />
                    <button
                      type="submit"
                      aria-label="Supprimer cette indisponibilité"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 2b. Per-date exceptions */}
        <Card>
          <CardHeader>
            <CardTitle>Indisponibilité ponctuelle</CardTitle>
            <CardDescription>
              Une exception pour une date donnée remplace les exceptions
              récurrentes de ce jour.
            </CardDescription>
          </CardHeader>
          <form
            action={createOverrideException}
            className="grid gap-3 sm:grid-cols-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="ov-date" required>
                Date
              </Label>
              <Input
                id="ov-date"
                name="date"
                type="date"
                required
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ov-start" required>
                Début
              </Label>
              <Input
                id="ov-start"
                name="startStr"
                type="time"
                required
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ov-end" required>
                Fin
              </Label>
              <Input
                id="ov-end"
                name="endStr"
                type="time"
                required
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ov-reason">Motif</Label>
              <Input
                id="ov-reason"
                name="reason"
                type="text"
                placeholder="facultatif"
                maxLength={500}
              />
            </div>
            <div className="sm:col-span-4">
              <Button type="submit">Ajouter une exception</Button>
            </div>
          </form>

          {overrides.length === 0 ? (
            <p className="mt-6 text-sm text-text-muted">
              Aucune exception ponctuelle.
            </p>
          ) : (
            <ul className="mt-6 divide-y divide-border-subtle border-t border-border-subtle">
              {overrides.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-semibold text-text-strong">
                      {formatDateFR(b.specificDate)}
                      <span className="mx-2 text-text-subtle">·</span>
                      <span className="tabular text-text-muted">
                        {fmtMinutes(b.startMinutes)} – {fmtMinutes(b.endMinutes)}
                      </span>
                    </p>
                    {b.reason && (
                      <p className="mt-0.5 text-xs text-text-subtle">
                        {b.reason}
                      </p>
                    )}
                  </div>
                  <form action={deleteException}>
                    <input type="hidden" name="id" value={b.id} />
                    <button
                      type="submit"
                      aria-label="Supprimer cette exception"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
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
