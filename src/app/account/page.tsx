// CAVOK — /account page.
//
// Pilot-facing landing for HDV packages and transaction history.
// PRD §3.1 (purchase) + §3.4.3 (transaction history).

import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { PACKAGES, getStripePriceId, type PackageKey } from "@/lib/stripe";
import { formatDateTimeFR } from "@/lib/format";
import { formatHHMMSigned, formatHHMM } from "@/lib/duration";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
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

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">{COPY.account.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{COPY.account.subtitle}</p>
        </header>

        {errorBanner && (
          <div
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          >
            {errorBanner}
          </div>
        )}

        {/* Package catalog */}
        <section>
          <h2 className="mb-4 text-xl font-semibold">{COPY.account.packages}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {(Object.keys(PACKAGES) as PackageKey[]).map((key) => {
              const pkg = PACKAGES[key];
              const configured = !!getStripePriceId(key);
              return (
                <Card key={key}>
                  <CardHeader>
                    <CardTitle>{pkg.label}</CardTitle>
                    <CardDescription>{pkg.description}</CardDescription>
                  </CardHeader>
                  <div className="space-y-3">
                    <p className="text-3xl font-semibold">
                      {(pkg.priceCentsHT / 100).toLocaleString("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                      })}
                      <span className="ml-1 text-base font-normal text-zinc-500">HT</span>
                    </p>
                    <p className="text-sm text-zinc-500">{COPY.account.pkgVatNote}</p>
                    {configured ? (
                      <form action={createCheckoutSession}>
                        <input type="hidden" name="packageKey" value={key} />
                        <Button type="submit" fullWidth>
                          {COPY.account.buy} – {formatHHMM(pkg.minutes)}
                        </Button>
                      </form>
                    ) : (
                      <Button type="button" disabled fullWidth variant="secondary">
                        {COPY.account.pkgUnavailable}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Transaction history */}
        <section>
          <h2 className="mb-4 text-xl font-semibold">{COPY.account.transactions}</h2>
          {transactions.length === 0 ? (
            <Card>
              <p className="text-sm text-zinc-500">{COPY.account.transactionsEmpty}</p>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3 text-right">Montant</th>
                      <th className="px-4 py-3 text-right">Solde après</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {transactions.map((t) => (
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
              </div>
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}
