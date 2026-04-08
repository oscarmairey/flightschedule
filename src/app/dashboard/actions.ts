// FlightSchedule — server actions for /dashboard.
//
// V2: pilot purchase flow lives on the dashboard (the /account page was
// removed). The pilot picks a Package from the dashboard's "Forfaits HDV"
// section and is redirected to Stripe Checkout. The webhook at
// /api/webhooks/stripe credits HDV when payment completes.

"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { UuidSchema } from "@/lib/validation";

export async function createCheckoutSession(formData: FormData) {
  const session = await requireSession();

  const idResult = UuidSchema.safeParse(formData.get("packageId"));
  if (!idResult.success) {
    redirect("/dashboard?error=invalid_package");
  }

  const pkg = await prisma.package.findUnique({
    where: { id: idResult.data },
    select: {
      id: true,
      name: true,
      hdvMinutes: true,
      isActive: true,
      stripePriceId: true,
    },
  });
  if (!pkg || !pkg.isActive) {
    redirect("/dashboard?error=invalid_package");
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  const stripe = getStripe();
  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: pkg.stripePriceId, quantity: 1 }],
    customer_email: session.user.email,
    client_reference_id: session.user.id,
    // The webhook reads flyHdvMin to know how many minutes to credit.
    // Storing it explicitly (rather than re-deriving from the package)
    // means a future price/duration change can't drift the credit.
    metadata: {
      flyPackageId: pkg.id,
      flyHdvMin: String(pkg.hdvMinutes),
      flyUserId: session.user.id,
    },
    automatic_tax: { enabled: true },
    success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/checkout/cancel`,
  });

  if (!checkout.url) {
    throw new Error("Stripe did not return a checkout URL");
  }

  redirect(checkout.url);
}
