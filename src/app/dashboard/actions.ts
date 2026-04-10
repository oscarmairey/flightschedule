// FlightSchedule — server actions for /dashboard.
//
// V2.1: the pilot purchase flow is no longer a full-page Stripe Checkout
// redirect. Instead, the PayPackageButton modal offers two inline tabs:
//
//   - Card: Stripe Elements (deferred PaymentIntent pattern). The PI is
//     created only when the pilot clicks "Pay", so an opened-and-closed
//     modal never strands a ghost row in our DB.
//   - Bank transfer: async payment with admin validation. Pilot gets an
//     IBAN + a unique "FS-XXXXXX" reference code to put in the wire memo;
//     a PENDING `BankTransfer` row is written when they confirm they sent
//     the wire.
//
// The legacy `createCheckoutSession` is still exported so any in-flight
// Stripe-hosted checkout URL from before the cutover continues to work,
// but new purchases go through the modal.

"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/stripe-customer";
import { applyHdvMutation } from "@/lib/hdv";
import { UuidSchema } from "@/lib/validation";
import { computePriceCentsTTC } from "@/lib/pricing";
import { generatePaymentRef } from "@/lib/payment-ref";
import { COPY } from "@/lib/copy";

// ────────────────────────────────────────────────────────────────────
// Types returned to the client — re-exported by PayPackageButton.
// ────────────────────────────────────────────────────────────────────

export type SavedCard = {
  id: string; // Stripe PaymentMethod ID
  brand: string; // "visa", "mastercard", "amex", ...
  last4: string;
  expMonth: number;
  expYear: number;
};

export type PrepareCardCheckoutOk = {
  ok: true;
  amountCents: number; // TTC (includes 20% VAT)
  billingName: string;
  billingEmail: string;
  savedCards: SavedCard[];
};

export type PrepareCardCheckoutErr = { ok: false; error: string };
export type PrepareCardCheckoutResult =
  | PrepareCardCheckoutOk
  | PrepareCardCheckoutErr;

export type CreateCardPaymentIntentOk = {
  ok: true;
  clientSecret: string;
  paymentIntentId: string;
};
export type CreateCardPaymentIntentErr = { ok: false; error: string };
export type CreateCardPaymentIntentResult =
  | CreateCardPaymentIntentOk
  | CreateCardPaymentIntentErr;

export type PrepareBankTransferOk = {
  ok: true;
  reference: string;
  hdvMinutes: number;
  amountCents: number; // TTC
  bank: {
    holderName: string;
    iban: string;
    bic: string;
    bankName: string | null;
    instructions: string | null;
  };
};
export type PrepareBankTransferErr = { ok: false; error: string };
export type PrepareBankTransferResult =
  | PrepareBankTransferOk
  | PrepareBankTransferErr;

export type ConfirmBankTransferOk = { ok: true; reference: string };
export type ConfirmBankTransferErr = { ok: false; error: string };
export type ConfirmBankTransferResult =
  | ConfirmBankTransferOk
  | ConfirmBankTransferErr;

// ────────────────────────────────────────────────────────────────────
// Legacy Checkout Session (still used during transition). Kept for
// compatibility with any pre-cutover link. New purchases flow through
// the modal actions below.
// ────────────────────────────────────────────────────────────────────

