// FlightSchedule — Stripe webhook handler.
//
// LOAD-BEARING ARCHITECTURAL RULE #5:
//
//   Idempotency. Stripe RETRIES webhook deliveries on any non-2xx
//   response or timeout. The handler MUST return 200 even if it has
//   already credited a session, otherwise the pilot gets double-credited.
//
//   We achieve idempotency by checking for an existing
//   PACKAGE_PURCHASE Transaction with `reference = session.id` BEFORE
//   crediting. The Transaction.reference field has an index for this
//   exact lookup (see prisma/schema.prisma).
//
// IMPLEMENTATION NOTES:
//
//   - The signature verification needs the RAW request body. Use
//     `await request.text()` — never `request.json()`. Calling json
//     parses and discards the bytes, breaking the HMAC check.
//   - The proxy.ts matcher excludes /api/webhooks/* so this route is
//     reached without redirect (see Phase 0 fix).
//   - Body size cap: Stripe events are tiny (< 50 KB typically). We
//     reject anything over 1 MB as a paranoid DoS guard.
//   - Logs are in English (CLAUDE.md convention).

import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { applyHdvMutation } from "@/lib/hdv";
import type Stripe from "stripe";

const MAX_BODY_BYTES = 1_000_000;

export async function POST(request: NextRequest) {
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let body: string;
  try {
    body = await request.text();
  } catch (err) {
    console.error("[stripe-webhook] Failed to read body:", err);
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }

  if (body.length > MAX_BODY_BYTES) {
    console.warn(`[stripe-webhook] Rejecting oversized body (${body.length} bytes)`);
    return NextResponse.json({ error: "Body too large" }, { status: 413 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[stripe-webhook] Signature verification failed:", message);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      default:
        console.log(`[stripe-webhook] Ignoring event ${event.type}`);
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] Handler failed for ${event.type}:`, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") {
    console.log(
      `[stripe-webhook] Skipping ${session.id}: payment_status=${session.payment_status}`,
    );
    return;
  }

  const userId = session.client_reference_id ?? session.metadata?.flyUserId;
  const minutesRaw = session.metadata?.flyHdvMin;

  if (!userId || !minutesRaw) {
    console.error(
      `[stripe-webhook] Missing metadata on ${session.id}: userId=${userId} minutes=${minutesRaw}`,
    );
    return;
  }

  const minutes = Number(minutesRaw);
  if (!Number.isInteger(minutes) || minutes <= 0) {
    console.error(`[stripe-webhook] Invalid flyHdvMin on ${session.id}: ${minutesRaw}`);
    return;
  }

  // Idempotency + credit in a single Serializable transaction.
  //
  // LOAD-BEARING: the idempotency check MUST run inside the same
  // transaction as the insert. Previously the check was outside the
  // transaction, creating a TOCTOU race — two concurrent webhook
  // deliveries could both pass the check before either inserted,
  // resulting in double-crediting.
  //
  // Under Serializable isolation, Postgres aborts one of the concurrent
  // transactions with a serialization failure (P2034). Stripe retries
  // on the resulting 500, and the retry hits the idempotent skip path.
  const credited = await prisma.$transaction(
    async (tx) => {
      // Idempotency check (rule #5).
      const existing = await tx.transaction.findFirst({
        where: {
          reference: session.id,
          type: "PACKAGE_PURCHASE",
        },
        select: { id: true },
      });

      if (existing) {
        console.log(`[stripe-webhook] Idempotent skip — already credited ${session.id}`);
        return false;
      }

      // Verify the user still exists and is active. We don't refund
      // here — the operator handles edge cases via Stripe dashboard.
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, isActive: true },
      });
      if (!user) {
        throw new Error(`User ${userId} not found for session ${session.id}`);
      }
      if (!user.isActive) {
        console.warn(
          `[stripe-webhook] Crediting deactivated user ${userId} (session ${session.id}). Operator should reconcile.`,
        );
      }

      await applyHdvMutation(tx, {
        userId,
        type: "PACKAGE_PURCHASE",
        amountMin: minutes,
        reference: session.id,
        performedById: userId,
        // amount_total is in cents, VAT-inclusive (Stripe Tax). For
        // "Montant dépensé" reporting (admin pilots table), this is what
        // the pilot was actually charged.
        priceCents: session.amount_total ?? null,
      });

      return true;
    },
    { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 },
  );

  if (credited) {
    console.log(
      `[stripe-webhook] Credited ${minutes} min to user ${userId} for session ${session.id}`,
    );
  }
}

/**
 * Safety net for inline card payments (PayPackageButton modal).
 *
 * The happy path credits HDV via `finalizeCardPayment` server action on
 * the dashboard — the webhook is only reached when the pilot closes the
 * browser mid-confirm, or when `finalizeCardPayment` throws. Both paths
 * use the same idempotency key (PaymentIntent ID as
 * `Transaction.reference`), so the webhook can fire any number of
 * times without double-crediting.
 *
 * The metadata shape is set by `createCardPaymentIntent` — it mirrors
 * the Checkout Session metadata (flyUserId / flyHdvMin / flyPackageId)
 * so the two handlers share the same logic.
 */
async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  const userId = pi.metadata?.flyUserId;
  const minutesRaw = pi.metadata?.flyHdvMin;

  if (!userId || !minutesRaw) {
    // Not one of ours — could be a PI created outside the app (e.g.
    // from the Stripe dashboard during testing). Ignore silently.
    console.log(
      `[stripe-webhook] Ignoring payment_intent ${pi.id} — missing FS metadata`,
    );
    return;
  }

  const minutes = Number(minutesRaw);
  if (!Number.isInteger(minutes) || minutes <= 0) {
    console.error(
      `[stripe-webhook] Invalid flyHdvMin on ${pi.id}: ${minutesRaw}`,
    );
    return;
  }

  const credited = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.transaction.findFirst({
        where: { reference: pi.id, type: "PACKAGE_PURCHASE" },
        select: { id: true },
      });
      if (existing) {
        console.log(
          `[stripe-webhook] Idempotent skip — already credited ${pi.id}`,
        );
        return false;
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, isActive: true },
      });
      if (!user) {
        throw new Error(`User ${userId} not found for payment_intent ${pi.id}`);
      }
      if (!user.isActive) {
        console.warn(
          `[stripe-webhook] Crediting deactivated user ${userId} (pi ${pi.id}). Operator should reconcile.`,
        );
      }

      await applyHdvMutation(tx, {
        userId,
        type: "PACKAGE_PURCHASE",
        amountMin: minutes,
        reference: pi.id,
        performedById: userId,
        priceCents: pi.amount_received ?? pi.amount,
      });

      return true;
    },
    { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 },
  );

  if (credited) {
    console.log(
      `[stripe-webhook] Credited ${minutes} min to user ${userId} for payment_intent ${pi.id}`,
    );
  }
}
