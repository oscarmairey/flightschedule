// FlightSchedule — pilot dashboard. V2.
//
// V2 layout (top-to-bottom):
//   1. Hero balance + tier (left) + 3 stat cards (right): HDV YTD, Total
//      HDV, Vols. The old quick action cards were dropped.
//   2. Forfaits HDV — purchase packages (uniform list, no featured row)
//   3. Historique des mouvements — full transaction history (50 rows)

import Link from "next/link";
import { Plane, TrendingUp, BookOpen } from "lucide-react";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatHHMM, formatHHMMSigned } from "@/lib/duration";
import { formatDateTimeFR } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";
import { HeroBalance } from "@/components/HeroBalance";
import { PayPackageButton } from "@/components/dashboard/PayPackageButton";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const startOfYear = new Date(`${new Date().getFullYear()}-01-01T00:00:00Z`);

  // Bank transfers visible on the dashboard: always PENDING ones (action
  // for the pilot — "wait for admin"), plus REJECTED ones from the last
  // 30 days (so the pilot sees the admin's refusal and the reason).
  // VALIDATED transfers disappear from this list — their resulting
  // Transaction row surfaces in the history section below instead.
  const thirtyDaysAgo = new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    user,
    recentTx,
    ytdAgg,
    allTimeAgg,
    totalFlights,
    packages,
    bankTransfers,
  ] = await Promise.all([
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
    prisma.bankTransfer.findMany({
      where: {
        userId: session.user.id,
        OR: [
          { status: "PENDING" },
          { status: "REJECTED", reviewedAt: { gte: thirtyDaysAgo } },
        ],
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Merge ledger transactions + in-flight bank transfers into a single
  // history feed, sorted by createdAt desc. A VALIDATED bank transfer
  // already shows up as a PACKAGE_PURCHASE row via `recentTx`, so the
  // `bankTransfers` query above is scoped to PENDING + recently
  // REJECTED to avoid double-rendering the same event.
  type HistoryRow =
    | { kind: "tx"; createdAt: Date; data: (typeof recentTx)[number] }
    | { kind: "bt"; createdAt: Date; data: (typeof bankTransfers)[number] };

  const historyRows: HistoryRow[] = [
    ...recentTx.map<HistoryRow>((t) => ({
      kind: "tx",
      createdAt: t.createdAt,
      data: t,
    })),
    ...bankTransfers.map<HistoryRow>((bt) => ({
      kind: "bt",
      createdAt: bt.createdAt,
      data: bt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const balance = user?.hdvBalanceMin ?? 0;

  const ytdMin = ytdAgg._sum.actualDurationMin ?? 0;
  const allTimeMin = allTimeAgg._sum.actualDurationMin ?? 0;

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
            {COPY.dashboard.welcome}
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
              <HeroBalance
                balanceMin={balance}
                label={COPY.dashboard.balanceLabel}
                size="xl"
              />
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-text-muted">
                {balance < 0
                  ? "Votre solde est négatif. Rechargez votre compte pour pouvoir réserver."
                  : "Heures de vol disponibles. Réservez un créneau ou achetez un forfait pour recharger votre compte."}
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
            <Link
              href="/flights"
              className="group block rounded-lg transition-colors"
              aria-label="Voir l'historique des vols"
            >
              <Card className="flex items-center justify-between gap-4 transition-colors group-hover:border-brand-soft-border">
                <div>
                  <div className="flex items-center gap-2 text-text-subtle">
                    <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="text-xs font-medium uppercase tracking-[0.12em]">
                      Vols
                    </span>
                  </div>
                  <p className="font-display tabular mt-1 text-3xl font-semibold tracking-tight text-text-strong">
                    {totalFlights}
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="text-text-subtle transition-colors group-hover:text-brand"
                >
                  →
                </span>
              </Card>
            </Link>
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

        {/* Historique des mouvements — regular ledger transactions MERGED
            with in-flight bank transfers (PENDING / recently REJECTED). A
            VALIDATED bank transfer becomes a regular PACKAGE_PURCHASE
            transaction row via the normal ledger path, so we filter out
            non-pending/rejected states here to avoid double-rendering. */}
        <section className="mt-14">
          <h2 className="font-display mb-4 text-2xl font-semibold tracking-tight text-text-strong">
            {COPY.dashboard.transactions}
          </h2>
          {historyRows.length === 0 ? (
            <Card tone="sunken">
              <p className="text-sm text-text-muted">
                {COPY.dashboard.transactionsEmpty}
              </p>
            </Card>
          ) : (
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {historyRows.map((row) => {
                if (row.kind === "tx") {
                  const t = row.data;
                  const isCredit = t.amountMin > 0;
                  return (
                    <li
                      key={`tx-${t.id}`}
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
                        → {formatHHMM(t.balanceAfterMin ?? 0)}
                      </p>
                    </li>
                  );
                }

                // Bank transfer row (PENDING or REJECTED). Amount and
                // balance-after are rendered muted because the money
                // hasn't landed in the ledger yet — the pill carries
                // the state.
                const bt = row.data;
                const isPending = bt.status === "PENDING";
                return (
                  <li
                    key={`bt-${bt.id}`}
                    className="flex items-start justify-between gap-4 py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-text">
                          {COPY.txTypes.BANK_TRANSFER}
                        </p>
                        <Badge
                          variant={isPending ? "warning" : "danger"}
                          size="sm"
                        >
                          {isPending ? "En attente" : "Refusé"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs tabular text-text-subtle">
                        <span className="font-mono">{bt.reference}</span>
                        <span className="mx-1.5">·</span>
                        {formatDateTimeFR(bt.createdAt)}
                      </p>
                      {bt.status === "REJECTED" && bt.rejectionNote && (
                        <p className="mt-1 text-xs text-danger">
                          {bt.rejectionNote}
                        </p>
                      )}
                    </div>
                    <p className="tabular text-base font-semibold text-text-subtle">
                      {formatHHMMSigned(bt.hdvMinutes)}
                    </p>
                    <p
                      aria-hidden="true"
                      className="hidden tabular text-xs text-text-subtle sm:block"
                    >
                      —
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
        <PayPackageButton
          pkg={{
            id: pkg.id,
            name: pkg.name,
            hdvMinutes: pkg.hdvMinutes,
            priceCentsHT: pkg.priceCentsHT,
          }}
        />
      </div>
    </li>
  );
}