export async function createCheckoutSession(formData: FormData) {
  const session = await requireSession();

  const idResult = UuidSchema.safeParse(formData.get("packageId"));
  if (!idResult.success) {
    redirect("/dashboard?error=invalid_package");
  }

  const pkg = await prisma.package.findUnique({
    where: { id: idResult.data },
    select: {
      id: true,
      name: true,
      hdvMinutes: true,
      isActive: true,
      stripePriceId: true,
    },
  });
  if (!pkg || !pkg.isActive) {
    redirect("/dashboard?error=invalid_package");
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  const stripe = getStripe();
  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: pkg.stripePriceId, quantity: 1 }],
    customer_email: session.user.email,
    client_reference_id: session.user.id,
    metadata: {
      flyPackageId: pkg.id,
      flyHdvMin: String(pkg.hdvMinutes),
      flyUserId: session.user.id,
    },
    automatic_tax: { enabled: true },
    success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/checkout/cancel`,
  });

  if (!checkout.url) {
    throw new Error("Stripe did not return a checkout URL");
  }

  redirect(checkout.url);
}

// ────────────────────────────────────────────────────────────────────
// Card tab — deferred PaymentIntent pattern
// ────────────────────────────────────────────────────────────────────

/** Loaded on card-tab mount. No PaymentIntent is created yet. */
export async function prepareCardCheckout(
  packageId: string,
): Promise<PrepareCardCheckoutResult> {
  const session = await requireSession();

  const idResult = UuidSchema.safeParse(packageId);
  if (!idResult.success) {
    return { ok: false, error: COPY.errors.invalidInput };
  }

  const [pkg, user] = await Promise.all([
    prisma.package.findUnique({
      where: { id: idResult.data },
      select: { id: true, isActive: true, priceCentsHT: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        stripeCustomerId: true,
      },
    }),
  ]);
  if (!pkg || !pkg.isActive) {
    return { ok: false, error: COPY.errors.notFound };
  }
  if (!user) {
    return { ok: false, error: COPY.errors.forbidden };
  }

  const customerId = await getOrCreateStripeCustomer(prisma, user);

  const stripe = getStripe();
  const pms = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
    limit: 10,
  });

  const savedCards: SavedCard[] = pms.data
    .filter((pm) => pm.card)
    .map((pm) => ({
      id: pm.id,
      brand: pm.card!.brand,
      last4: pm.card!.last4,
      expMonth: pm.card!.exp_month,
      expYear: pm.card!.exp_year,
    }));

  return {
    ok: true,
    amountCents: computePriceCentsTTC(pkg.priceCentsHT),
    billingName: user.name,
    billingEmail: user.email,
    savedCards,
  };
}

/** Called on "Pay" click — creates the PI that the Elements confirm step needs. */
export async function createCardPaymentIntent(
  packageId: string,
): Promise<CreateCardPaymentIntentResult> {
  const session = await requireSession();

  const idResult = UuidSchema.safeParse(packageId);
  if (!idResult.success) {
    return { ok: false, error: COPY.errors.invalidInput };
  }

  const [pkg, user] = await Promise.all([
    prisma.package.findUnique({
      where: { id: idResult.data },
      select: { id: true, isActive: true, priceCentsHT: true, hdvMinutes: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        stripeCustomerId: true,
      },
    }),
  ]);
  if (!pkg || !pkg.isActive) {
    return { ok: false, error: COPY.errors.notFound };
  }
  if (!user) {
    return { ok: false, error: COPY.errors.forbidden };
  }

  const customerId = await getOrCreateStripeCustomer(prisma, user);

  const stripe = getStripe();
  const pi = await stripe.paymentIntents.create({
    amount: computePriceCentsTTC(pkg.priceCentsHT),
    currency: "eur",
    customer: customerId,
    payment_method_types: ["card"],
    // setup_future_usage is set per-confirm via `handleNewCardSubmit` on
    // the client — leaving it unset here keeps the PI usable both for
    // "one-off" and "save card" flows without branching.
    metadata: {
      flyPackageId: pkg.id,
      flyHdvMin: String(pkg.hdvMinutes),
      flyUserId: user.id,
    },
  });

  if (!pi.client_secret) {
    return { ok: false, error: COPY.errors.generic };
  }

  return {
    ok: true,
    clientSecret: pi.client_secret,
    paymentIntentId: pi.id,
  };
}

/**
 * Primary credit path for inline card payments. Called after Stripe has
 * confirmed the PaymentIntent client-side. Verifies the PI server-side,
 * runs the idempotency check, credits HDV in a Serializable transaction.
 *
 * The Stripe webhook (`payment_intent.succeeded`) is the safety net: if
 * the pilot closes the browser before this action resolves, the webhook
 * fires the same idempotent credit path. Both use the PaymentIntent id
 * as the dedupe key, so double-crediting is impossible.
 */
export async function finalizeCardPayment(
  paymentIntentId: string,
  saveCard: boolean,
): Promise<void> {
  const session = await requireSession();

  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (pi.status !== "succeeded") {
    throw new Error(
      `finalizeCardPayment: PaymentIntent ${paymentIntentId} not succeeded (status=${pi.status})`,
    );
  }

  // Trust metadata over session for the user id lookup — the PI was
  // created by this same user under a server action that set the
  // metadata, so checking both is defense-in-depth.
  const metadataUserId = pi.metadata?.flyUserId;
  if (metadataUserId !== session.user.id) {
    throw new Error(
      `finalizeCardPayment: user mismatch (session=${session.user.id} metadata=${metadataUserId})`,
    );
  }

  const minutesRaw = pi.metadata?.flyHdvMin;
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new Error(
      `finalizeCardPayment: invalid flyHdvMin on ${paymentIntentId}: ${minutesRaw}`,
    );
  }

  await prisma.$transaction(
    async (tx) => {
      // Idempotency (rule #5) — keyed on the PI id.
      const existing = await tx.transaction.findFirst({
        where: { reference: pi.id, type: "PACKAGE_PURCHASE" },
        select: { id: true },
      });
      if (existing) {
        return;
      }

      await applyHdvMutation(tx, {
        userId: session.user.id,
        type: "PACKAGE_PURCHASE",
        amountMin: minutes,
        reference: pi.id,
        performedById: session.user.id,
        priceCents: pi.amount_received ?? pi.amount,
      });
    },
    { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 },
  );

  // Persist the payment method on the Customer for next time, if the
  // pilot opted in. Best-effort — a failure here doesn't affect the
  // already-credited HDV.
  if (saveCard && typeof pi.payment_method === "string") {
    try {
      const pm = await stripe.paymentMethods.retrieve(pi.payment_method);
      if (pm.customer == null && typeof pi.customer === "string") {
        await stripe.paymentMethods.attach(pm.id, { customer: pi.customer });
      }
    } catch (err) {
      console.warn("[finalizeCardPayment] attach PM failed:", err);
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// Bank tab — two-phase: prepare (no DB) → confirm (insert PENDING)
// ────────────────────────────────────────────────────────────────────

/**
 * Loads the bank account details and generates a reference code. No DB
 * write — the PENDING row is only inserted in `confirmBankTransfer`.
 */
export async function prepareBankTransfer(
  packageId: string,
): Promise<PrepareBankTransferResult> {
  await requireSession();

  const idResult = UuidSchema.safeParse(packageId);
  if (!idResult.success) {
    return { ok: false, error: COPY.errors.invalidInput };
  }

  const [pkg, bank] = await Promise.all([
    prisma.package.findUnique({
      where: { id: idResult.data },
      select: {
        id: true,
        isActive: true,
        priceCentsHT: true,
        hdvMinutes: true,
      },
    }),
    prisma.bankAccount.findFirst({
      orderBy: { updatedAt: "desc" },
      select: {
        iban: true,
        bic: true,
        holderName: true,
        bankName: true,
        instructions: true,
      },
    }),
  ]);

  if (!pkg || !pkg.isActive) {
    return { ok: false, error: COPY.errors.notFound };
  }
  if (!bank) {
    return { ok: false, error: COPY.payment.bankNotConfigured };
  }

  return {
    ok: true,
    reference: generatePaymentRef(),
    hdvMinutes: pkg.hdvMinutes,
    amountCents: computePriceCentsTTC(pkg.priceCentsHT),
    bank,
  };
}

/**
 * Insert a PENDING BankTransfer row. The `reference` argument is the
 * code we generated in `prepareBankTransfer` — but if a collision occurs
 * on the unique index, we regenerate and retry (up to 3 times). The
 * final reference is returned to the client so the UI can show the one
 * that actually made it into the DB.
 */
export async function confirmBankTransfer(
  packageId: string,
  reference: string,
): Promise<ConfirmBankTransferResult> {
  const session = await requireSession();

  const idResult = UuidSchema.safeParse(packageId);
  if (!idResult.success) {
    return { ok: false, error: COPY.errors.invalidInput };
  }

  const pkg = await prisma.package.findUnique({
    where: { id: idResult.data },
    select: {
      id: true,
      name: true,
      isActive: true,
      priceCentsHT: true,
      hdvMinutes: true,
    },
  });
  if (!pkg || !pkg.isActive) {
    return { ok: false, error: COPY.errors.notFound };
  }

  // Light validation of the reference format to reject obvious tampering.
  let nextRef = /^FS-[A-Z0-9]{6}$/.test(reference)
    ? reference
    : generatePaymentRef();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.bankTransfer.create({
        data: {
          userId: session.user.id,
          packageId: pkg.id,
          packageName: pkg.name,
          hdvMinutes: pkg.hdvMinutes,
          priceCentsTTC: computePriceCentsTTC(pkg.priceCentsHT),
          reference: nextRef,
          // status defaults to PENDING
        },
      });
      return { ok: true, reference: nextRef };
    } catch (err: unknown) {
      // P2002 = unique constraint violation (Prisma known error code)
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        nextRef = generatePaymentRef();
        continue;
      }
      throw err;
    }
  }

  return { ok: false, error: COPY.errors.generic };
}
