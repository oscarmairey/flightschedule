// CAVOK — Stripe Checkout cancel landing.

import Link from "next/link";
import { requireSession } from "@/lib/session";
import { COPY } from "@/lib/copy";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AppShell } from "@/components/AppShell";

export default async function CheckoutCancelPage() {
  await requireSession();

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-12 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{COPY.account.cancelTitle}</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {COPY.account.cancelBody}
            </p>
            <Link href="/account">
              <Button fullWidth variant="secondary">
                {COPY.account.backToAccount}
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
