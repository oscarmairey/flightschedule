import { describe, it, expect } from "vitest";
import { generatePaymentRef } from "@/lib/payment-ref";

describe("generatePaymentRef", () => {
  const PATTERN = /^FS-[A-HJ-NP-Z2-9]{6}$/;

  it("matches the documented pattern", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generatePaymentRef()).toMatch(PATTERN);
    }
  });

  it("never uses ambiguous characters 0/1/I/O", () => {
    for (let i = 0; i < 200; i += 1) {
      const ref = generatePaymentRef();
      expect(ref).not.toMatch(/[01IO]/);
    }
  });

  it("produces high-entropy output across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      seen.add(generatePaymentRef());
    }
    // 32^6 ≈ 10^9 — 1000 draws should produce 1000 distinct refs with
    // overwhelming probability.
    expect(seen.size).toBeGreaterThan(990);
  });
});
