import { describe, it, expect } from "vitest";
import {
  parseHHMM,
  formatHHMM,
  formatHHMMSigned,
  parseTachyToHundredths,
  formatTachy,
  balanceTier,
  parseEngineTimes,
  EngineTimesError,
  MIN_FLIGHT_MIN,
  MAX_FLIGHT_MIN,
  BALANCE_THRESHOLDS,
} from "@/lib/duration";

describe("parseHHMM", () => {
  it.each([
    ["1h30", 90],
    ["1:30", 90],
    ["1h", 60],
    ["0:45", 45],
    ["0h00", 0],
    ["90", 90],
    ["  2h15  ", 135],
    ["3H45", 225],
  ])("parses %s → %i min", (input, expected) => {
    expect(parseHHMM(input)).toBe(expected);
  });

  it.each([
    [""],
    ["bad"],
    ["1h60"],
    ["1:60"],
    ["abc123"],
    ["1.5"],
    ["-30"],
  ])("rejects %s", (input) => {
    expect(parseHHMM(input)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(parseHHMM(null as unknown as string)).toBeNull();
    expect(parseHHMM(undefined as unknown as string)).toBeNull();
    expect(parseHHMM(90 as unknown as string)).toBeNull();
  });
});

describe("formatHHMM", () => {
  it.each([
    [0, "0h00"],
    [5, "0h05"],
    [60, "1h00"],
    [90, "1h30"],
    [1500, "25h00"],
    [-45, "-0h45"],
    [-90, "-1h30"],
  ])("formats %i → %s", (input, expected) => {
    expect(formatHHMM(input)).toBe(expected);
  });

  it("returns em-dash for non-finite", () => {
    expect(formatHHMM(Number.NaN)).toBe("—");
    expect(formatHHMM(Infinity)).toBe("—");
  });
});

describe("formatHHMMSigned", () => {
  it.each([
    [0, "+0h00"],
    [90, "+1h30"],
    [-90, "-1h30"],
  ])("formats %i → %s", (input, expected) => {
    expect(formatHHMMSigned(input)).toBe(expected);
  });
});

describe("parseTachyToHundredths", () => {
  it.each([
    ["1234.56", 123456],
    ["1234,56", 123456],
    ["1234", 123400],
    ["0.05", 5],
    ["0", 0],
    ["  10.10  ", 1010],
    ["9999.99", 999999],
  ])("parses %s → %i", (input, expected) => {
    expect(parseTachyToHundredths(input)).toBe(expected);
  });

  it.each([
    [""],
    ["bad"],
    ["1.234"],
    ["-1.00"],
    ["1,000,000"],
  ])("rejects %s", (input) => {
    expect(parseTachyToHundredths(input)).toBeNull();
  });
});

describe("formatTachy", () => {
  it.each([
    [null, "—"],
    [undefined, "—"],
    [0, "0.00"],
    [5, "0.05"],
    [123456, "1234.56"],
    [100, "1.00"],
  ])("formats %s → %s", (input, expected) => {
    expect(formatTachy(input as number | null | undefined)).toBe(expected);
  });
});

describe("balanceTier", () => {
  it("classifies by the documented thresholds", () => {
    expect(balanceTier(-1)).toBe("negative");
    expect(balanceTier(0)).toBe("red");
    expect(balanceTier(BALANCE_THRESHOLDS.RED_MAX_MIN - 1)).toBe("red");
    expect(balanceTier(BALANCE_THRESHOLDS.RED_MAX_MIN)).toBe("amber");
    expect(balanceTier(BALANCE_THRESHOLDS.GREEN_MIN_MIN)).toBe("amber");
    expect(balanceTier(BALANCE_THRESHOLDS.GREEN_MIN_MIN + 1)).toBe("green");
  });
});

describe("parseEngineTimes", () => {
  const DATE = "2026-04-10";

  it("parses a same-day flight", () => {
    const r = parseEngineTimes(DATE, "10:00", "11:30");
    expect(r.durationMin).toBe(90);
    expect(r.crossedMidnight).toBe(false);
    expect(r.endsAtUtc.getTime() - r.startsAtUtc.getTime()).toBe(
      90 * 60_000,
    );
  });

  it("handles cross-midnight by adding 24h", () => {
    const r = parseEngineTimes(DATE, "23:30", "00:45");
    expect(r.durationMin).toBe(75);
    expect(r.crossedMidnight).toBe(true);
  });

  it("treats equal bloc OFF and bloc ON as cross-midnight (24h flight) — rejected by max", () => {
    expect(() => parseEngineTimes(DATE, "10:00", "10:00")).toThrow(
      EngineTimesError,
    );
  });

  it("rejects durations below the minimum", () => {
    expect(() => parseEngineTimes(DATE, "10:00", "10:02")).toThrow(
      /minimum/i,
    );
  });

  it("accepts durations exactly at the minimum", () => {
    expect(() =>
      parseEngineTimes(DATE, "10:00", `10:0${MIN_FLIGHT_MIN}`),
    ).not.toThrow();
  });

  it("rejects durations above the maximum", () => {
    // MAX_FLIGHT_MIN = 12h — 13h should always reject.
    // 10:00 → 23:01 = 13h 1min
    expect(() => parseEngineTimes(DATE, "10:00", "23:01")).toThrow(
      /maximum/i,
    );
    expect(MAX_FLIGHT_MIN).toBe(12 * 60);
  });

  it("rejects malformed dates", () => {
    expect(() => parseEngineTimes("2026/04/10", "10:00", "11:00")).toThrow(
      /Date/i,
    );
  });

  it.each([
    ["1000", "11:00"],
    ["10:00", "1100"],
    ["24:00", "25:00"],
    ["99:99", "10:00"],
    ["10:60", "11:00"],
  ])("rejects malformed times %s/%s", (a, b) => {
    expect(() => parseEngineTimes(DATE, a, b)).toThrow(EngineTimesError);
  });
});
