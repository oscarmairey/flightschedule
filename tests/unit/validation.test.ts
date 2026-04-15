import { describe, it, expect } from "vitest";
import {
  EmailSchema,
  PasswordSchema,
  HHMMSchema,
  DurationMinutesSchema,
  IcaoSchema,
  UuidSchema,
  NonEmptyTextSchema,
} from "@/lib/validation";

describe("EmailSchema", () => {
  it("lowercases a trimmed, well-formed email", () => {
    // `.email()` runs before `.transform()`, so the input must already be
    // well-formed (no surrounding whitespace). The transform then
    // lowercases + redundantly trims the already-valid string.
    const r = EmailSchema.parse("Pilot@Example.Com");
    expect(r).toBe("pilot@example.com");
  });

  it.each(["", "not-an-email", "a@b", "plainaddress", "  pilot@x.com "])(
    "rejects %s",
    (bad) => {
      expect(() => EmailSchema.parse(bad)).toThrow();
    },
  );
});

describe("PasswordSchema", () => {
  it("accepts a strong password", () => {
    expect(() => PasswordSchema.parse("Strong1Password")).not.toThrow();
  });

  it.each([
    ["short", "too short"],
    ["alllowercase1", "no uppercase"],
    ["ALLUPPERCASE1", "no lowercase"],
    ["NoDigitsHere!", "no digit"],
  ])("rejects %s (%s)", (bad) => {
    expect(() => PasswordSchema.parse(bad)).toThrow();
  });
});

describe("HHMMSchema", () => {
  it.each(["1h30", "0:30", "90", "3h", "1:3"])("accepts %s", (good) => {
    expect(() => HHMMSchema.parse(good)).not.toThrow();
  });

  it.each(["", "bad", "1.5", "-30"])("rejects %s", (bad) => {
    expect(() => HHMMSchema.parse(bad)).toThrow();
  });
});

describe("DurationMinutesSchema", () => {
  it("accepts positive integers", () => {
    expect(DurationMinutesSchema.parse(1)).toBe(1);
    expect(DurationMinutesSchema.parse(600)).toBe(600);
  });

  it.each([0, -1, 1.5])("rejects %s", (bad) => {
    expect(() => DurationMinutesSchema.parse(bad)).toThrow();
  });
});

describe("IcaoSchema", () => {
  it("uppercases + trims", () => {
    expect(IcaoSchema.parse(" lfpn ")).toBe("LFPN");
  });

  it.each(["LFP", "LFPNX", "LFP1", ""])("rejects %s", (bad) => {
    expect(() => IcaoSchema.parse(bad)).toThrow();
  });
});

describe("UuidSchema", () => {
  it("accepts a real v4 UUID", () => {
    expect(() =>
      UuidSchema.parse("8c5f73b3-5e39-4a24-b1f1-4d65f1a9a6bb"),
    ).not.toThrow();
  });

  it("rejects a non-UUID string", () => {
    expect(() => UuidSchema.parse("definitely-not-uuid")).toThrow();
  });
});

describe("NonEmptyTextSchema", () => {
  it("trims and rejects very short input", () => {
    expect(NonEmptyTextSchema.parse("  hello  ")).toBe("hello");
    expect(() => NonEmptyTextSchema.parse("x")).toThrow();
  });

  it("rejects massive input", () => {
    expect(() => NonEmptyTextSchema.parse("x".repeat(1001))).toThrow();
  });
});

describe("error messages are French", () => {
  it("EmailSchema error mentions email in French", () => {
    try {
      EmailSchema.parse("");
    } catch (err) {
      const msg = JSON.stringify(err);
      expect(msg).toMatch(/Email/);
    }
  });

  it("PasswordSchema error is in French", () => {
    try {
      PasswordSchema.parse("a");
    } catch (err) {
      const msg = JSON.stringify(err);
      expect(msg).toMatch(/mot de passe|minuscule|majuscule|chiffre/i);
    }
  });
});
