// CAVOK — server actions for /account.
//
// Currently exposes one action: createCheckoutSession. The pilot picks
// a package on /account and is redirected to Stripe Checkout. The webhook
// at /api/webhooks/stripe credits HDV when payment completes.

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import {
  getStripe,
  getStripePriceId,
  isPackageKey,
  PACKAGES,
  type PackageKey,
} from "@/lib/stripe";

const PackageKeySchema = z.string().refine(isPackageKey, "Forfait invalide");

export async function createCheckoutSession(formData: FormData) {
  const session = await requireSession();
  const packageKeyRaw = formData.get("packageKey");

  const parsed = PackageKeySchema.safeParse(packageKeyRaw);
  if (!parsed.success) {
    redirect("/account?error=invalid_package");
  }
  const packageKey = parsed.data as PackageKey;
  const pkg = PACKAGES[packageKey];

  const priceId = getStripePriceId(packageKey);
  if (!priceId) {
    // The Stripe Price IDs aren't populated in .env yet — the operator
    // needs to run scripts/stripe-setup.ts and paste the IDs.
    redirect("/account?error=stripe_not_configured");
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  const stripe = getStripe();
  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: session.user.email,
    client_reference_id: session.user.id,
    // The webhook reads cavokHdvMin to know how many minutes to credit.
    // Storing it explicitly (rather than re-deriving from the package
    // key) means a future price/duration change can't drift the credit.
    metadata: {
      cavokPackageKey: packageKey,
      cavokHdvMin: String(pkg.minutes),
      cavokUserId: session.user.id,
    },
    automatic_tax: { enabled: true },
    success_url: `${appUrl}/account/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/account/checkout/cancel`,
  });

  if (!checkout.url) {
    throw new Error("Stripe did not return a checkout URL");
  }

  redirect(checkout.url);
}
