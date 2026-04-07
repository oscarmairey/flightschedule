// CAVOK — post-Stripe-Checkout success landing.
//
// The Stripe webhook is async — it might not have arrived by the time
// the user lands here. Show the current balance from the DB, and warn
// the user to refresh if it hasn't bumped yet.

import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatHHMM, balanceTier } from "@/lib/duration";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AppShell } from "@/components/AppShell";

export default async function CheckoutSuccessPage() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { hdvBalanceMin: true },
  });
  const balance = user?.hdvBalanceMin ?? 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-12 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{COPY.account.successTitle}</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {COPY.account.successBody}
            </p>
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                {COPY.dashboard.balanceLabel}
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {formatHHMM(balance)}
              </p>
              <Badge tier={balanceTier(balance)} className="mt-2">
                {balanceTier(balance) === "green"
                  ? "Solde confortable"
                  : balanceTier(balance) === "amber"
                    ? "Solde moyen"
                    : "Solde faible"}
              </Badge>
            </div>
            <p className="text-xs text-zinc-500">{COPY.account.successPending}</p>
            <Link href="/dashboard">
              <Button fullWidth>{COPY.account.backToDashboard}</Button>
            </Link>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
