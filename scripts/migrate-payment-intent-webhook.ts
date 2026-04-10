// FlightSchedule — one-shot migration to switch the live Stripe webhook
// subscription from `checkout.session.completed` to the new
// `payment_intent.*` events used by the inline modal flow (delightful-
// chasing-wren plan §3.5).
//
// Also wipes any stranded PENDING test transactions left over from the
// pre-fix bootstrap, where each modal-open inserted a PENDING row even
// when the user never paid.
//
// Run once per environment:
//   corepack pnpm tsx scripts/migrate-payment-intent-webhook.ts
//
// Idempotent. Re-runs are safe — the script no-ops if the live webhook
// already has the right event list and there are no stranded pending
// rows.

import "dotenv/config";
import Stripe from "stripe";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const REQUIRED_EVENTS = [
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
] as const satisfies ReadonlyArray<Stripe.WebhookEndpointUpdateParams.EnabledEvent>;

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2025-09-30.clover" });
}

function getPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

async function updateWebhook(stripe: Stripe) {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://flightschedule.org";
  const webhookUrl = `${appUrl}/api/webhooks/stripe`;
  console.log(`\n→ Looking for webhook at ${webhookUrl}`);

  const list = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = list.data.find((w) => w.url === webhookUrl);

  if (!existing) {
    console.log("  No existing endpoint found. Run scripts/stripe-setup.ts to bootstrap a fresh one.");
    return;
  }

  const current = new Set(existing.enabled_events);
  const wanted = new Set(REQUIRED_EVENTS);
  const same =
    current.size === wanted.size &&
    [...wanted].every((e) => current.has(e));

  if (same) {
    console.log(`  ✓ Webhook ${existing.id} already subscribed to the correct events.`);
    return;
  }

  console.log(`  Updating webhook ${existing.id}`);
  console.log(`    from: ${[...current].join(", ") || "(none)"}`);
  console.log(`    to:   ${REQUIRED_EVENTS.join(", ")}`);
  await stripe.webhookEndpoints.update(existing.id, {
    enabled_events: [...REQUIRED_EVENTS],
    description: "FlightSchedule — payment intent lifecycle",
  });
  console.log("  ✓ Updated. Existing STRIPE_WEBHOOK_SECRET stays valid (signing secret is not rotated by .update).");
}

async function wipeStrandedPending(prisma: PrismaClient) {
  console.log("\n→ Cleaning up stranded PENDING transactions");

  const pending = await prisma.transaction.findMany({
    where: {
      status: "PENDING",
      type: "PACKAGE_PURCHASE",
    },
    select: {
      id: true,
      method: true,
      reference: true,
      createdAt: true,
      user: { select: { email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (pending.length === 0) {
    console.log("  ✓ No stranded PENDING rows.");
    return;
  }

  console.log(`  Found ${pending.length} PENDING rows. Listing:`);
  for (const row of pending) {
    console.log(
      `    - ${row.id} ${row.method ?? "?"} ${row.reference ?? "(no ref)"} ${row.user.email} ${row.createdAt.toISOString()}`,
    );
  }

  const result = await prisma.transaction.deleteMany({
    where: { id: { in: pending.map((p) => p.id) } },
  });
  console.log(`  ✓ Deleted ${result.count} stranded PENDING rows.`);
}

async function main() {
  console.log("FlightSchedule V2.1 — payment lifecycle migration");
  console.log("=================================================");

  const stripe = getStripe();
  const prisma = getPrisma();

  try {
    await updateWebhook(stripe);
    await wipeStrandedPending(prisma);
    console.log("\n✓ Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("\n✗ Migration failed:", err);
  process.exit(1);
});
