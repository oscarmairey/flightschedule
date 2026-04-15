// FlightSchedule — /flights — pilot's flight history (log).
//
// Created in Pass 1.2 when the history was extracted from /flights/new.
// The log is read-only (flights are immutable per architectural rule #9)
// with a prominent "Saisir un vol" CTA that bounces to /flights/new.

import Link from "next/link";
import { Plane, PencilLine } from "lucide-react";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatHHMM } from "@/lib/duration";
import { Button } from "@/components/ui/Button";
import { AppShell } from "@/components/AppShell";
import { FlightHistory } from "@/components/flights/FlightHistory";

export default async function FlightsPage() {
  const session = await requireSession();

  // Only counts + total are rendered in the header; the full list is
  // delegated to <FlightHistory/> which issues its own query so it can
  // be mounted elsewhere unchanged.
  const [count, totalAgg] = await Promise.all([
    prisma.flight.count({ where: { userId: session.user.id } }),
    prisma.flight.aggregate({
      where: { userId: session.user.id },
      _sum: { actualDurationMin: true },
    }),
  ]);
  const totalMin = totalAgg._sum.actualDurationMin ?? 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
              <Plane className="h-4 w-4" aria-hidden="true" />
              Mes vols
            </p>
            <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
              {count} vol{count !== 1 ? "s" : ""} enregistré{count !== 1 ? "s" : ""}
            </h1>
            {count > 0 && (
              <p className="mt-1 text-sm text-text-muted">
                <span className="font-display tabular text-text-strong">
                  {formatHHMM(totalMin)}
                </span>{" "}
                cumulés depuis votre premier vol
              </p>
            )}
          </div>
          <Link href="/flights/new">
            <Button>
              <PencilLine className="h-4 w-4" aria-hidden="true" />
              Saisir un vol
            </Button>
          </Link>
        </header>

        <FlightHistory userId={session.user.id} />
      </div>
    </AppShell>
  );
}
