// FlightSchedule V2 — one-shot Stripe setup script.
//
// Run:
//   corepack pnpm tsx scripts/stripe-setup.ts
//
// What it does:
//   1. If the local `Package` table is empty, seed it with three default
//      packages (Starter / Standard / Premium) and create matching
//      Stripe Products + Prices, storing their IDs on the new rows.
//      After this seed, all package management happens via /admin/tarifs
//      and Stripe is mirrored from there — this script does NOT touch
//      existing rows on re-run.
//   2. Upserts the Stripe webhook endpoint pointing at /api/webhooks/stripe
//      and prints the new signing secret for the operator to paste into
//      .env (STRIPE_WEBHOOK_SECRET). Re-running rotates the secret.
//   3. Reminds the operator to enable Stripe Tax in the dashboard so
//      French VAT (20 %) is computed at checkout.
//
// Idempotent for the package seed step (only runs on empty DB). Always
// rotates the webhook secret on re-run because Stripe only returns the
// `secret` field on creation.

import "dotenv/config";
import Stripe from "stripe";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SECRET = process.env.STRIPE_SECRET_KEY;
if (!SECRET) {
  console.error("STRIPE_SECRET_KEY is not set in .env");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set in .env");
  process.exit(1);
}

const stripe = new Stripe(SECRET, {
  apiVersion: "2025-09-30.clover",
});

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const DEFAULT_PACKAGES = [
  {
    name: "Starter",
    description: "5 heures de vol — 100 €/h HT",
    hdvMinutes: 5 * 60,
    priceCentsHT: 50000,
    sortOrder: 30,
  },
  {
    name: "Standard",
    description: "10 heures de vol — 90 €/h HT (-10 %)",
    hdvMinutes: 10 * 60,
    priceCentsHT: 90000,
    sortOrder: 20,
  },
  {
    name: "Premium",
    description: "25 heures de vol — 85 €/h HT (-15 %)",
    hdvMinutes: 25 * 60,
    priceCentsHT: 212500,
    sortOrder: 10,
  },
] as const;

async function seedPackagesIfEmpty(): Promise<void> {
  const count = await prisma.package.count();
  if (count > 0) {
    console.log(
      `• ${count} package row(s) already exist — skipping seed (manage via /admin/tarifs).`,
    );
    return;
  }

  console.log("• Package table empty — seeding 3 default packages + Stripe sync");

  for (const pkg of DEFAULT_PACKAGES) {
    console.log(`  • ${pkg.name}: ${pkg.hdvMinutes / 60}h, ${pkg.priceCentsHT / 100}€ HT`);
    const product = await stripe.products.create({
      name: pkg.name,
      description: pkg.description,
      metadata: {
        flyHdvMin: String(pkg.hdvMinutes),
      },
    });
    const price = await stripe.prices.create({
      product: product.id,
      currency: "eur",
      unit_amount: pkg.priceCentsHT,
      tax_behavior: "exclusive",
      metadata: {
        flyHdvMin: String(pkg.hdvMinutes),
      },
    });
    await stripe.products.update(product.id, { default_price: price.id });

    await prisma.package.create({
      data: {
        stripeProductId: product.id,
        stripePriceId: price.id,
        name: pkg.name,
        description: pkg.description,
        priceCentsHT: pkg.priceCentsHT,
        hdvMinutes: pkg.hdvMinutes,
        sortOrder: pkg.sortOrder,
        isActive: true,
      },
    });
    console.log(`    ✓ Created Package + Stripe Product ${product.id} + Price ${price.id}`);
  }
}

/**
 * Upsert a webhook endpoint pointing at the public webhook URL. Returns
 * the endpoint's signing secret (`whsec_...`).
 *
 * Stripe only returns the `secret` field on CREATION — subsequent GETs
 * don't expose it. So if an endpoint already exists for our URL, we
 * delete + recreate to obtain a fresh secret. This is safe because the
 * webhook handler is idempotent (architectural rule #5).
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
    description: "FlightSchedule — checkout completion",
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
  console.log("FlightSchedule V2 — Stripe setup");
  console.log("=======================================\n");

  await seedPackagesIfEmpty();
  console.log("");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://flightschedule.org";
  const webhookUrl = `${appUrl}/api/webhooks/stripe`;
  console.log(`Webhook endpoint: ${webhookUrl}`);
  const webhookSecret = await upsertWebhookEndpoint(webhookUrl);
  console.log("");

  console.log("=======================================");
  console.log("ENV BLOCK — paste/overwrite in .env:\n");
  console.log(`STRIPE_WEBHOOK_SECRET="${webhookSecret}"`);
  console.log("");
  console.log("Then: docker compose up -d   # recreates the web container with new env");
  console.log("");
  console.log("REMINDER — Enable Stripe Tax in the dashboard:");
  console.log("  Stripe → Settings → Tax → Activate");
  console.log("  Set business address to France");
  console.log("  Confirm 20% VAT applies to standard goods/services\n");

  console.log(
    "::SETUP_RESULT::" +
      JSON.stringify({
        webhookSecret,
      }),
  );
}

main()
  .catch((err) => {
    console.error("Setup failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
