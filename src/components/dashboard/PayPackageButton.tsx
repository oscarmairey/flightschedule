// @ts-nocheck — WIP: depends on unfinished payment intent migration
// FlightSchedule — Pay-package modal trigger.
//
// V2.1 (delightful-chasing-wren plan §6) — replaces the
// `<form action={createCheckoutSession}>` redirect with an inline
// payment modal driven by Stripe Elements + a bank-transfer tab.
//
// Component layout:
//
//   <PayPackageButton />            ← server-rendered "Acheter" button
//     └ <Dialog>                    ← native <dialog>, opened imperatively
//         ├ <Tabs>                  ← simple two-button radio-group
//         │   ├ Carte
//         │   └ Virement bancaire
//         ├ <CardTabContent />      ← Stripe Elements form
//         └ <BankTabContent />      ← admin-managed bank details + ref code
//
// IMPORTANT — deferred PaymentIntent creation:
//
// We use Stripe's deferred client_secret pattern: Elements is mounted
// in `mode: 'payment'` with the amount + currency, and the
// PaymentIntent is created server-side ONLY when the pilot clicks
// "Pay". This is the difference between
//   modal-open → PI created → DB row → user closes → stranded PENDING
// and
//   modal-open → no PI → user clicks Pay → PI created → DB row → confirm
//
// Same principle applies to the bank tab: the PENDING row is created
// inside `handleConfirm`, never on modal open.
//
// All copy comes from `COPY.payment` so the modal stays French-only.

"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { COPY } from "@/lib/copy";
import { formatHHMM } from "@/lib/duration";
import { formatEuros } from "@/lib/pricing";
import { getStripeClient } from "@/lib/stripe-client";
import {
  prepareCardCheckout,
  createCardPaymentIntent,
  finalizeCardPayment,
  prepareBankTransfer,
  confirmBankTransfer,
  type PrepareCardCheckoutOk,
  type PrepareBankTransferOk,
  type SavedCard,
} from "@/app/dashboard/actions";

export type PayPackagePkg = {
  id: string;
  name: string;
  hdvMinutes: number;
  priceCentsHT: number;
};

type Tab = "card" | "bank";

