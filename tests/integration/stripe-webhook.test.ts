// Rule #5 — Stripe webhook idempotency + signature verification.
//
// Signs real HMAC payloads with the test webhook secret so we exercise
// `stripe.webhooks.constructEvent` end-to-end rather than mocking it.

import { describe, it, expect } from "vitest";
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";
import { NextRequest } from "next/server";
import { getTestPrisma } from "../setup/db";
import {
  makeUser,
  ensureStandardFlightHourType,
  getUserNetBalance,
} from "../setup/factories";
import {
  buildCheckoutSessionCompletedEvent,
  buildPaymentIntentSucceededEvent,
  signStripePayload,
} from "../setup/stripe-fixtures";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

function buildRequest(body: string, signature: string | null): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature) headers.set("stripe-signature", signature);
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers,
    body,
  });
}

async function fire(body: string): Promise<Response> {
  const sig = signStripePayload(body, WEBHOOK_SECRET);
  return stripeWebhook(buildRequest(body, sig));
}

describe("POST /api/webhooks/stripe — rule #5", () => {
  it("credits HDV on a valid checkout.session.completed", async () => {
    const prisma = getTestPrisma();
    const typeId = await ensureStandardFlightHourType();
    const user = await makeUser({ hdvBalanceMin: 0 });
    const body = buildCheckoutSessionCompletedEvent({
      sessionId: "cs_test_0001",
      userId: user.id,
      hdvMinutes: 300,
      flightHourTypeId: typeId,
      amountTotalCents: 18000,
    });

    const res = await fire(body);
    expect(res.status).toBe(200);

    expect(await getUserNetBalance(user.id)).toBe(300);

    const tx = await prisma.transaction.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(tx.type).toBe("PACKAGE_PURCHASE");
    expect(tx.amountMin).toBe(300);
    expect(tx.reference).toBe("cs_test_0001");
    expect(tx.priceCents).toBe(18000);
    expect(tx.flightHourTypeId).toBe(typeId);
  });

  it("is idempotent on a replay of the same session", async () => {
    const prisma = getTestPrisma();
    const typeId = await ensureStandardFlightHourType();
    const user = await makeUser();
    const body = buildCheckoutSessionCompletedEvent({
      sessionId: "cs_test_replay",
      userId: user.id,
      hdvMinutes: 120,
      flightHourTypeId: typeId,
    });

    const a = await fire(body);
    const b = await fire(body);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const txs = await prisma.transaction.findMany({
      where: { userId: user.id },
    });
    expect(txs).toHaveLength(1);

    expect(await getUserNetBalance(user.id)).toBe(120);
  });

  it("rejects a tampered payload with 400", async () => {
    const typeId = await ensureStandardFlightHourType();
    const user = await makeUser();
    const body = buildCheckoutSessionCompletedEvent({
      sessionId: "cs_test_tamper",
      userId: user.id,
      hdvMinutes: 300,
      flightHourTypeId: typeId,
    });
    // Sign a DIFFERENT body then swap the request body out.
    const sig = signStripePayload(body, WEBHOOK_SECRET);
    const req = buildRequest(body + " ", sig); // extra byte invalidates HMAC

    const res = await stripeWebhook(req);
    expect(res.status).toBe(400);

    expect(await getUserNetBalance(user.id)).toBe(0);
  });

  it("rejects when the stripe-signature header is missing", async () => {
    const typeId = await ensureStandardFlightHourType();
    const body = buildCheckoutSessionCompletedEvent({
      sessionId: "cs_test_nosig",
      userId: (await makeUser()).id,
      hdvMinutes: 60,
      flightHourTypeId: typeId,
    });
    const req = buildRequest(body, null);
    const res = await stripeWebhook(req);
    expect(res.status).toBe(400);
  });

  it("skips unpaid checkout sessions silently", async () => {
    const prisma = getTestPrisma();
    const typeId = await ensureStandardFlightHourType();
    const user = await makeUser();
    const body = buildCheckoutSessionCompletedEvent({
      sessionId: "cs_test_unpaid",
      userId: user.id,
      hdvMinutes: 300,
      flightHourTypeId: typeId,
      paymentStatus: "unpaid",
    });
    const res = await fire(body);
    expect(res.status).toBe(200);
    const txs = await prisma.transaction.count({ where: { userId: user.id } });
    expect(txs).toBe(0);
  });

  it("ignores payment_intents without FS metadata", async () => {
    const prisma = getTestPrisma();
    // PI with no flyUserId / flyHdvMin — simulating an unrelated PI
    // (e.g. operator testing from Stripe dashboard).
    const body = JSON.stringify({
      id: "evt_test_foreign",
      object: "event",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_foreign",
          object: "payment_intent",
          amount: 1000,
          metadata: {},
        },
      },
    });
    const res = await fire(body);
    expect(res.status).toBe(200);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("credits via payment_intent.succeeded path as well", async () => {
    const typeId = await ensureStandardFlightHourType();
    const user = await makeUser();
    const body = buildPaymentIntentSucceededEvent({
      paymentIntentId: "pi_test_0001",
      userId: user.id,
      hdvMinutes: 180,
      flightHourTypeId: typeId,
      amountCents: 9000,
    });
    const res = await fire(body);
    expect(res.status).toBe(200);
    expect(await getUserNetBalance(user.id)).toBe(180);
  });
});
