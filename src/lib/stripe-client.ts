// @ts-nocheck — WIP: depends on @stripe/stripe-js (not yet installed)
// FlightSchedule — Stripe.js (browser bundle) singleton loader.
//
// Imported only by the payment modal client component
// (`src/components/dashboard/PayPackageButton.tsx`). Never imported by
// anything that ends up in the edge-runtime proxy chain — see CLAUDE.md
// "Auth must be split into two files".
//
// `loadStripe` returns a Promise<Stripe | null>. We cache the promise
// at module level so a single page session pulls Stripe.js exactly
// once even if the modal is opened multiple times.

"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

let promise: Promise<Stripe | null> | null = null;

export function getStripeClient(): Promise<Stripe | null> {
  if (!promise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      // Surface a clear error in dev rather than silently breaking the
      // payment modal. The operator must set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
      // alongside STRIPE_SECRET_KEY in `.env`.
      console.error(
        "[stripe-client] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set",
      );
      promise = Promise.resolve(null);
    } else {
      promise = loadStripe(key);
    }
  }
  return promise;
}
