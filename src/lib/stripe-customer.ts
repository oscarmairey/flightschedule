// FlightSchedule — Stripe Customer lifecycle helper.
//
// Lazy-creates a Stripe Customer the first time a pilot pays by card
// inline (via the PayPackageButton modal). The Customer ID is stored on
// `User.stripeCustomerId` so subsequent payments can:
//
//   - Attach/list saved payment methods for one-click reuse.
//   - Surface "Montant dépensé" reports without a per-payment metadata
//     hunt (the Customer groups every PaymentIntent / Charge server-side).
//
// The old Checkout Session flow passed `customer_email` and let Stripe
// create an ephemeral Customer per session. That pattern makes saved
// cards impossible, so we now create a stable Customer up front.

import { getStripe } from "@/lib/stripe";

/** Minimal surface the helper needs — satisfied by `prisma` and any `tx` client. */
type UserWriter = {
  user: {
    update: (args: {
      where: { id: string };
      data: { stripeCustomerId: string };
    }) => Promise<unknown>;
    findUnique: (args: {
      where: { id: string };
      select: { stripeCustomerId: true };
    }) => Promise<{ stripeCustomerId: string | null } | null>;
  };
};

/**
 * Resolve the Stripe Customer ID for a user, creating it on first use.
 *
 * The write back to `User.stripeCustomerId` is done with a plain `update`
 * (no enclosing transaction). We're not touching any HDV-affecting state
 * here — the worst-case race (two concurrent first-payments) results in
 * a second Customer being orphaned in Stripe, not in any balance drift.
 * The `@unique` constraint on the column catches the race at the DB
 * level if it ever happens.
 */
export async function getOrCreateStripeCustomer(
  db: UserWriter,
  user: { id: string; email: string; name: string; stripeCustomerId: string | null },
): Promise<string> {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: {
      flyUserId: user.id,
    },
  });

  try {
    await db.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customer.id },
    });
  } catch (err) {
    // If a concurrent payment won the race and stored its own customer id,
    // swallow the unique-violation — the orphan Customer will sit idle in
    // Stripe but does no harm. Re-read and return the winner.
    console.warn("[stripe-customer] Failed to persist customer id:", err);
    const refreshed = await db.user.findUnique({
      where: { id: user.id },
      select: { stripeCustomerId: true },
    });
    if (refreshed?.stripeCustomerId) {
      return refreshed.stripeCustomerId;
    }
    throw err;
  }

  return customer.id;
}
