// FlySchedule — one-shot Stripe Products + Prices setup script.
//
// Run:
//   corepack pnpm tsx scripts/stripe-setup.ts
//
// What it does:
//   1. For each package in src/lib/stripe.ts (PACKAGES), upserts a Stripe
//      Product keyed by metadata.cavok_package_key.
//   2. For each Product, ensures a Price in EUR exists with the right
//      amount (HT, per D3) and tax_behavior=exclusive. If a stale Price
//      with a different amount exists, archives it and creates a new one.
//   3. Prints the resulting Price IDs to stdout for the operator to
//      paste into .env (STRIPE_PRICE_STARTER, STRIPE_PRICE_STANDARD,
//      STRIPE_PRICE_PREMIUM).
//   4. Reminds the operator to enable Stripe Tax in the dashboard so
//      French VAT (20%) is computed at checkout.
//
// Idempotent: safe to re-run. Re-running:
//   - Updates Product names/descriptions if they changed
//   - Leaves matching Prices alone
//   - Replaces mismatched Prices (archives old, creates new)
//
// CRITICAL: this script writes to the Stripe TEST account (D1). When
// switching to live mode in Phase 7, swap STRIPE_SECRET_KEY for the
// live key and re-run. The metadata key stays the same so re-running
// against a fresh live account works first try.

import "dotenv/config";
import Stripe from "stripe";
import { PACKAGES } from "../src/lib/stripe";

const SECRET = process.env.STRIPE_SECRET_KEY;
if (!SECRET) {
  console.error("STRIPE_SECRET_KEY is not set in .env");
  process.exit(1);
}

const stripe = new Stripe(SECRET, {
  apiVersion: "2025-09-30.clover",
});

const METADATA_KEY = "cavok_package_key";

async function upsertProduct(pkg: (typeof PACKAGES)[keyof typeof PACKAGES]) {
  // Find existing by metadata. Stripe doesn't allow filtering by metadata
  // in product.list, so we list and filter in-memory. At three packages
  // this is fine.
  const existing = await stripe.products.list({ active: true, limit: 100 });
  const match = existing.data.find(
    (p) => p.metadata?.[METADATA_KEY] === pkg.key,
  );

  if (match) {
    if (
      match.name !== `FlySchedule ${pkg.label}` ||
      match.description !== pkg.description
    ) {
      await stripe.products.update(match.id, {
        name: `FlySchedule ${pkg.label}`,
        description: pkg.description,
      });
      console.log(`  ✓ Updated product ${match.id}`);
    } else {
      console.log(`  • Product ${match.id} already up to date`);
    }
    return match;
  }

  const created = await stripe.products.create({
    name: `FlySchedule ${pkg.label}`,
    description: pkg.description,
    metadata: {
      [METADATA_KEY]: pkg.key,
      cavok_minutes: String(pkg.minutes),
    },
  });
  console.log(`  ✓ Created product ${created.id}`);
  return created;
}

async function upsertPrice(
  product: Stripe.Product,
  pkg: (typeof PACKAGES)[keyof typeof PACKAGES],
): Promise<string> {
  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 10,
  });

  const match = prices.data.find(
    (p) =>
      p.unit_amount === pkg.priceCentsHT &&
      p.currency === "eur" &&
      p.tax_behavior === "exclusive",
  );

  if (match) {
    console.log(`  • Price ${match.id} already current (${pkg.priceCentsHT} cents HT)`);
    return match.id;
  }

  // Archive any stale prices for this product so the listing stays clean.
  for (const stale of prices.data) {
    await stripe.prices.update(stale.id, { active: false });
    console.log(`  ✗ Archived stale price ${stale.id}`);
  }

  const created = await stripe.prices.create({
    product: product.id,
    currency: "eur",
    unit_amount: pkg.priceCentsHT,
    tax_behavior: "exclusive",
    metadata: {
      [METADATA_KEY]: pkg.key,
      cavok_minutes: String(pkg.minutes),
    },
  });
  console.log(`  ✓ Created price ${created.id} (${pkg.priceCentsHT} cents HT)`);
  return created.id;
}

/**
 * Upsert a webhook endpoint pointing at the public webhook URL. Returns
 * the endpoint's signing secret (`whsec_...`).
 *
 * Stripe only returns the `secret` field on CREATION — subsequent GETs
 * don't expose it. So if an endpoint already exists for our URL, we
 * delete + recreate to obtain a fresh secret. This is safe because the
 * webhook handler is idempotent (architectural rule #5) and the only
 * subscriber to these events is our own backend.
 */
async function upsertWebhookEndpoint(webhookUrl: string): Promise<string> {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = endpoints.data.find((w) => w.url === webhookUrl);

  if (existing) {
    console.log(`  ✗ Deleting existing webhook ${existing.id} to rotate secret`);
    await stripe.webhookEndpoints.del(existing.id);
  }

  const created = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    enabled_events: ["checkout.session.completed"],
    description: "FlySchedule — checkout completion",
    metadata: { [METADATA_KEY]: "checkout" },
  });

  if (!created.secret) {
    throw new Error(
      "Stripe did not return a webhook signing secret on creation",
    );
  }
  console.log(`  ✓ Created webhook ${created.id}`);
  return created.secret;
}

async function main() {
  console.log("FlySchedule — Stripe products & prices setup");
  console.log("=======================================\n");

  const results: { key: string; envVar: string; priceId: string }[] = [];

  for (const pkg of Object.values(PACKAGES)) {
    console.log(`Package: ${pkg.label} (${pkg.hours}h, ${pkg.priceCentsHT / 100}€ HT)`);
    const product = await upsertProduct(pkg);
    const priceId = await upsertPrice(product, pkg);
    const envVar = `STRIPE_PRICE_${pkg.key.toUpperCase()}`;
    results.push({ key: pkg.key, envVar, priceId });
    console.log("");
  }

  // Webhook endpoint
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://flyschedule.org";
  const webhookUrl = `${appUrl}/api/webhooks/stripe`;
  console.log(`Webhook endpoint: ${webhookUrl}`);
  const webhookSecret = await upsertWebhookEndpoint(webhookUrl);
  console.log("");

  console.log("=======================================");
  console.log("ENV BLOCK — paste/overwrite in .env:\n");
  for (const r of results) {
    console.log(`${r.envVar}="${r.priceId}"`);
  }
  console.log(`STRIPE_WEBHOOK_SECRET="${webhookSecret}"`);
  console.log("");
  console.log("Then: docker compose up -d   # recreates the web container with new env");
  console.log("");
  console.log("REMINDER — Enable Stripe Tax in the dashboard:");
  console.log("  Stripe → Settings → Tax → Activate");
  console.log("  Set business address to France");
  console.log("  Confirm 20% VAT applies to standard goods/services\n");

  // Also emit a machine-readable JSON line at the very end so callers
  // can parse without scraping the human prose.
  console.log(
    "::SETUP_RESULT::" +
      JSON.stringify({
        prices: Object.fromEntries(results.map((r) => [r.envVar, r.priceId])),
        webhookSecret,
      }),
  );
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
