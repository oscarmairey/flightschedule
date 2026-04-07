// CAVOK — /admin — overview dashboard (PRD §3.5.5).
//
// Four cards: pending flights count, low-balance pilots, recent activity,
// recent payments.

import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateTimeFR } from "@/lib/format";
import { formatHHMM, formatHHMMSigned, balanceTier, BALANCE_THRESHOLDS } from "@/lib/duration";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AppShell } from "@/components/AppShell";

export default async function AdminOverviewPage() {
  await requireAdmin();

  const [pendingCount, lowBalance, recentActivity, recentPayments] = await Promise.all([
    prisma.flight.count({ where: { status: "PENDING" } }),
    prisma.user.findMany({
      where: {
        isActive: true,
        role: "PILOT",
        hdvBalanceMin: { lt: BALANCE_THRESHOLDS.RED_MAX_MIN },
      },
      orderBy: { hdvBalanceMin: "asc" },
      take: 10,
    }),
    prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { name: true } } },
    }),
    prisma.transaction.findMany({
      where: { type: "PACKAGE_PURCHASE" },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { name: true } } },
    }),
  ]);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">{COPY.nav.admin}</h1>
          <p className="mt-1 text-sm text-zinc-500">Vue d'ensemble</p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Pending flights */}
          <Card>
            <CardHeader>
              <CardTitle>Vols à valider</CardTitle>
              <CardDescription>
                Saisies pilotes en attente de validation.
              </CardDescription>
            </CardHeader>
            <div className="flex items-center justify-between">
              <p className="text-5xl font-semibold tracking-tight">{pendingCount}</p>
              <Link
                href="/admin/flights"
                className="text-sm font-medium text-zinc-700 hover:underline"
              >
                Ouvrir la file →
              </Link>
            </div>
          </Card>

          {/* Low balances */}
          <Card>
            <CardHeader>
              <CardTitle>Soldes faibles</CardTitle>
              <CardDescription>
                Pilotes actifs avec moins de {formatHHMM(BALANCE_THRESHOLDS.RED_MAX_MIN)} HDV.
              </CardDescription>
            </CardHeader>
            {lowBalance.length === 0 ? (
              <p className="text-sm text-zinc-500">Tous les pilotes ont assez de HDV.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {lowBalance.map((p) => (
                  <li key={p.id} className="flex items-center justify-between">
                    <Link
                      href={`/admin/pilots/${p.id}`}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    <Badge tier={balanceTier(p.hdvBalanceMin)}>
                      {formatHHMM(p.hdvBalanceMin)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Recent activity */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Activité récente</CardTitle>
              <CardDescription>
                10 derniers mouvements HDV (tous pilotes confondus).
              </CardDescription>
            </CardHeader>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-zinc-500">Aucune activité.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Pilote</th>
                      <th className="px-2 py-2">Type</th>
                      <th className="px-2 py-2 text-right">Montant</th>
                      <th className="px-2 py-2 text-right">Solde après</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {recentActivity.map((t) => (
                      <tr key={t.id}>
                        <td className="px-2 py-2 text-zinc-600">{formatDateTimeFR(t.createdAt)}</td>
                        <td className="px-2 py-2 font-medium">{t.user.name}</td>
                        <td className="px-2 py-2">{COPY.txTypes[t.type]}</td>
                        <td
                          className={`px-2 py-2 text-right font-medium ${
                            t.amountMin > 0 ? "text-emerald-700" : "text-zinc-700"
                          }`}
                        >
                          {formatHHMMSigned(t.amountMin)}
                        </td>
                        <td className="px-2 py-2 text-right text-zinc-700">
                          {formatHHMM(t.balanceAfterMin)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Recent payments */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Paiements récents</CardTitle>
              <CardDescription>
                10 derniers achats Stripe.
              </CardDescription>
            </CardHeader>
            {recentPayments.length === 0 ? (
              <p className="text-sm text-zinc-500">Aucun paiement enregistré.</p>
            ) : (
              <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                {recentPayments.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2">
                    <div>
                      <span className="font-medium">{t.user.name}</span>
                      <span className="ml-2 text-zinc-500">
                        {formatDateTimeFR(t.createdAt)}
                      </span>
                    </div>
                    <Badge variant="success">+{formatHHMM(t.amountMin)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
