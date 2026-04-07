// FlySchedule — pilot dashboard (full per PRD §3.4).
//
// The signature surface. The HDV balance is rendered with the Fraunces
// display face at hero scale — this is the moment a pilot opens the
// app for, and it has to feel like a panel gauge.
//
// Sections:
//   1. Hero balance + tier + quick actions (asymmetric two-column)
//   2. Stats strip (HDV YTD, HDV all-time, total flights) — flush, not boxed
//   3. Recent flights + recent transactions (mixed widths, not a 2-grid)

import Link from "next/link";
import {
  ArrowRight,
  CalendarPlus,
  PencilLine,
  Wallet,
  Plane,
  TrendingUp,
} from "lucide-react";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import {
  formatHHMM,
  formatHHMMSigned,
  balanceTier,
  BALANCE_TIER_FG_CLASSES,
  BALANCE_TIER_LABELS,
} from "@/lib/duration";
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
  const tierLabel = BALANCE_TIER_LABELS[tier];
  const tierFg = BALANCE_TIER_FG_CLASSES[tier];

  const ytdMin = ytdAgg._sum.actualDurationMin ?? 0;
  const allTimeMin = allTimeAgg._sum.actualDurationMin ?? 0;

  // Pretty-print HDV as <h>h<mm> with the hour and minutes split for
  // independent typography (huge h, smaller mm subscript).
  const balanceHours = Math.floor(Math.max(balance, 0) / 60);
  const balanceMinutes = Math.max(balance, 0) % 60;
  const balanceSign = balance < 0 ? "−" : "";

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        {/* Greeting */}
        <header className="mb-10">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            {COPY.dashboard.welcome.replace(",", "")}
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            {session.user.name}
          </h1>
        </header>

        {/* Hero — HDV balance + actions, asymmetric */}
        <section
          aria-label="Solde HDV et actions rapides"
          className="grid gap-6 lg:grid-cols-[1.6fr_1fr]"
        >
          {/* Hero balance */}
          <Card tone="brand" className="relative overflow-hidden p-8 sm:p-10">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand/10 blur-3xl"
            />
            <div className="relative">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand-soft-fg/80">
                  {COPY.dashboard.balanceLabel}
                </p>
                <Badge variant="brand" size="sm">
                  <span aria-hidden="true">●</span>
                  {tierLabel}
                </Badge>
              </div>
              <p
                className={`font-display tabular mt-4 text-[clamp(4.5rem,14vw,7rem)] font-semibold leading-none tracking-tight ${tierFg}`}
              >
                {balanceSign}
                {balanceHours}
                <span className="text-text-strong/30">h</span>
                <span className="text-[0.5em] text-text-strong/70">
                  {balanceMinutes.toString().padStart(2, "0")}
                </span>
              </p>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-text-muted">
                Heures de vol disponibles. Achetez un forfait pour recharger
                votre compte ou réservez un créneau dès maintenant.
              </p>
            </div>
          </Card>

          {/* Quick actions */}
          <div className="flex flex-col gap-3">
            <Link href="/calendar" className="group">
              <Card className="flex items-center justify-between gap-4 transition-all duration-150 hover:border-brand-soft-border hover:shadow-md">
                <div>
                  <div className="flex items-center gap-2 text-text-strong">
                    <CalendarPlus
                      className="h-4 w-4 text-brand"
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold">
                      {COPY.dashboard.book}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    Choisissez un créneau libre
                  </p>
                </div>
                <ArrowRight
                  className="h-4 w-4 text-text-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand"
                  aria-hidden="true"
                />
              </Card>
            </Link>
            <Link href="/flights/new" className="group">
              <Card className="flex items-center justify-between gap-4 transition-all duration-150 hover:border-brand-soft-border hover:shadow-md">
                <div>
                  <div className="flex items-center gap-2 text-text-strong">
                    <PencilLine
                      className="h-4 w-4 text-brand"
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold">
                      {COPY.dashboard.logFlight}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    Carnet de bord après vol
                  </p>
                </div>
                <ArrowRight
                  className="h-4 w-4 text-text-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand"
                  aria-hidden="true"
                />
              </Card>
            </Link>
            <Link href="/account" className="group">
              <Card className="flex items-center justify-between gap-4 transition-all duration-150 hover:border-brand-soft-border hover:shadow-md">
                <div>
                  <div className="flex items-center gap-2 text-text-strong">
                    <Wallet
                      className="h-4 w-4 text-brand"
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold">
                      {COPY.dashboard.buyHdv}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    Recharger un forfait
                  </p>
                </div>
                <ArrowRight
                  className="h-4 w-4 text-text-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand"
                  aria-hidden="true"
                />
              </Card>
            </Link>
          </div>
        </section>

        {/* Stats strip — flush, no card wrapper */}
        <section
          aria-label="Statistiques personnelles"
          className="mt-12 grid grid-cols-3 gap-6 border-y border-border-subtle py-7 sm:gap-12"
        >
          <div>
            <div className="flex items-center gap-2 text-text-subtle">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="text-xs font-medium uppercase tracking-[0.12em]">
                HDV {new Date().getFullYear()}
              </span>
            </div>
            <p className="font-display tabular mt-2 text-3xl font-semibold tracking-tight text-text-strong sm:text-4xl">
              {formatHHMM(ytdMin)}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-text-subtle">
              <Plane className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="text-xs font-medium uppercase tracking-[0.12em]">
                Total HDV
              </span>
            </div>
            <p className="font-display tabular mt-2 text-3xl font-semibold tracking-tight text-text-strong sm:text-4xl">
              {formatHHMM(allTimeMin)}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-text-subtle">
              <span className="text-xs font-medium uppercase tracking-[0.12em]">
                Vols
              </span>
            </div>
            <p className="font-display tabular mt-2 text-3xl font-semibold tracking-tight text-text-strong sm:text-4xl">
              {totalFlights}
            </p>
          </div>
        </section>

        {/* Recent flights + transactions */}
        <div className="mt-12 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <section aria-labelledby="recent-flights-h">
            <div className="mb-4 flex items-baseline justify-between">
              <h2
                id="recent-flights-h"
                className="font-display text-2xl font-semibold tracking-tight text-text-strong"
              >
                {COPY.dashboard.recentFlights}
              </h2>
              <Link
                href="/flights"
                className="text-sm font-medium text-brand hover:text-brand-hover"
              >
                Tout voir →
              </Link>
            </div>
            {recentFlights.length === 0 ? (
              <Card tone="sunken">
                <p className="text-sm text-text-muted">
                  Aucun vol enregistré pour l&apos;instant.
                </p>
              </Card>
            ) : (
              <ul className="divide-y divide-border-subtle border-y border-border-subtle">
                {recentFlights.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-4 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 text-text-strong">
                        <span className="font-display text-lg font-semibold tabular">
                          {f.depAirport}
                        </span>
                        <span className="text-text-subtle">→</span>
                        <span className="font-display text-lg font-semibold tabular">
                          {f.arrAirport}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-text-muted tabular">
                        {formatDateFR(f.date)}
                      </p>
                    </div>
                    <p className="font-display tabular text-base font-semibold text-text-strong">
                      {formatHHMM(f.actualDurationMin)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="recent-tx-h">
            <h2
              id="recent-tx-h"
              className="font-display mb-4 text-2xl font-semibold tracking-tight text-text-strong"
            >
              {COPY.dashboard.recentTransactions}
            </h2>
            {recentTx.length === 0 ? (
              <Card tone="sunken">
                <p className="text-sm text-text-muted">
                  {COPY.account.transactionsEmpty}
                </p>
              </Card>
            ) : (
              <ul className="divide-y divide-border-subtle border-y border-border-subtle">
                {recentTx.map((t) => {
                  const isCredit = t.amountMin > 0;
                  return (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 py-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-text">
                          {COPY.txTypes[t.type]}
                        </p>
                        <p className="mt-0.5 text-xs text-text-subtle tabular">
                          {formatDateTimeFR(t.createdAt)}
                        </p>
                      </div>
                      <p
                        className={`tabular font-semibold ${
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
        </div>
      </div>
    </AppShell>
  );
}
