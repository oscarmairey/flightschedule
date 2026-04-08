// FlightSchedule — Stripe SDK singleton.
//
// Pin the API version explicitly so a future SDK upgrade can't silently
// change webhook event shapes underneath us.
//
// All Stripe interactions go through this client. Webhook signature
// verification uses `stripe.webhooks.constructEvent` directly with the
// raw request body — see `src/app/api/webhooks/stripe/route.ts`.
//
// V2: HDV packages are stored in the `Package` Prisma model and managed
// from `/admin/tarifs`. The hardcoded PACKAGES const + env-var Price IDs
// were dropped; pilot purchase reads `Package.findMany({where: {isActive: true}})`.

import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  if (!STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  _stripe = new Stripe(STRIPE_SECRET_KEY, {
    // Pin to a known-good version. Bump explicitly when upgrading the SDK
    // and re-test the webhook end-to-end.
    apiVersion: "2025-09-30.clover",
    appInfo: {
      name: "FlightSchedule",
      version: "0.2.0",
    },
  });
  return _stripe;
}
