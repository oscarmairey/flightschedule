// FlightSchedule — /admin/pilots/[id]/reservations — full reservation log.
//
// "Voir toutes les réservations" target from the pilot detail page.
// Same row markup as the parent's "10 dernières réservations" list,
// but unbounded.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDateFR, parisLocalDateString } from "@/lib/format";
import { formatHHMM } from "@/lib/duration";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AppShell } from "@/components/AppShell";

const TZ = "Europe/Paris";

export default async function PilotReservationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const pilot = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true },
  });
  if (!pilot) notFound();

  const reservations = await prisma.reservation.findMany({
    where: { userId: pilot.id },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      durationMin: true,
      status: true,
      autoCreatedFromFlight: true,
      comment: true,
    },
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href={`/admin/pilots/${pilot.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {pilot.name}
        </Link>

        <header className="mt-4 mb-8">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            Toutes les réservations
          </h1>
          <p className="mt-2 text-base text-text-muted">
            {pilot.name}
            <span className="mx-2 text-text-subtle">·</span>
            <span className="tabular">{reservations.length}</span> réservation
            {reservations.length !== 1 ? "s" : ""}
          </p>
        </header>

        {reservations.length === 0 ? (
          <Card tone="sunken">
            <p className="text-sm text-text-muted">
              Aucune réservation pour ce pilote.
            </p>
          </Card>
        ) : (
          <ul className="divide-y divide-border-subtle border-y border-border-subtle">
            {reservations.map((r) => {
              const startYmd = parisLocalDateString(r.startsAt);
              const endYmd = parisLocalDateString(r.endsAt);
              const spansSeveralDates = startYmd !== endYmd;
              const startTime = new Intl.DateTimeFormat("fr-FR", {
                timeZone: TZ,
                hour: "2-digit",
                minute: "2-digit",
              }).format(r.startsAt);
              const endTime = new Intl.DateTimeFormat("fr-FR", {
                timeZone: TZ,
                hour: "2-digit",
                minute: "2-digit",
              }).format(r.endsAt);
              const statusVariant =
                r.status === "CONFIRMED"
                  ? ("success" as const)
                  : ("danger" as const);
              const statusLabel =
                r.status === "CONFIRMED"
                  ? "Confirmée"
                  : r.status === "CANCELLED_BY_PILOT"
                    ? "Annulée (pilote)"
                    : "Annulée (admin)";
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-semibold text-text-strong">
                      {spansSeveralDates
                        ? `Du ${formatDateFR(r.startsAt)} au ${formatDateFR(r.endsAt)}`
                        : formatDateFR(r.startsAt)}
                    </p>
                    <p className="mt-0.5 text-xs tabular text-text-subtle">
                      {startTime} – {endTime}
                      <span className="mx-1.5">·</span>
                      <span className="font-semibold text-text">
                        {formatHHMM(r.durationMin)}
                      </span>
                      {r.autoCreatedFromFlight && (
                        <>
                          <span className="mx-1.5">·</span>
                          <span className="italic">créée par un vol</span>
                        </>
                      )}
                    </p>
                    {r.comment && (
                      <p className="mt-1 text-xs italic text-text-subtle">
                        {r.comment}
                      </p>
                    )}
                  </div>
                  <Badge variant={statusVariant} size="sm">
                    {statusLabel}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
