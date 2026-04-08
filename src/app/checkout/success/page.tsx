// FlightSchedule — post-Stripe-Checkout success landing.
//
// The Stripe webhook is async — it might not have arrived by the time
// the user lands here. Show the current balance from the DB, and warn
// the user to refresh if it hasn't bumped yet.

import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import {
  formatHHMM,
  balanceTier,
  BALANCE_TIER_FG_CLASSES,
  BALANCE_TIER_LABELS,
} from "@/lib/duration";
import { Card } from "@/components/ui/Card";
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
  const tier = balanceTier(balance);
  const tierFg = BALANCE_TIER_FG_CLASSES[tier];

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-14 sm:py-20">
        <div className="mb-8 inline-flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
          {COPY.checkout.successTitle}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-text-muted">
          {COPY.checkout.successBody}
        </p>

        <Card tone="brand" className="mt-8 p-7">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand-soft-fg/80">
            {COPY.dashboard.balanceLabel}
          </p>
          <p
            className={`font-display tabular mt-2 text-6xl font-semibold leading-none tracking-tight ${tierFg}`}
          >
            {formatHHMM(balance)}
          </p>
          <Badge tier={tier} className="mt-4">
            <span aria-hidden="true">●</span>
            {BALANCE_TIER_LABELS[tier]}
          </Badge>
        </Card>

        <p className="mt-6 text-xs leading-relaxed text-text-subtle">
          {COPY.checkout.successPending}
        </p>

        <Link href="/dashboard" className="mt-8 block">
          <Button fullWidth size="lg">
            {COPY.checkout.backToDashboard}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
      </div>
    </AppShell>
  );
}
