// FlightSchedule — package pricing helpers.
//
// V2.1 — the inline payment flow uses Stripe PaymentIntents instead of
// Checkout, so Stripe Tax is no longer applied automatically. We
// compute the VAT-inclusive amount server-side from the package's HT
// price using the fixed French VAT rate.
//
// Single source of truth: every server action and the modal display
// import these helpers so HT, TVA, and TTC always agree to the cent.

/** French standard VAT rate, expressed as a percentage. */
export const VAT_RATE_PCT = 20;

/**
 * Convert an HT price (cents) into the VAT-inclusive TTC price (cents),
 * rounded to the nearest cent. Bankers' rounding is not required at
 * this scale — the amounts are small (tens of euros) and we only need
 * the result to match what the pilot is actually charged.
 */
export function computePriceCentsTTC(priceCentsHT: number): number {
  if (!Number.isInteger(priceCentsHT) || priceCentsHT < 0) {
    throw new Error(
      `computePriceCentsTTC: priceCentsHT must be a non-negative integer (got ${priceCentsHT})`,
    );
  }
  return Math.round((priceCentsHT * (100 + VAT_RATE_PCT)) / 100);
}

/**
 * Convenience: returns { ht, tva, ttc } in cents so the modal can show
 * the breakdown to the pilot ("150 € HT + 30 € TVA = 180 € TTC").
 */
export function priceBreakdownCents(priceCentsHT: number): {
  ht: number;
  tva: number;
  ttc: number;
} {
  const ttc = computePriceCentsTTC(priceCentsHT);
  return {
    ht: priceCentsHT,
    tva: ttc - priceCentsHT,
    ttc,
  };
}

/** Format a cents value as a French euro string ("180,00 €"). */
export function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format a cents value rounded to whole euros ("180 €"). Used on dashboard rows. */
export function formatEurosRounded(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