export function PayPackageButton({ pkg }: { pkg: PayPackagePkg }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [tab, setTab] = useState<Tab>("card");
  const router = useRouter();

  // Reset state on close so a re-open of the same package starts fresh.
  const [openCount, setOpenCount] = useState(0);

  function open() {
    setTab("card");
    setOpenCount((c) => c + 1);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
    // Refresh the dashboard so the new pending/accepted row appears.
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={open}>
        {COPY.dashboard.buy}
      </Button>

      <Dialog ref={dialogRef} className="w-[min(calc(100vw-2rem),32rem)] p-0">
        <div key={openCount} className="flex flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 pb-4 pt-5">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-subtle">
                {COPY.payment.modalTitle}
              </p>
              <h2 className="font-display mt-1 text-xl font-semibold tracking-tight text-text-strong">
                {pkg.name}
              </h2>
              <p className="mt-0.5 text-sm tabular text-text-muted">
                {formatHHMM(pkg.hdvMinutes)}
                <span className="mx-1.5 text-text-subtle">·</span>
                {formatEuros(Math.round(pkg.priceCentsHT * 1.2))}
                <span className="ml-1 text-xs text-text-subtle">TTC</span>
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={COPY.common.closeDialog}
              className="rounded-md p-1 text-text-subtle hover:bg-surface-sunken hover:text-text"
            >
              ×
            </button>
          </header>

          <div className="flex items-center gap-1 border-b border-border-subtle px-6 py-3">
            <TabButton
              active={tab === "card"}
              onClick={() => setTab("card")}
              label={COPY.payment.tabCard}
            />
            <TabButton
              active={tab === "bank"}
              onClick={() => setTab("bank")}
              label={COPY.payment.tabBank}
            />
          </div>

          <div className="px-6 py-5">
            {tab === "card" ? (
              <CardTabContent pkg={pkg} onClose={close} />
            ) : (
              <BankTabContent pkg={pkg} onClose={close} />
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-10 rounded-md px-4 text-sm font-medium transition-colors ${
        active
          ? "bg-brand-soft text-brand-soft-fg"
          : "text-text-muted hover:bg-surface-sunken hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────
// Card tab — inline Stripe Elements (deferred client_secret pattern)
// ────────────────────────────────────────────────────────────────────

type CardTabState =
  | { kind: "loading" }
  | { kind: "ready"; prep: PrepareCardCheckoutOk }
  | { kind: "error"; message: string };

function CardTabContent({
  pkg,
  onClose,
}: {
  pkg: PayPackagePkg;
  onClose: () => void;
}) {
  const [state, setState] = useState<CardTabState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    prepareCardCheckout(pkg.id)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setState({ kind: "ready", prep: result });
        } else {
          setState({ kind: "error", message: result.error });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : COPY.errors.generic;
        setState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [pkg.id]);

  if (state.kind === "loading") {
    return (
      <p className="py-8 text-center text-sm text-text-muted">
        {COPY.common.loading}
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-danger">{state.message}</p>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          {COPY.payment.close}
        </Button>
      </div>
    );
  }

  return <CardTabLoaded pkg={pkg} prep={state.prep} onClose={onClose} />;
}

function CardTabLoaded({
  pkg,
  prep,
  onClose,
}: {
  pkg: PayPackagePkg;
  prep: PrepareCardCheckoutOk;
  onClose: () => void;
}) {
  // useState lazy initializer keeps the Promise stable across renders
  // without violating react-hooks/refs (which forbids accessing
  // useRef().current during render). getStripeClient() is itself
  // module-singleton, so this is just a per-component-mount cache.
  const [stripePromise] = useState(() => getStripeClient());

  return (
    <Elements
      stripe={stripePromise}
      options={{
        // Deferred mode: Elements knows the amount + currency up-front
        // but we don't have a clientSecret yet. The PaymentIntent is
        // created on Pay click via createCardPaymentIntent.
        mode: "payment",
        amount: prep.amountCents,
        currency: "eur",
        paymentMethodCreation: "manual",
        // Card-only: restricts PaymentElement to the card form. Without
        // this, Stripe shows every method enabled in the dashboard
        // (Klarna, Link, Bancontact, etc.). Must match the
        // payment_method_types passed to PaymentIntent server-side.
        paymentMethodTypes: ["card"],
        locale: "fr",
        appearance: { theme: "stripe" },
      }}
    >
      <CardTabForm pkg={pkg} prep={prep} onClose={onClose} />
    </Elements>
  );
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "success" }
  | { kind: "error"; message: string };

function CardTabForm({
  pkg,
  prep,
  onClose,
}: {
  pkg: PayPackagePkg;
  prep: PrepareCardCheckoutOk;
  onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [saveCard, setSaveCard] = useState(true);
  const [showNewCard, setShowNewCard] = useState(prep.savedCards.length === 0);
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });
  const [, startTransition] = useTransition();

  // Saved-card flow: skip Elements entirely and confirm directly with
  // a payment_method id.
  async function handleSavedCardPay(card: SavedCard) {
    if (!stripe) return;
    setSubmit({ kind: "processing" });

    const piResult = await createCardPaymentIntent(pkg.id);
    if (!piResult.ok) {
      setSubmit({ kind: "error", message: piResult.error });
      return;
    }

    const result = await stripe.confirmCardPayment(piResult.clientSecret, {
      payment_method: card.id,
    });
    if (result.error) {
      setSubmit({
        kind: "error",
        message: result.error.message ?? COPY.payment.cardErrorTitle,
      });
      return;
    }

    // Saved cards are already attached — no detach needed.
    startTransition(async () => {
      try {
        await finalizeCardPayment(piResult.paymentIntentId, true);
      } catch (err) {
        console.warn("[pay-package] finalizeCardPayment failed:", err);
      }
      router.refresh();
      setSubmit({ kind: "success" });
    });
  }

  // New-card flow: deferred client_secret pattern.
  // 1. elements.submit() validates the PaymentElement form.
  // 2. createCardPaymentIntent() creates the PI + PENDING DB row.
  // 3. stripe.confirmPayment with the new clientSecret completes the
  //    payment inline (redirect: 'if_required' avoids leaving the modal).
  async function handleNewCardSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmit({ kind: "processing" });

    // Validate the PaymentElement before creating the PI.
    const submitResult = await elements.submit();
    if (submitResult.error) {
      setSubmit({
        kind: "error",
        message: submitResult.error.message ?? COPY.payment.cardErrorTitle,
      });
      return;
    }

    const piResult = await createCardPaymentIntent(pkg.id);
    if (!piResult.ok) {
      setSubmit({ kind: "error", message: piResult.error });
      return;
    }

    const result = await stripe.confirmPayment({
      elements,
      clientSecret: piResult.clientSecret,
      confirmParams: {
        // return_url is required by Stripe even when redirect: 'if_required'
        // — it's only used if a 3DS redirect is unavoidable. Our
        // automatic_payment_methods.allow_redirects = "never" makes
        // that impossible, so the URL is essentially dead code.
        return_url: window.location.href,
        // PaymentElement is mounted with fields.billingDetails="never",
        // so Stripe REQUIRES we supply billing_details here at confirm
        // time. Without this, stripe.confirmPayment throws
        // IntegrationError client-side and the PaymentIntent stays in
        // requires_payment_method forever (no charge attempt is sent).
        // We pull name + email straight from the User row via prep.
        payment_method_data: {
          billing_details: {
            name: prep.billingName,
            email: prep.billingEmail,
          },
        },
      },
      redirect: "if_required",
    });
    if (result.error) {
      setSubmit({
        kind: "error",
        message: result.error.message ?? COPY.payment.cardErrorTitle,
      });
      return;
    }

    startTransition(async () => {
      try {
        await finalizeCardPayment(piResult.paymentIntentId, saveCard);
      } catch (err) {
        console.warn("[pay-package] finalizeCardPayment failed:", err);
      }
      router.refresh();
      setSubmit({ kind: "success" });
    });
  }

  if (submit.kind === "success") {
    return (
      <div className="space-y-4 py-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success-soft-fg">
          ✓
        </div>
        <div>
          <p className="font-display text-lg font-semibold text-text-strong">
            {COPY.payment.cardSuccessTitle}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {COPY.payment.cardSuccessBody}
          </p>
        </div>
        <Button type="button" onClick={onClose} fullWidth>
          {COPY.payment.close}
        </Button>
      </div>
    );
  }

  // The saved-card picker stays mounted across processing/error states
  // so an error from handleSavedCardPay can be shown inline next to
  // the buttons (rather than swapping the user into the new-card form
  // they didn't ask for).
  const showSavedCardPicker = prep.savedCards.length > 0 && !showNewCard;
  const isProcessing = submit.kind === "processing";

  return (
    <div className="space-y-4">
      {showSavedCardPicker ? (
        <div className="space-y-3">
          {prep.savedCards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => handleSavedCardPay(card)}
              disabled={isProcessing}
              className="flex w-full items-center justify-between rounded-md border border-border bg-surface-elevated px-4 py-3 text-left transition-colors hover:border-brand hover:bg-brand-soft/30 disabled:opacity-60"
            >
              <span>
                <span className="block text-sm font-medium text-text">
                  {COPY.payment.cardPay} {formatEuros(prep.amountCents)}
                </span>
                <span className="mt-0.5 block text-xs tabular text-text-subtle">
                  {prettyBrand(card.brand)} •••• {card.last4}
                  <span className="mx-1.5">·</span>
                  {String(card.expMonth).padStart(2, "0")}/
                  {String(card.expYear).slice(-2)}
                </span>
              </span>
              <span className="text-text-subtle">→</span>
            </button>
          ))}
          {submit.kind === "error" && (
            <p className="text-sm text-danger">{submit.message}</p>
          )}
          <button
            type="button"
            onClick={() => setShowNewCard(true)}
            className="text-sm font-medium text-brand hover:text-brand-hover"
          >
            {COPY.payment.cardUseAnother}
          </button>
        </div>
      ) : (
        <form onSubmit={handleNewCardSubmit} className="space-y-4">
          <PaymentElement
            options={{
              layout: "tabs",
              // Don't ask Stripe to collect billing details — we
              // already have email + name on the Customer.
              fields: { billingDetails: "never" },
            }}
          />

          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={saveCard}
              onChange={(e) => setSaveCard(e.target.checked)}
              className="h-4 w-4 rounded border-border text-brand focus:outline-none"
            />
            {COPY.payment.cardSaveLabel}
          </label>

          {submit.kind === "error" && (
            <p className="text-sm text-danger">{submit.message}</p>
          )}

          <Button
            type="submit"
            fullWidth
            disabled={!stripe || !elements || isProcessing}
          >
            {isProcessing
              ? COPY.payment.cardProcessing
              : `${COPY.payment.cardPay} ${formatEuros(prep.amountCents)}`}
          </Button>
        </form>
      )}
    </div>
  );
}

