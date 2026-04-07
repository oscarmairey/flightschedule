// CAVOK — Stripe Checkout cancel landing.

import Link from "next/link";
import { XCircle, ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/session";
import { COPY } from "@/lib/copy";
import { Button } from "@/components/ui/Button";
import { AppShell } from "@/components/AppShell";

export default async function CheckoutCancelPage() {
  await requireSession();

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-14 sm:py-20">
        <div className="mb-8 inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-sunken text-text-muted">
          <XCircle className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
          {COPY.account.cancelTitle}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-text-muted">
          {COPY.account.cancelBody}
        </p>
        <Link href="/account" className="mt-8 block">
          <Button fullWidth size="lg" variant="secondary">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {COPY.account.backToAccount}
          </Button>
        </Link>
      </div>
    </AppShell>
  );
}
