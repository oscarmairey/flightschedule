// CAVOK — Stripe SDK singleton.
//
// Pin the API version explicitly so a future SDK upgrade can't silently
// change webhook event shapes underneath us.
//
// All Stripe interactions go through this client. Webhook signature
// verification uses `stripe.webhooks.constructEvent` directly with the
// raw request body — see `src/app/api/webhooks/stripe/route.ts`.

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
      name: "CAVOK Glass Cockpit",
      version: "0.1.0",
    },
  });
  return _stripe;
}

/**
 * The three HDV packages defined in PRD §3.1.1, source-of-truth for
 * conversion between a package key and the credited HDV minutes.
 *
 * Prices in cents are HT (D3) — Stripe Tax computes 20% French VAT
 * on top at checkout. Stored here only for the setup script; the
 * webhook reads the credited minutes from `session.metadata.cavokHdvMin`
 * which is the load-bearing value (so a future price change can't
 * accidentally drift from the credited duration).
 */
export const PACKAGES = {
  starter: {
    key: "starter",
    label: "Starter",
    hours: 5,
    minutes: 5 * 60,
    priceCentsHT: 50000,
    description: "5 heures de vol — 100 €/h HT",
  },
  standard: {
    key: "standard",
    label: "Standard",
    hours: 10,
    minutes: 10 * 60,
    priceCentsHT: 90000,
    description: "10 heures de vol — 90 €/h HT (-10 %)",
  },
  premium: {
    key: "premium",
    label: "Premium",
    hours: 25,
    minutes: 25 * 60,
    priceCentsHT: 212500,
    description: "25 heures de vol — 85 €/h HT (-15 %)",
  },
} as const;

export type PackageKey = keyof typeof PACKAGES;

export function isPackageKey(value: string): value is PackageKey {
  return value === "starter" || value === "standard" || value === "premium";
}

/**
 * Resolve the Stripe Price ID for a package key. Reads from env vars
 * populated by `scripts/stripe-setup.ts`.
 */
export function getStripePriceId(key: PackageKey): string | null {
  const envName =
    key === "starter"
      ? "STRIPE_PRICE_STARTER"
      : key === "standard"
        ? "STRIPE_PRICE_STANDARD"
        : "STRIPE_PRICE_PREMIUM";
  const id = process.env[envName];
  return id && id.length > 0 ? id : null;
}
