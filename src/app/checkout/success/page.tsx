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
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AppShell } from "@/components/AppShell";
import { HeroBalance } from "@/components/HeroBalance";

export default async function CheckoutSuccessPage() {
  const session = await requireSession();
  // V2.4: show the positive (active) wallet if any, otherwise fall back
  // to net. The Stripe webhook is async — if it hasn't fired yet the
  // pilot may still see their pre-purchase balance until refresh.
  const balances = await prisma.userFlightHourBalance.findMany({
    where: { userId: session.user.id },
    include: {
      flightHourType: { select: { name: true } },
    },
  });
  const positive = balances.find((b) => b.balanceMin > 0);
  const net = balances.reduce((acc, b) => acc + b.balanceMin, 0);
  const balance = positive?.balanceMin ?? net;
  const balanceLabel = positive
    ? `${COPY.dashboard.balanceLabel} · ${positive.flightHourType.name}`
    : COPY.dashboard.balanceLabel;

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
          <HeroBalance balanceMin={balance} label={balanceLabel} size="lg" />
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
