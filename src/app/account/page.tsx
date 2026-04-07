// FlySchedule — /account page.
//
// Pilot-facing landing for HDV packages and transaction history.
// PRD §3.1 (purchase) + §3.4.3 (transaction history).
//
// Packages render as a featured-then-secondary layout — not the
// identical-3-card-grid AI-template pattern.

import { Sparkles, ArrowRight, CircleUser } from "lucide-react";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { PACKAGES, getStripePriceId, type PackageKey } from "@/lib/stripe";
import { formatDateTimeFR } from "@/lib/format";
import { formatHHMMSigned, formatHHMM } from "@/lib/duration";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";
import { createCheckoutSession } from "./actions";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const transactions = await prisma.transaction.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const errorBanner =
    params.error === "stripe_not_configured"
      ? "Forfaits non configurés. Demandez à l'administrateur de finaliser la configuration Stripe."
      : params.error === "invalid_package"
        ? COPY.errors.invalidInput
        : null;

  // Identify the largest package as the "featured" one — it gets the
  // hero treatment, the others are listed inline below it.
  const packageKeys = Object.keys(PACKAGES) as PackageKey[];
  const sortedKeys = [...packageKeys].sort(
    (a, b) => PACKAGES[b].minutes - PACKAGES[a].minutes,
  );
  const featuredKey = sortedKeys[0];
  const otherKeys = sortedKeys.slice(1);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-10">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            <CircleUser className="h-4 w-4" aria-hidden="true" />
            {COPY.account.title}
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            {session.user.name}
          </h1>
          <p className="mt-2 text-base text-text-muted">{COPY.account.subtitle}</p>
        </header>

        {errorBanner && (
          <div className="mb-6">
            <Alert tone="error">{errorBanner}</Alert>
          </div>
        )}

        {/* Packages — featured + others */}
        <section className="mb-14">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong">
              {COPY.account.packages}
            </h2>
            <p className="text-xs text-text-subtle">{COPY.account.pkgVatNote}</p>
          </div>

          {/* Featured */}
          {featuredKey && (
            <FeaturedPackage packageKey={featuredKey} />
          )}

          {/* Others */}
          {otherKeys.length > 0 && (
            <ul className="mt-5 divide-y divide-border-subtle border-y border-border-subtle">
              {otherKeys.map((key) => (
                <PackageRow key={key} packageKey={key} />
              ))}
            </ul>
          )}
        </section>

        {/* Transaction history */}
        <section>
          <h2 className="font-display mb-5 text-2xl font-semibold tracking-tight text-text-strong">
            {COPY.account.transactions}
          </h2>
          {transactions.length === 0 ? (
            <Card tone="sunken">
              <p className="text-sm text-text-muted">
                {COPY.account.transactionsEmpty}
              </p>
            </Card>
          ) : (
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {transactions.map((t) => {
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

function FeaturedPackage({ packageKey }: { packageKey: PackageKey }) {
  const pkg = PACKAGES[packageKey];
  const configured = !!getStripePriceId(packageKey);
  const priceFmt = (pkg.priceCentsHT / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });

  return (
    <Card tone="brand" className="relative overflow-hidden p-7 sm:p-9">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/10 blur-3xl"
      />
      <div className="relative grid gap-6 sm:grid-cols-[1.5fr_1fr] sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-soft-fg">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Le plus avantageux
          </div>
          <h3 className="font-display mt-2 text-3xl font-semibold tracking-tight text-text-strong sm:text-4xl">
            {pkg.label}
          </h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-text-muted">
            {pkg.description}
          </p>
          <p className="font-display tabular mt-4 text-3xl font-semibold text-text-strong">
            {formatHHMM(pkg.minutes)}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="font-display tabular text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            {priceFmt}
          </p>
          <p className="mt-1 text-xs text-text-subtle">HT</p>
          <div className="mt-5">
            {configured ? (
              <form action={createCheckoutSession}>
                <input type="hidden" name="packageKey" value={packageKey} />
                <Button type="submit" size="lg" fullWidth>
                  {COPY.account.buy}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </form>
            ) : (
              <Button type="button" disabled fullWidth size="lg" variant="secondary">
                {COPY.account.pkgUnavailable}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function PackageRow({ packageKey }: { packageKey: PackageKey }) {
  const pkg = PACKAGES[packageKey];
  const configured = !!getStripePriceId(packageKey);
  const priceFmt = (pkg.priceCentsHT / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 py-5">
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-xl font-semibold tracking-tight text-text-strong">
          {pkg.label}
        </h3>
        <p className="mt-0.5 text-sm text-text-muted">
          <span className="font-display tabular font-semibold text-text">
            {formatHHMM(pkg.minutes)}
          </span>
          <span className="mx-2 text-text-subtle">·</span>
          {pkg.description}
        </p>
      </div>
      <div className="flex items-center gap-5">
        <p className="font-display tabular text-2xl font-semibold tracking-tight text-text-strong">
          {priceFmt}
          <span className="ml-1 text-xs font-normal text-text-subtle">HT</span>
        </p>
        {configured ? (
          <form action={createCheckoutSession}>
            <input type="hidden" name="packageKey" value={packageKey} />
            <Button type="submit" variant="secondary" size="sm">
              {COPY.account.buy}
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            disabled
            size="sm"
            variant="secondary"
          >
            {COPY.account.pkgUnavailable}
          </Button>
        )}
      </div>
    </li>
  );
}
