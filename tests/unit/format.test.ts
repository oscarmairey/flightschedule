import { describe, it, expect } from "vitest";
import {
  parisLocalToUtc,
  parisLocalDateString,
  startOfParisWeek,
  formatDateFR,
  formatTimeFR,
  formatDateTimeFR,
  DAY_LABELS_FR,
} from "@/lib/format";

describe("parisLocalToUtc", () => {
  it("converts a winter Paris noon (CET, UTC+1) to 11:00 UTC", () => {
    const utc = parisLocalToUtc("2026-01-15", 12, 0);
    expect(utc.toISOString()).toBe("2026-01-15T11:00:00.000Z");
  });

  it("converts a summer Paris noon (CEST, UTC+2) to 10:00 UTC", () => {
    const utc = parisLocalToUtc("2026-07-15", 12, 0);
    expect(utc.toISOString()).toBe("2026-07-15T10:00:00.000Z");
  });

  it("handles the fall-back DST day (2026-10-25) — clocks already on CET by 10:00", () => {
    // 03:00 CEST → 02:00 CET on 2026-10-25. By 10:00 wall-clock we're on
    // CET (UTC+1), so 10:00 Paris = 09:00 UTC.
    const utc = parisLocalToUtc("2026-10-25", 10, 0);
    expect(utc.toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });

  it("handles the ambiguous hour on fall-back day — 02:30 Paris resolves to one UTC instant", () => {
    // During fall-back 02:30 Paris-local happens twice. The derivation
    // uses Intl at the candidate instant — accept whichever offset Intl
    // gives, but assert the result is ONE of the two valid UTC times.
    const utc = parisLocalToUtc("2026-10-25", 2, 30);
    const iso = utc.toISOString();
    expect([
      "2026-10-25T00:30:00.000Z", // CEST interpretation (first pass)
      "2026-10-25T01:30:00.000Z", // CET interpretation (second pass)
    ]).toContain(iso);
  });

  it("handles the spring-forward DST day (2026-03-29)", () => {
    // 10:00 Paris on 2026-03-29 (CEST, UTC+2) → 08:00 UTC
    const utc = parisLocalToUtc("2026-03-29", 10, 0);
    expect(utc.toISOString()).toBe("2026-03-29T08:00:00.000Z");
  });

  it("is consistent at midnight year-round", () => {
    expect(parisLocalToUtc("2026-01-01", 0, 0).toISOString()).toBe(
      "2025-12-31T23:00:00.000Z",
    );
    expect(parisLocalToUtc("2026-07-01", 0, 0).toISOString()).toBe(
      "2026-06-30T22:00:00.000Z",
    );
  });
});

describe("parisLocalDateString", () => {
  it("returns YYYY-MM-DD in Paris local time", () => {
    // 22:30 UTC on 2026-07-01 = 00:30 Paris on 2026-07-02
    const d = new Date("2026-07-01T22:30:00.000Z");
    expect(parisLocalDateString(d)).toBe("2026-07-02");
  });

  it("returns the winter Paris date consistently", () => {
    const d = new Date("2026-01-10T23:30:00.000Z"); // 00:30 Paris next day
    expect(parisLocalDateString(d)).toBe("2026-01-11");
  });
});

describe("startOfParisWeek", () => {
  it("snaps to Monday 00:00 Paris-local", () => {
    // 2026-04-15 is a Wednesday in Paris.
    const anyInstant = new Date("2026-04-15T15:42:00.000Z");
    const monday = startOfParisWeek(anyInstant);
    // Monday 2026-04-13 00:00 Paris (CEST) = 2026-04-12 22:00 UTC
    expect(monday.toISOString()).toBe("2026-04-12T22:00:00.000Z");
    expect(parisLocalDateString(monday)).toBe("2026-04-13");
  });

  it("returns the SAME Monday when called on a Sunday in Paris", () => {
    const sundayParis = parisLocalToUtc("2026-04-19", 23, 0); // Sun 23:00 Paris
    const monday = startOfParisWeek(sundayParis);
    expect(parisLocalDateString(monday)).toBe("2026-04-13");
  });

  it("stays at 00:00 Paris-local across the spring DST transition", () => {
    // Thursday 2026-04-02 (after spring forward on 2026-03-29)
    const anyInstant = parisLocalToUtc("2026-04-02", 12, 0);
    const monday = startOfParisWeek(anyInstant);
    expect(parisLocalDateString(monday)).toBe("2026-03-30");
  });
});

describe("French formatters", () => {
  const d = new Date("2026-04-15T09:05:00.000Z"); // Paris: 11:05 CEST on 2026-04-15

  it("formatDateFR uses dd/MM/yyyy", () => {
    expect(formatDateFR(d)).toBe("15/04/2026");
  });

  it("formatTimeFR uses 24h clock", () => {
    expect(formatTimeFR(d)).toBe("11:05");
  });

  it("formatDateTimeFR combines both", () => {
    expect(formatDateTimeFR(d)).toBe("15/04/2026 11:05");
  });

  it("returns em-dash on null/undefined", () => {
    expect(formatDateFR(null)).toBe("—");
    expect(formatTimeFR(undefined)).toBe("—");
    expect(formatDateTimeFR(null)).toBe("—");
  });

  it("DAY_LABELS_FR covers Sunday..Saturday", () => {
    expect(DAY_LABELS_FR).toHaveLength(7);
    expect(DAY_LABELS_FR[0]).toBe("Dimanche");
    expect(DAY_LABELS_FR[6]).toBe("Samedi");
  });
});
