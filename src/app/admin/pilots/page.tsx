// FlightSchedule — /admin/pilots — pilot directory with at-a-glance HDV columns.
//
// V2 columns (req #11):
//   1. Nom (linked) + admin/inactive badges
//   2. Solde HDV (current balance)
//   3. Total HDV (sum of all credits — packages + admin adjustments)
//   4. Résa HDV (sum of duration for upcoming CONFIRMED reservations)
//   5. HDV année en cours (sum of Flight.actualDurationMin this year)
//   6. Montant dépensé (sum of Transaction.priceCents for PACKAGE_PURCHASE)
//
// Aggregates are computed via separate groupBy calls and merged in JS.
// At 5–12 pilots this is fast enough; if it ever needs optimization,
// rewrite as one $queryRaw.

import Link from "next/link";
import { Users, Plus, ArrowRight } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatHHMM, balanceTier } from "@/lib/duration";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";

function formatEUR(cents: number | null): string {
  if (cents === null || cents === 0) return "—";
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

export default async function AdminPilotsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const now = new Date();
  const startOfYear = new Date(`${now.getFullYear()}-01-01T00:00:00Z`);

  const [
    pilots,
    totalCreditByUser,
    upcomingResByUser,
    flightsThisYearByUser,
    spendByUser,
    userBalances,
  ] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    // Total HDV = sum of POSITIVE transaction amounts (all credits).
    prisma.transaction.groupBy({
      by: ["userId"],
      where: { amountMin: { gt: 0 } },
      _sum: { amountMin: true },
    }),
    // Résa HDV = sum of upcoming CONFIRMED reservation durations.
    prisma.reservation.groupBy({
      by: ["userId"],
      where: {
        status: "CONFIRMED",
        startsAt: { gte: now },
      },
      _sum: { durationMin: true },
    }),
    // HDV année en cours = sum of Flight durations this calendar year.
    prisma.flight.groupBy({
      by: ["userId"],
      where: { date: { gte: startOfYear } },
      _sum: { actualDurationMin: true },
    }),
    // Montant dépensé = sum of Transaction.priceCents for PACKAGE_PURCHASE.
    prisma.transaction.groupBy({
      by: ["userId"],
      where: { type: "PACKAGE_PURCHASE", priceCents: { not: null } },
      _sum: { priceCents: true },
    }),
    // V2.4 — per-type wallets for each pilot. Used to derive the "Solde
    // HDV" column (sum across types) and the active type label.
    prisma.userFlightHourBalance.findMany({
      where: { balanceMin: { not: 0 } },
      include: {
        flightHourType: { select: { name: true } },
      },
    }),
  ]);

  const totalCreditMap = new Map<string, number>();
  for (const row of totalCreditByUser) {
    totalCreditMap.set(row.userId, row._sum.amountMin ?? 0);
  }
  const upcomingResMap = new Map<string, number>();
  for (const row of upcomingResByUser) {
    upcomingResMap.set(row.userId, row._sum.durationMin ?? 0);
  }
  const ytdMap = new Map<string, number>();
  for (const row of flightsThisYearByUser) {
    ytdMap.set(row.userId, row._sum.actualDurationMin ?? 0);
  }
  const spendMap = new Map<string, number>();
  for (const row of spendByUser) {
    spendMap.set(row.userId, row._sum.priceCents ?? 0);
  }

  // Per-pilot balance aggregate: sum across types + name of the active
  // (positive) wallet, or "Mixte" if somehow two+ non-zero types exist
  // (shouldn't under the invariant but defensive).
  type BalanceSummary = {
    netMin: number;
    activeTypeName: string | null;
    /** true when the pilot has no non-zero wallet at all. */
    empty: boolean;
  };
  const balanceMap = new Map<string, BalanceSummary>();
  for (const row of userBalances) {
    const prev = balanceMap.get(row.userId) ?? {
      netMin: 0,
      activeTypeName: null,
      empty: false,
    };
    prev.netMin += row.balanceMin;
    if (row.balanceMin > 0) {
      prev.activeTypeName = prev.activeTypeName
        ? `${prev.activeTypeName}, ${row.flightHourType.name}`
        : row.flightHourType.name;
    }
    balanceMap.set(row.userId, prev);
  }

  const errorBanner =
    params.error === "self_deactivate"
      ? "Vous ne pouvez pas désactiver votre propre compte."
      : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
              <Users className="h-4 w-4" aria-hidden="true" />
              {COPY.nav.adminPilots}
            </p>
            <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
              {pilots.length} compte{pilots.length !== 1 ? "s" : ""}
            </h1>
          </div>
          <Link href="/admin/pilots/new">
            <Button>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouveau pilote
            </Button>
          </Link>
        </header>

        {errorBanner && (
          <div className="mb-6">
            <Alert tone="error">{errorBanner}</Alert>
          </div>
        )}

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs font-medium uppercase tracking-[0.08em] text-text-subtle">
                <th className="py-3 pr-4">Nom</th>
                <th className="py-3 pr-4 text-right">Solde HDV</th>
                <th className="py-3 pr-4 text-right">Total HDV</th>
                <th className="py-3 pr-4 text-right">Résa HDV</th>
                <th className="py-3 pr-4 text-right">
                  HDV {now.getFullYear()}
                </th>
                <th className="py-3 pr-4 text-right">Dépensé</th>
                <th className="py-3 pl-2" aria-label="Détails" />
              </tr>
            </thead>
            <tbody>
              {pilots.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-border-subtle align-top ${p.isActive ? "" : "opacity-55"}`}
                >
                  <td className="py-4 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/pilots/${p.id}`}
                        className="font-display text-base font-semibold text-text-strong transition-colors hover:text-brand"
                      >
                        {p.name}
                      </Link>
                      {p.role === "ADMIN" && (
                        <Badge variant="brand" size="sm">
                          Admin
                        </Badge>
                      )}
                      {!p.isActive && (
                        <Badge variant="danger" size="sm">
                          Inactif
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-text-muted">{p.email}</p>
                  </td>
                  <td className="py-4 pr-4 text-right">
                    {(() => {
                      const bal = balanceMap.get(p.id);
                      const net = bal?.netMin ?? 0;
                      return (
                        <div className="flex flex-col items-end gap-0.5">
                          <Badge tier={balanceTier(net)}>
                            {formatHHMM(net)}
                          </Badge>
                          {bal?.activeTypeName && (
                            <span className="text-[11px] text-text-subtle">
                              {bal.activeTypeName}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="py-4 pr-4 text-right tabular text-text">
                    {formatHHMM(totalCreditMap.get(p.id) ?? 0)}
                  </td>
                  <td className="py-4 pr-4 text-right tabular text-text">
                    {formatHHMM(upcomingResMap.get(p.id) ?? 0)}
                  </td>
                  <td className="py-4 pr-4 text-right tabular text-text">
                    {formatHHMM(ytdMap.get(p.id) ?? 0)}
                  </td>
                  <td className="py-4 pr-4 text-right tabular text-text">
                    {formatEUR(spendMap.get(p.id) ?? null)}
                  </td>
                  <td className="py-4 pl-2 text-right">
                    <Link
                      href={`/admin/pilots/${p.id}`}
                      aria-label={`Détails de ${p.name}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-sunken hover:text-brand"
                    >
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="space-y-4 md:hidden">
          {pilots.map((p) => (
            <li
              key={p.id}
              className={`rounded-lg border border-border-subtle bg-surface-elevated p-4 ${p.isActive ? "" : "opacity-55"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/pilots/${p.id}`}
                      className="font-display text-base font-semibold text-text-strong"
                    >
                      {p.name}
                    </Link>
                    {p.role === "ADMIN" && (
                      <Badge variant="brand" size="sm">
                        Admin
                      </Badge>
                    )}
                    {!p.isActive && (
                      <Badge variant="danger" size="sm">
                        Inactif
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">{p.email}</p>
                </div>
                {(() => {
                  const bal = balanceMap.get(p.id);
                  const net = bal?.netMin ?? 0;
                  return (
                    <div className="flex flex-col items-end gap-0.5">
                      <Badge tier={balanceTier(net)}>{formatHHMM(net)}</Badge>
                      {bal?.activeTypeName && (
                        <span className="text-[11px] text-text-subtle">
                          {bal.activeTypeName}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <dt className="text-text-subtle">Total HDV</dt>
                  <dd className="font-display tabular text-sm font-semibold text-text">
                    {formatHHMM(totalCreditMap.get(p.id) ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-subtle">Résa HDV</dt>
                  <dd className="font-display tabular text-sm font-semibold text-text">
                    {formatHHMM(upcomingResMap.get(p.id) ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-subtle">
                    HDV {now.getFullYear()}
                  </dt>
                  <dd className="font-display tabular text-sm font-semibold text-text">
                    {formatHHMM(ytdMap.get(p.id) ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-subtle">Dépensé</dt>
                  <dd className="font-display tabular text-sm font-semibold text-text">
                    {formatEUR(spendMap.get(p.id) ?? null)}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
