// CAVOK — /admin — overview dashboard (PRD §3.5.5).
//
// Four sections: pending flights count, low-balance pilots, recent
// activity, recent payments.

import Link from "next/link";
import { Shield, ArrowRight, AlertTriangle } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateTimeFR } from "@/lib/format";
import {
  formatHHMM,
  formatHHMMSigned,
  balanceTier,
  BALANCE_THRESHOLDS,
} from "@/lib/duration";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AppShell } from "@/components/AppShell";

export default async function AdminOverviewPage() {
  await requireAdmin();

  const [pendingCount, lowBalance, recentActivity, recentPayments] =
    await Promise.all([
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
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-10">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            <Shield className="h-4 w-4" aria-hidden="true" />
            {COPY.nav.admin}
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            Vue d&apos;ensemble
          </h1>
        </header>

        {/* Top metrics row — flush, not boxed */}
        <section
          aria-label="Indicateurs clés"
          className="grid gap-8 border-y border-border-subtle py-7 sm:grid-cols-2"
        >
          <Link href="/admin/flights" className="group">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-subtle">
              Vols à valider
            </p>
            <div className="mt-2 flex items-baseline gap-3">
              <span
                className={`font-display tabular text-5xl font-semibold tracking-tight ${
                  pendingCount > 0 ? "text-warning" : "text-text-strong"
                }`}
              >
                {pendingCount}
              </span>
              <span className="text-sm font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100">
                Ouvrir la file →
              </span>
            </div>
          </Link>
          <Link href="/admin/pilots" className="group">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-subtle">
              Pilotes en solde faible
            </p>
            <div className="mt-2 flex items-baseline gap-3">
              <span
                className={`font-display tabular text-5xl font-semibold tracking-tight ${
                  lowBalance.length > 0 ? "text-danger" : "text-text-strong"
                }`}
              >
                {lowBalance.length}
              </span>
              <span className="text-sm font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100">
                Voir la liste →
              </span>
            </div>
          </Link>
        </section>

        {/* Low balances list */}
        {lowBalance.length > 0 && (
          <section className="mt-12">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong">
                Soldes à recharger
              </h2>
              <p className="flex items-center gap-1.5 text-xs text-text-subtle">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                &lt; {formatHHMM(BALANCE_THRESHOLDS.RED_MAX_MIN)}
              </p>
            </div>
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {lowBalance.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-4 py-3.5"
                >
                  <Link
                    href={`/admin/pilots/${p.id}`}
                    className="font-medium text-text transition-colors hover:text-brand"
                  >
                    {p.name}
                  </Link>
                  <Badge tier={balanceTier(p.hdvBalanceMin)}>
                    {formatHHMM(p.hdvBalanceMin)}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Activity + payments */}
        <div className="mt-14 grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <section aria-labelledby="recent-activity-h">
            <div className="mb-4 flex items-baseline justify-between">
              <h2
                id="recent-activity-h"
                className="font-display text-2xl font-semibold tracking-tight text-text-strong"
              >
                Activité récente
              </h2>
              <p className="text-xs text-text-subtle">
                10 derniers mouvements
              </p>
            </div>
            {recentActivity.length === 0 ? (
              <Card tone="sunken">
                <p className="text-sm text-text-muted">Aucune activité.</p>
              </Card>
            ) : (
              <ul className="divide-y divide-border-subtle border-y border-border-subtle">
                {recentActivity.map((t) => {
                  const isCredit = t.amountMin > 0;
                  return (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 py-3.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-text">
                          {t.user.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-text-subtle">
                          {COPY.txTypes[t.type]}
                          <span className="mx-1.5">·</span>
                          <span className="tabular">
                            {formatDateTimeFR(t.createdAt)}
                          </span>
                        </p>
                      </div>
                      <p
                        className={`tabular shrink-0 font-semibold ${
                          isCredit ? "text-success" : "text-text"
                        }`}
                      >
                        {formatHHMMSigned(t.amountMin)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="recent-payments-h">
            <div className="mb-4 flex items-baseline justify-between">
              <h2
                id="recent-payments-h"
                className="font-display text-2xl font-semibold tracking-tight text-text-strong"
              >
                Paiements
              </h2>
              <p className="text-xs text-text-subtle">10 derniers</p>
            </div>
            {recentPayments.length === 0 ? (
              <Card tone="sunken">
                <p className="text-sm text-text-muted">
                  Aucun paiement enregistré.
                </p>
              </Card>
            ) : (
              <ul className="divide-y divide-border-subtle border-y border-border-subtle">
                {recentPayments.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 py-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-text">
                        {t.user.name}
                      </p>
                      <p className="mt-0.5 text-xs tabular text-text-subtle">
                        {formatDateTimeFR(t.createdAt)}
                      </p>
                    </div>
                    <Badge variant="success" size="sm">
                      +{formatHHMM(t.amountMin)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link href="/admin/flights">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors hover:text-brand-hover">
              File de validation <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
          <span className="text-text-subtle">·</span>
          <Link href="/admin/pilots">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors hover:text-brand-hover">
              Pilotes <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
          <span className="text-text-subtle">·</span>
          <Link href="/admin/calendar">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors hover:text-brand-hover">
              Calendrier <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
