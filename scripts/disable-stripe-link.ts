// FlightSchedule — disable Stripe Link account-wide via the API.
//
// Why: even with `payment_method_types: ['card']` on the PaymentIntent,
// Stripe may still surface Link UI in places we don't control
// (Checkout, Customer Portal, payment recovery emails). Turning it off
// at the account level via the Payment Method Configurations API is
// the canonical fix.
//
// What this does:
//   1. Lists every active PaymentMethodConfiguration on the account
//      (usually one — the default).
//   2. For each, sets link.display_preference.preference = "off".
//   3. Prints a summary.
//
// Idempotent — re-runs are safe and just confirm Link is already off.
//
// Run once per environment:
//   corepack pnpm tsx scripts/disable-stripe-link.ts

import "dotenv/config";
import Stripe from "stripe";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2025-09-30.clover" });
}

async function main() {
  console.log("FlightSchedule — disable Stripe Link account-wide");
  console.log("==================================================");

  const stripe = getStripe();

  const list = await stripe.paymentMethodConfigurations.list({
    limit: 100,
  });

  if (list.data.length === 0) {
    console.log(
      "\nNo PaymentMethodConfigurations found on this account.",
    );
    console.log(
      "  → Stripe is using the legacy dashboard-only payment-method settings.",
    );
    console.log(
      "  → Disable Link manually at: https://dashboard.stripe.com/settings/payment_methods",
    );
    return;
  }

  console.log(`\nFound ${list.data.length} payment method configuration(s):\n`);

  for (const config of list.data) {
    const linkPref = config.link?.display_preference?.value ?? "(none)";
    const cardPref = config.card?.display_preference?.value ?? "(none)";
    console.log(
      `  ${config.id}${config.is_default ? " (default)" : ""} — ${config.name}`,
    );
    console.log(`    card.display_preference: ${cardPref}`);
    console.log(`    link.display_preference: ${linkPref}`);

    if (linkPref === "off") {
      console.log(`    ✓ Link already disabled`);
      continue;
    }

    console.log(`    → Updating link.display_preference.preference = "off"`);
    const updated = await stripe.paymentMethodConfigurations.update(config.id, {
      link: { display_preference: { preference: "off" } },
    });
    const newPref = updated.link?.display_preference?.value ?? "(none)";
    console.log(`    ✓ Updated. New link display_preference: ${newPref}`);
  }

  console.log("\n✓ Done.");
  console.log("\nNote: this only affects how Stripe surfaces Link in NEW");
  console.log("checkout sessions / payment intents. Existing Link accounts");
  console.log("for your customers continue to exist on Stripe's side — but");
  console.log("they won't be prompted to use Link in our flows anymore.");
}

main().catch((err) => {
  console.error("\n✗ Failed:", err);
  process.exit(1);
});
