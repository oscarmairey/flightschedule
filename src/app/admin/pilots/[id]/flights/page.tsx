// FlightSchedule — /admin/pilots/[id]/flights — full flight log for one pilot.
//
// "Voir tous les vols" target from the pilot detail page. Same row markup
// as the parent's "10 derniers vols" list, but unbounded (no `take`).

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PencilLine } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDateFR } from "@/lib/format";
import { formatHHMM } from "@/lib/duration";
import { Card } from "@/components/ui/Card";
import { AppShell } from "@/components/AppShell";

export default async function PilotFlightsPage({
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

  const flights = await prisma.flight.findMany({
    where: { userId: pilot.id },
    orderBy: [{ date: "desc" }, { engineStart: "desc" }],
    select: {
      id: true,
      date: true,
      depAirport: true,
      arrAirport: true,
      actualDurationMin: true,
      engineStart: true,
      engineStop: true,
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
            Tous les vols
          </h1>
          <p className="mt-2 text-base text-text-muted">
            {pilot.name}
            <span className="mx-2 text-text-subtle">·</span>
            <span className="tabular">{flights.length}</span> vol
            {flights.length !== 1 ? "s" : ""}
          </p>
        </header>

        {flights.length === 0 ? (
          <Card tone="sunken">
            <p className="text-sm text-text-muted">
              Aucun vol enregistré pour ce pilote.
            </p>
          </Card>
        ) : (
          <ul className="divide-y divide-border-subtle border-y border-border-subtle">
            {flights.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-display tabular text-base font-semibold text-text-strong">
                    {f.depAirport}
                    <span className="mx-1.5 text-text-subtle">→</span>
                    {f.arrAirport}
                  </p>
                  <p className="mt-0.5 text-xs tabular text-text-subtle">
                    {formatDateFR(f.date)}
                    <span className="mx-1.5">·</span>
                    {f.engineStart} → {f.engineStop}
                    <span className="mx-1.5">·</span>
                    <span className="font-semibold text-text">
                      {formatHHMM(f.actualDurationMin)}
                    </span>
                  </p>
                </div>
                <Link
                  href={`/admin/flights/${f.id}/edit`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors hover:text-brand-hover"
                >
                  <PencilLine className="h-4 w-4" aria-hidden="true" />
                  Modifier
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
