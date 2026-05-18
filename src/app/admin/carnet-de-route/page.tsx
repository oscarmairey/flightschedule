// FlightSchedule — /admin/carnet-de-route — global flight log.
//
// Admin-only single-table view of EVERY flight across all pilots. Used
// for auditing, reporting, and quickly finding a row to correct via the
// pilot-detail Modifier link or the per-row link below.
//
// Columns: DATE | NOM (Pilote) | DEPART | ARRIVEE | BLOCS OFF | BLOCS ON | HDV
//
// Sort toggle via `?order=asc|desc` query param — no client JS, server
// re-renders on the new ordering. Default is descending (newest first).
//
// No pagination in V1. Closed user group of ~5–12 pilots produces a few
// hundred rows per year at most; render all of them and let the browser
// scroll. If volume ever justifies it, drop in cursor pagination on
// `Flight.date + Flight.id`.

import Link from "next/link";
import { ArrowDown, ArrowUp, ClipboardList, PencilLine } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateFR } from "@/lib/format";
import { formatHHMM, formatHHMMOrDays } from "@/lib/duration";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/Card";

export default async function CarnetDeRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const order: "asc" | "desc" = sp.order === "asc" ? "asc" : "desc";

  const flights = await prisma.flight.findMany({
    orderBy: [{ date: order }, { engineStart: order }],
    select: {
      id: true,
      date: true,
      depAirport: true,
      arrAirport: true,
      engineStart: true,
      engineStop: true,
      actualDurationMin: true,
      user: { select: { id: true, name: true } },
    },
  });

  const totalMin = flights.reduce((acc, f) => acc + f.actualDurationMin, 0);

  const otherOrder: "asc" | "desc" = order === "desc" ? "asc" : "desc";

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-8">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            {COPY.nav.adminCarnetDeRoute}
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            {COPY.nav.adminCarnetDeRoute}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-text-muted">
            Tous les vols enregistrés, tous pilotes confondus. Cliquez sur la
            ligne pour ouvrir le formulaire de correction.
          </p>
        </header>

        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-sm text-text-muted">
            <span className="font-semibold tabular text-text">{flights.length}</span>{" "}
            vol{flights.length !== 1 ? "s" : ""}
            <span className="mx-2 text-text-subtle">·</span>
            total{" "}
            <span className="font-semibold tabular text-text">
              {formatHHMMOrDays(totalMin)}
            </span>
          </p>
          <Link
            href={`/admin/carnet-de-route?order=${otherOrder}`}
            scroll={false}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-text-muted shadow-xs transition-colors hover:border-border-strong hover:bg-surface-soft hover:text-text"
          >
            {order === "desc" ? (
              <>
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
                Plus récent d&apos;abord
              </>
            ) : (
              <>
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
                Plus ancien d&apos;abord
              </>
            )}
          </Link>
        </div>

        {flights.length === 0 ? (
          <Card tone="sunken">
            <p className="text-sm text-text-muted">
              Aucun vol enregistré pour le moment.
            </p>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs font-medium uppercase tracking-[0.08em] text-text-subtle">
                  <th className="py-3 pr-4">Date</th>
                  <th className="py-3 pr-4">Pilote</th>
                  <th className="py-3 pr-4">Départ</th>
                  <th className="py-3 pr-4">Arrivée</th>
                  <th className="py-3 pr-4 text-right">Bloc OFF</th>
                  <th className="py-3 pr-4 text-right">Bloc ON</th>
                  <th className="py-3 pr-4 text-right">HDV</th>
                  <th className="py-3 pl-2" aria-label="Modifier" />
                </tr>
              </thead>
              <tbody>
                {flights.map((f) => (
                  <tr
                    key={f.id}
                    className="border-b border-border-subtle align-top hover:bg-surface-soft/40"
                  >
                    <td className="py-3 pr-4 tabular text-text">
                      {formatDateFR(f.date)}
                    </td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/pilots/${f.user.id}`}
                        className="font-medium text-text-strong transition-colors hover:text-brand"
                      >
                        {f.user.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 font-display tabular font-semibold text-text-strong">
                      {f.depAirport}
                    </td>
                    <td className="py-3 pr-4 font-display tabular font-semibold text-text-strong">
                      {f.arrAirport}
                    </td>
                    <td className="py-3 pr-4 text-right tabular text-text">
                      {f.engineStart}
                    </td>
                    <td className="py-3 pr-4 text-right tabular text-text">
                      {f.engineStop}
                    </td>
                    <td className="py-3 pr-4 text-right tabular font-semibold text-text">
                      {formatHHMM(f.actualDurationMin)}
                    </td>
                    <td className="py-3 pl-2 text-right">
                      <Link
                        href={`/admin/flights/${f.id}/edit`}
                        aria-label={`Modifier le vol du ${formatDateFR(f.date)}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-sunken hover:text-brand"
                      >
                        <PencilLine className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
