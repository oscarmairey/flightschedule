// FlightSchedule — pilot dashboard. V2.
//
// V2 layout (top-to-bottom):
//   1. Hero balance + tier (left) + 3 stat cards (right): HDV YTD, Total
//      HDV, Vols. The old quick action cards were dropped.
//   2. Forfaits HDV — purchase packages (uniform list, no featured row)
//   3. Historique des mouvements — full transaction history (50 rows)

import { Plane, TrendingUp } from "lucide-react";
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
import { formatDateTimeFR } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";
import { createCheckoutSession } from "./actions";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const startOfYear = new Date(`${new Date().getFullYear()}-01-01T00:00:00Z`);

  const [user, recentTx, ytdAgg, allTimeAgg, totalFlights, packages] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { hdvBalanceMin: true, name: true, role: true },
      }),
      prisma.transaction.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
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
      prisma.package.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

  const balance = user?.hdvBalanceMin ?? 0;
  const tier = balanceTier(balance);
  const tierLabel = BALANCE_TIER_LABELS[tier];
  const tierFg = BALANCE_TIER_FG_CLASSES[tier];

  const ytdMin = ytdAgg._sum.actualDurationMin ?? 0;
  const allTimeMin = allTimeAgg._sum.actualDurationMin ?? 0;

  const balanceHours = Math.floor(Math.max(balance, 0) / 60);
  const balanceMinutes = Math.max(balance, 0) % 60;
  const balanceSign = balance < 0 ? "−" : "";

  const errorBanner =
    params.error === "invalid_package"
      ? "Forfait invalide ou indisponible."
      : null;

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

        {errorBanner && (
          <div className="mb-6">
            <Alert tone="error">{errorBanner}</Alert>
          </div>
        )}

        {/* Hero — HDV balance + actions, asymmetric */}
        <section
          aria-label="Solde HDV et actions rapides"
          className="grid gap-6 lg:grid-cols-[1.6fr_1fr]"
        >
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
                Heures de vol disponibles. Réservez un créneau ou achetez un
                forfait pour recharger votre compte.
              </p>
            </div>
          </Card>

          <div className="flex flex-col gap-3">
            <Card className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-text-subtle">
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="text-xs font-medium uppercase tracking-[0.12em]">
                    HDV {new Date().getFullYear()}
                  </span>
                </div>
                <p className="font-display tabular mt-1 text-3xl font-semibold tracking-tight text-text-strong">
                  {formatHHMM(ytdMin)}
                </p>
              </div>
            </Card>
            <Card className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-text-subtle">
                  <Plane className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="text-xs font-medium uppercase tracking-[0.12em]">
                    Total HDV
                  </span>
                </div>
                <p className="font-display tabular mt-1 text-3xl font-semibold tracking-tight text-text-strong">
                  {formatHHMM(allTimeMin)}
                </p>
              </div>
            </Card>
            <Card className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-text-subtle">
                  <span className="text-xs font-medium uppercase tracking-[0.12em]">
                    Vols
                  </span>
                </div>
                <p className="font-display tabular mt-1 text-3xl font-semibold tracking-tight text-text-strong">
                  {totalFlights}
                </p>
              </div>
            </Card>
          </div>
        </section>

        {/* Forfaits HDV */}
        <section id="forfaits" className="mt-14 scroll-mt-20">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong">
              {COPY.dashboard.packages}
            </h2>
            <p className="text-xs text-text-subtle">
              {COPY.dashboard.pkgVatNote}
            </p>
          </div>

          {packages.length === 0 ? (
            <Card tone="sunken">
              <p className="text-sm text-text-muted">
                Aucun forfait disponible pour le moment. Contactez
                l&apos;administrateur.
              </p>
            </Card>
          ) : (
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {packages.map((pkg) => (
                <PackageRow key={pkg.id} pkg={pkg} />
              ))}
            </ul>
          )}
        </section>

        {/* Historique des mouvements */}
        <section className="mt-14">
          <h2 className="font-display mb-4 text-2xl font-semibold tracking-tight text-text-strong">
            {COPY.dashboard.transactions}
          </h2>
          {recentTx.length === 0 ? (
            <Card tone="sunken">
              <p className="text-sm text-text-muted">
                {COPY.dashboard.transactionsEmpty}
              </p>
            </Card>
          ) : (
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {recentTx.map((t) => {
                const isCredit = t.amountMin > 0;
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-4 py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">
                        {COPY.txTypes[t.type]}
                      </p>
                      <p className="mt-0.5 text-xs tabular text-text-subtle">
                        {formatDateTimeFR(t.createdAt)}
                      </p>
                    </div>
                    <p
                      className={`tabular text-base font-semibold ${
                        isCredit ? "text-success" : "text-text"
                      }`}
                    >
                      {formatHHMMSigned(t.amountMin)}
                    </p>
                    <p className="hidden tabular text-xs text-text-subtle sm:block">
                      → {formatHHMM(t.balanceAfterMin)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

type DashboardPackage = {
  id: string;
  name: string;
  description: string | null;
  priceCentsHT: number;
  hdvMinutes: number;
};

function PackageRow({ pkg }: { pkg: DashboardPackage }) {
  // Round to whole euros for the dashboard display per operator preference.
  const priceFmt = (pkg.priceCentsHT / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 py-5">
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-xl font-semibold tracking-tight text-text-strong">
          {pkg.name}
        </h3>
        <p className="mt-0.5 text-sm text-text-muted">
          <span className="font-display tabular font-semibold text-text">
            {formatHHMM(pkg.hdvMinutes)}
          </span>
          {pkg.description && (
            <>
              <span className="mx-2 text-text-subtle">·</span>
              {pkg.description}
            </>
          )}
        </p>
      </div>
      <div className="flex items-center gap-5">
        <p className="font-display tabular text-2xl font-semibold tracking-tight text-text-strong">
          {priceFmt}
          <span className="ml-1 text-xs font-normal text-text-subtle">HT</span>
        </p>
        <form action={createCheckoutSession}>
          <input type="hidden" name="packageId" value={pkg.id} />
          <Button type="submit" variant="secondary" size="sm">
            {COPY.dashboard.buy}
          </Button>
        </form>
      </div>
    </li>
  );
}
