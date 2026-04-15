// FlightSchedule — Stripe webhook fixture builder.
//
// The /api/webhooks/stripe route calls `stripe.webhooks.constructEvent`
// under the hood, which verifies an HMAC-SHA256 signature. Rather than
// mocking `constructEvent` (and thereby skipping rule #5's signature
// assertion), we sign real test payloads with the test webhook secret.

import crypto from "node:crypto";

export type CheckoutSessionFixtureInput = {
  sessionId: string;
  userId: string;
  hdvMinutes: number;
  amountTotalCents?: number;
  paymentStatus?: "paid" | "unpaid";
};

export function buildCheckoutSessionCompletedEvent(
  input: CheckoutSessionFixtureInput,
): string {
  const body = {
    id: `evt_${crypto.randomUUID()}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: input.sessionId,
        object: "checkout.session",
        payment_status: input.paymentStatus ?? "paid",
        amount_total: input.amountTotalCents ?? 18000,
        client_reference_id: input.userId,
        metadata: {
          flyUserId: input.userId,
          flyHdvMin: String(input.hdvMinutes),
        },
      },
    },
  };
  return JSON.stringify(body);
}

export type PaymentIntentFixtureInput = {
  paymentIntentId: string;
  userId: string;
  hdvMinutes: number;
  amountCents?: number;
};

export function buildPaymentIntentSucceededEvent(
  input: PaymentIntentFixtureInput,
): string {
  const body = {
    id: `evt_${crypto.randomUUID()}`,
    object: "event",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: input.paymentIntentId,
        object: "payment_intent",
        amount: input.amountCents ?? 18000,
        amount_received: input.amountCents ?? 18000,
        metadata: {
          flyUserId: input.userId,
          flyHdvMin: String(input.hdvMinutes),
        },
      },
    },
  };
  return JSON.stringify(body);
}

/**
 * Produce a Stripe-compatible `stripe-signature` header for the given
 * payload + secret. Mirrors the format
 *   t=<unix>,v1=<hmac-sha256(`${t}.${payload}`)>
 * that Stripe sends and `constructEvent` expects.
 */
export function signStripePayload(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}
