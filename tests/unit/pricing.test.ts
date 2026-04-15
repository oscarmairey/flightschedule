import { describe, it, expect } from "vitest";
import {
  computePriceCentsTTC,
  priceBreakdownCents,
  formatEuros,
  formatEurosRounded,
  VAT_RATE_PCT,
} from "@/lib/pricing";

describe("computePriceCentsTTC", () => {
  it("adds 20% VAT", () => {
    expect(VAT_RATE_PCT).toBe(20);
    expect(computePriceCentsTTC(10000)).toBe(12000);
    expect(computePriceCentsTTC(0)).toBe(0);
    expect(computePriceCentsTTC(1)).toBe(1); // rounds 1.2 → 1
  });

  it("rounds to the nearest cent", () => {
    // 1234 * 1.2 = 1480.8 → 1481
    expect(computePriceCentsTTC(1234)).toBe(1481);
  });

  it("rejects negatives and non-integers", () => {
    expect(() => computePriceCentsTTC(-1)).toThrow();
    expect(() => computePriceCentsTTC(1.5 as unknown as number)).toThrow();
  });
});

describe("priceBreakdownCents", () => {
  it("returns consistent HT + TVA = TTC", () => {
    const b = priceBreakdownCents(15000);
    expect(b.ht).toBe(15000);
    expect(b.ttc).toBe(18000);
    expect(b.tva).toBe(3000);
    expect(b.ht + b.tva).toBe(b.ttc);
  });
});

describe("formatEuros", () => {
  it("formats with two decimals (French NBSP before €)", () => {
    // French locale uses a narrow no-break space
    const out = formatEuros(12345);
    expect(out).toMatch(/123,45/);
    expect(out).toMatch(/€$/);
  });

  it("rounded variant drops decimals", () => {
    const out = formatEurosRounded(12345);
    expect(out).toMatch(/^123/);
    expect(out).not.toMatch(/,/);
  });
});