function prettyBrand(brand: string): string {
  // Stripe lowercases brand names ("visa", "mastercard", "amex"). Capitalize
  // for display.
  if (brand === "amex") return "AMEX";
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

// ────────────────────────────────────────────────────────────────────
// Bank tab — two-phase: prepare (no DB) → confirm (insert PENDING)
//
// The prepare call (no-op on the DB side) fires automatically as soon
// as the pilot switches to this tab — there's no intermediate "Voir
// les coordonnées" click. The PENDING row is still only created when
// the pilot clicks "J'ai effectué le virement".
// ────────────────────────────────────────────────────────────────────

type BankTabState =
  | { kind: "preparing" }
  | { kind: "details"; prep: PrepareBankTransferOk }
  | { kind: "registering"; prep: PrepareBankTransferOk }
  | {
      kind: "registered";
      prep: PrepareBankTransferOk;
      finalReference: string; // may differ from prep.reference if a collision retry happened
    }
  | { kind: "error"; message: string };

function BankTabContent({
  pkg,
  onClose,
}: {
  pkg: PayPackagePkg;
  onClose: () => void;
}) {
  const [state, setState] = useState<BankTabState>({ kind: "preparing" });
  const router = useRouter();

  // Auto-load bank details on mount. No DB write — prepareBankTransfer
  // just looks up the BankAccount row and generates a fresh reference
  // code in memory. The PENDING transaction is only created when the
  // pilot clicks "J'ai effectué le virement" below.
  useEffect(() => {
    let cancelled = false;
    prepareBankTransfer(pkg.id)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setState({ kind: "details", prep: result });
        } else {
          setState({ kind: "error", message: result.error });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : COPY.errors.generic;
        setState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [pkg.id]);

  async function handleRegister(prep: PrepareBankTransferOk) {
    setState({ kind: "registering", prep });
    try {
      const result = await confirmBankTransfer(pkg.id, prep.reference);
      if (result.ok) {
        router.refresh();
        setState({
          kind: "registered",
          prep,
          finalReference: result.reference,
        });
      } else {
        setState({ kind: "error", message: result.error });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : COPY.errors.generic;
      setState({ kind: "error", message });
    }
  }

  if (state.kind === "preparing") {
    return (
      <p className="py-8 text-center text-sm text-text-muted">
        {COPY.payment.bankProcessing}
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-danger">{state.message}</p>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          {COPY.payment.close}
        </Button>
      </div>
    );
  }
  if (state.kind === "registered") {
    const refChanged = state.finalReference !== state.prep.reference;
    return (
      <div className="space-y-4 py-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success-soft-fg">
          ✓
        </div>
        <div>
          <p className="font-display text-lg font-semibold text-text-strong">
            {COPY.payment.bankRegisteredTitle}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {COPY.payment.bankRegisteredBody}
          </p>
        </div>
        {refChanged && (
          <p className="rounded-md border border-warning-soft-border bg-warning-soft p-3 text-xs text-warning-soft-fg">
            {COPY.payment.bankRegisteredRefChanged}
            <br />
            <span className="font-mono">{state.finalReference}</span>
          </p>
        )}
        <Button type="button" onClick={onClose} fullWidth>
          {COPY.payment.close}
        </Button>
      </div>
    );
  }

  // details + registering states share the same UI; the button shows
  // a processing label when registering.
  return (
    <BankTabDetails
      prep={state.prep}
      isRegistering={state.kind === "registering"}
      onRegister={() => handleRegister(state.prep)}
    />
  );
}

function BankTabDetails({
  prep,
  isRegistering,
  onRegister,
}: {
  prep: PrepareBankTransferOk;
  isRegistering: boolean;
  onRegister: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyRef() {
    try {
      await navigator.clipboard.writeText(prep.reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore — the ref is also visible verbatim
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-text-strong">
          {COPY.payment.bankDetailsTitle}
        </p>
        <p className="mt-1 text-sm tabular text-text-muted">
          {formatHHMM(prep.hdvMinutes)}
          <span className="mx-1.5 text-text-subtle">·</span>
          {formatEuros(prep.amountCents)}
        </p>
      </div>

      {/* Reference code — most important field, biggest visual weight */}
      <div className="rounded-lg border border-brand-soft-border bg-brand-soft p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.1em] text-brand-soft-fg/80">
              {COPY.payment.bankReferenceLabel}
            </p>
            <p className="font-display tabular mt-1 text-2xl font-semibold tracking-wide text-brand-soft-fg">
              {prep.reference}
            </p>
          </div>
          <button
            type="button"
            onClick={copyRef}
            className="shrink-0 rounded-md border border-brand-soft-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-soft"
          >
            {copied ? COPY.payment.bankReferenceCopied : COPY.payment.bankReferenceCopy}
          </button>
        </div>
      </div>

      <dl className="space-y-2 text-sm">
        <BankRow label={COPY.payment.bankHolderLabel} value={prep.bank.holderName} />
        <BankRow label={COPY.payment.bankIbanLabel} value={formatIban(prep.bank.iban)} mono />
        <BankRow label={COPY.payment.bankBicLabel} value={prep.bank.bic} mono />
        {prep.bank.bankName && (
          <BankRow
            label={COPY.payment.bankBankNameLabel}
            value={prep.bank.bankName}
          />
        )}
        <BankRow
          label={COPY.payment.bankAmountLabel}
          value={formatEuros(prep.amountCents)}
        />
      </dl>

      {prep.bank.instructions && (
        <p className="rounded-md border border-border-subtle bg-surface-sunken p-3 text-xs text-text-muted leading-relaxed">
          {prep.bank.instructions}
        </p>
      )}

      <p className="rounded-md border border-warning-soft-border bg-warning-soft p-3 text-xs text-warning-soft-fg leading-relaxed">
        {COPY.payment.bankDetailsHint}
        <br />
        <span className="opacity-80">{COPY.payment.bankKeepOpenWarning}</span>
      </p>

      <Button
        type="button"
        fullWidth
        onClick={onRegister}
        disabled={isRegistering}
      >
        {isRegistering
          ? COPY.payment.bankRegisterProcessing
          : COPY.payment.bankRegister}
      </Button>
    </div>
  );
}

function BankRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-subtle pb-2 last:border-b-0 last:pb-0">
      <dt className="text-xs font-medium uppercase tracking-[0.1em] text-text-subtle">
        {label}
      </dt>
      <dd
        className={`min-w-0 truncate text-right text-sm text-text ${mono ? "tabular" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** Group an IBAN 4 characters at a time for readability ("FR76 1234 …"). */
function formatIban(raw: string): string {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  return compact.replace(/(.{4})/g, "$1 ").trim();
}
