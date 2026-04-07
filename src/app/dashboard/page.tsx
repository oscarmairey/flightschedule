// CAVOK — pilot dashboard (full per PRD §3.4).
//
// Sections:
//   1. HDV balance card with color tier
//   2. Stats row: HDV YTD, HDV all-time, total flights
//   3. Recent flights (last 5)
//   4. Recent transactions (last 5)
//   5. Quick action buttons (Réserver, Saisir, Acheter)

import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatHHMM, formatHHMMSigned, balanceTier } from "@/lib/duration";
import { formatDateFR, formatDateTimeFR } from "@/lib/format";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AppShell } from "@/components/AppShell";

export default async function DashboardPage() {
  const session = await requireSession();

  const startOfYear = new Date(`${new Date().getFullYear()}-01-01T00:00:00Z`);

  const [user, recentFlights, recentTx, ytdAgg, allTimeAgg, totalFlights] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { hdvBalanceMin: true, name: true, role: true },
      }),
      prisma.flight.findMany({
        where: { userId: session.user.id },
        orderBy: { date: "desc" },
        take: 5,
      }),
      prisma.transaction.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.flight.aggregate({
        where: { userId: session.user.id, date: { gte: startOfYear } },
        _sum: { actualDurationMin: true },
      }),
      prisma.flight.aggregate({
        where: { userId: session.user.id },
        _sum: { actualDurationMin: true },
      }),
      prisma.flight.count({ where: { userId: session.user.id } }),
    ]);

  const balance = user?.hdvBalanceMin ?? 0;
  const tier = balanceTier(balance);
  const tierLabel =
    tier === "green" ? "Solde confortable" : tier === "amber" ? "Solde moyen" : "Solde faible";

  const ytdMin = ytdAgg._sum.actualDurationMin ?? 0;
  const allTimeMin = allTimeAgg._sum.actualDurationMin ?? 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">{COPY.dashboard.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {COPY.dashboard.welcome} {session.user.name}
          </p>
        </header>

        {/* Balance + quick actions */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  {COPY.dashboard.balanceLabel}
                </p>
                <p className="mt-1 text-5xl font-semibold tracking-tight">
                  {formatHHMM(balance)}
                </p>
                <Badge tier={tier} className="mt-2">{tierLabel}</Badge>
              </div>
              <div className="grid gap-2 text-right text-sm sm:grid-cols-1">
                <div>
                  <span className="text-zinc-500">HDV {new Date().getFullYear()} : </span>
                  <span className="font-medium">{formatHHMM(ytdMin)}</span>
                </div>
                <div>
                  <span className="text-zinc-500">HDV total : </span>
                  <span className="font-medium">{formatHHMM(allTimeMin)}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Vols : </span>
                  <span className="font-medium">{totalFlights}</span>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Actions rapides
            </h2>
            <div className="space-y-2">
              <Link href="/calendar">
                <Button fullWidth>{COPY.dashboard.book}</Button>
              </Link>
              <Link href="/flights/new">
                <Button fullWidth variant="secondary">
                  {COPY.dashboard.logFlight}
                </Button>
              </Link>
              <Link href="/account">
                <Button fullWidth variant="secondary">
                  {COPY.dashboard.buyHdv}
                </Button>
              </Link>
            </div>
          </Card>
        </div>

        {/* Recent flights */}
        <section>
          <h2 className="mb-4 text-xl font-semibold">{COPY.dashboard.recentFlights}</h2>
          {recentFlights.length === 0 ? (
            <Card>
              <p className="text-sm text-zinc-500">Aucun vol enregistré.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Trajet</th>
                    <th className="px-4 py-3 text-right">Durée</th>
                    <th className="px-4 py-3">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {recentFlights.map((f) => (
                    <tr key={f.id}>
                      <td className="px-4 py-3 text-zinc-600">{formatDateFR(f.date)}</td>
                      <td className="px-4 py-3">
                        {f.depAirport} → {f.arrAirport}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatHHMM(f.actualDurationMin)}
                      </td>
                      <td className="px-4 py-3">
                        {f.status === "VALIDATED" && <Badge variant="success">Validé</Badge>}
                        {f.status === "PENDING" && <Badge variant="warning">En attente</Badge>}
                        {f.status === "REJECTED" && <Badge variant="danger">Rejeté</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>

        {/* Recent transactions */}
        <section>
          <h2 className="mb-4 text-xl font-semibold">{COPY.dashboard.recentTransactions}</h2>
          {recentTx.length === 0 ? (
            <Card>
              <p className="text-sm text-zinc-500">{COPY.account.transactionsEmpty}</p>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Montant</th>
                    <th className="px-4 py-3 text-right">Solde</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {recentTx.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-3 text-zinc-600">{formatDateTimeFR(t.createdAt)}</td>
                      <td className="px-4 py-3">{COPY.txTypes[t.type]}</td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          t.amountMin > 0 ? "text-emerald-700" : "text-zinc-700"
                        }`}
                      >
                        {formatHHMMSigned(t.amountMin)}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-700">
                        {formatHHMM(t.balanceAfterMin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}
