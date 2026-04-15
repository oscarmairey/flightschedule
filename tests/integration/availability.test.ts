// Rule #8 — AvailabilityBlock precedence and OpenPeriod gating.

import { describe, it, expect } from "vitest";
import { isWithinAvailability } from "@/lib/availability";
import {
  makeAvailabilityBlock,
  makeOpenPeriod,
} from "../setup/factories";
import { parisLocalToUtc } from "@/lib/format";

function window(ymd: string, hhStart: number, hhEnd: number) {
  return {
    startsAtUtc: parisLocalToUtc(ymd, hhStart, 0),
    endsAtUtc: parisLocalToUtc(ymd, hhEnd, 0),
  };
}

describe("isWithinAvailability — rule #8", () => {
  it("returns ok when nothing restricts the window", async () => {
    const w = window("2026-05-20", 9, 12);
    const r = await isWithinAvailability(w.startsAtUtc, w.endsAtUtc);
    expect(r.ok).toBe(true);
  });

  it("returns not-ok with a French reason when a specificDate exception overlaps", async () => {
    await makeAvailabilityBlock({
      specificDate: new Date("2026-05-21T00:00:00.000Z"),
      startMinutes: 8 * 60,
      endMinutes: 14 * 60,
      reason: "Entretien moteur",
    });
    const w = window("2026-05-21", 9, 12);
    const r = await isWithinAvailability(w.startsAtUtc, w.endsAtUtc);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/Entretien/);
    }
  });

  it("day-of-week exception is superseded by a specificDate override for the same date", async () => {
    // Saturday blocked all day…
    await makeAvailabilityBlock({
      dayOfWeek: 6,
      startMinutes: 0,
      endMinutes: 1440,
      reason: "Fermé le samedi",
    });
    // …but 2026-05-23 overridden to only block 14:00–18:00.
    await makeAvailabilityBlock({
      specificDate: new Date("2026-05-23T00:00:00.000Z"),
      startMinutes: 14 * 60,
      endMinutes: 18 * 60,
    });

    const morning = window("2026-05-23", 9, 12);
    expect(
      (await isWithinAvailability(morning.startsAtUtc, morning.endsAtUtc)).ok,
    ).toBe(true);

    const afternoon = window("2026-05-23", 15, 18);
    expect(
      (await isWithinAvailability(afternoon.startsAtUtc, afternoon.endsAtUtc)).ok,
    ).toBe(false);
  });

  it("with NO OpenPeriod rows the aircraft is always open", async () => {
    const w = window("2030-01-15", 9, 12);
    const r = await isWithinAvailability(w.startsAtUtc, w.endsAtUtc);
    expect(r.ok).toBe(true);
  });

  it("with OpenPeriods set, only dates inside a period are bookable", async () => {
    await makeOpenPeriod({
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: new Date("2026-06-30T00:00:00.000Z"),
    });
    const inside = window("2026-06-15", 9, 12);
    const outside = window("2026-07-15", 9, 12);
    expect(
      (await isWithinAvailability(inside.startsAtUtc, inside.endsAtUtc)).ok,
    ).toBe(true);
    expect(
      (await isWithinAvailability(outside.startsAtUtc, outside.endsAtUtc)).ok,
    ).toBe(false);
  });

  it("rejects windows where end <= start", async () => {
    const t = parisLocalToUtc("2026-05-24", 10, 0);
    const r = await isWithinAvailability(t, t);
    expect(r.ok).toBe(false);
  });

  it("evaluates a multi-day window against exceptions on every day it touches", async () => {
    await makeAvailabilityBlock({
      specificDate: new Date("2026-05-26T00:00:00.000Z"),
      startMinutes: 0,
      endMinutes: 1440,
      reason: "Fermé toute la journée",
    });
    // Booking runs 2026-05-25 18:00 Paris → 2026-05-26 06:00 Paris.
    const start = parisLocalToUtc("2026-05-25", 18, 0);
    const end = parisLocalToUtc("2026-05-26", 6, 0);
    const r = await isWithinAvailability(start, end);
    expect(r.ok).toBe(false);
  });
});
