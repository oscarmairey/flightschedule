// FlightSchedule — /admin — overview dashboard (PRD §3.5.5).
//
// Three sections: low-balance pilots, recent activity, recent payments.
// (V1.1 removed the "pending flights" tile — flights no longer require
// admin validation.)

import Link from "next/link";
import {
  Shield,
  ArrowRight,
  AlertTriangle,
  Banknote,
  CalendarClock,
} from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateFR, formatDateTimeFR, formatTimeFR } from "@/lib/format";
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

  const now = new Date();
  const [
    lowBalance,
    recentActivity,
    recentPayments,
    pendingTransferCount,
    upcomingReservations,
  ] = await Promise.all([
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
      where: { type: { in: ["PACKAGE_PURCHASE", "BANK_TRANSFER"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { name: true } } },
    }),
    prisma.bankTransfer.count({ where: { status: "PENDING" } }),
    // ALL strictly-upcoming reservations from `now` onward. Ongoing
    // reservations from the current week are deliberately excluded
    // per product decision.
    prisma.reservation.findMany({
      where: {
        status: "CONFIRMED",
        startsAt: { gte: now },
      },
      orderBy: { startsAt: "asc" },
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

        {/* All upcoming reservations. Current-week reservations already in
            progress are deliberately excluded (startsAt >= now). */}
        <section
          aria-label="Prochaines réservations"
          className="mb-8"
        >
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock
              className="h-4 w-4 text-text-subtle"
              aria-hidden="true"
            />
            <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-text-subtle">
              Prochaines réservations
            </h2>
          </div>
          {upcomingReservations.length > 0 ? (
            <Card padded={false}>
              <ul className="divide-y divide-border-subtle">
                {upcomingReservations.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-lg font-semibold tracking-tight text-text-strong">
                        {r.user.name}
                      </p>
                      <p className="mt-1 text-sm tabular text-text-muted">
                        <span className="font-semibold text-text">
                          {formatDateFR(r.startsAt)}
                        </span>
                        <span className="mx-2 text-text-subtle">·</span>
                        <span className="tabular">
                          {formatTimeFR(r.startsAt)} –{" "}
                          {formatTimeFR(r.endsAt)}
                        </span>
                        <span className="mx-2 text-text-subtle">·</span>
                        <span>{formatHHMM(r.durationMin)}</span>
                      </p>
                    </div>
                    <Link
                      href={`/admin/pilots/${r.userId}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors hover:text-brand-hover"
                    >
                      Voir le pilote
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card tone="sunken">
              <p className="text-sm text-text-muted">
                Aucune réservation à venir.
              </p>
            </Card>
          )}
        </section>

        {/* Top metrics — pilots in low-balance + pending bank transfers */}
        <section
          aria-label="Indicateurs clés"
          className="grid gap-6 border-y border-border-subtle py-7 sm:grid-cols-2"
        >
          <Link href="/admin/pilots" className="group block">
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
          <Link href="/admin/virements" className="group block">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-text-subtle">
              <Banknote className="h-3 w-3" aria-hidden="true" />
              Virements en attente
            </p>
            <div className="mt-2 flex items-baseline gap-3">
              <span
                className={`font-display tabular text-5xl font-semibold tracking-tight ${
                  pendingTransferCount > 0 ? "text-warning" : "text-text-strong"
                }`}
              >
                {pendingTransferCount}
              </span>
              <span className="text-sm font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100">
                Valider →
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
                        {t.type === "BANK_TRANSFER" ? "Virement" : "Carte"}
                        <span className="mx-1.5">·</span>
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
          <Link href="/admin/pilots">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors hover:text-brand-hover">
              Pilotes <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
          <span className="text-text-subtle">·</span>
          <Link href="/admin/disponibilites">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors hover:text-brand-hover">
              Disponibilités <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
          <span className="text-text-subtle">·</span>
          <Link href="/admin/virements">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors hover:text-brand-hover">
              Virements <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
          <span className="text-text-subtle">·</span>
          <Link href="/admin/tarifs">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors hover:text-brand-hover">
              Tarifs <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
