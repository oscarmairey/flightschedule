// Rule #3 — Reservation booking atomicity. Overlap check + insert run
// inside a serializable transaction; availability exceptions veto.

import { describe, it, expect } from "vitest";
import {
  bookReservation,
  OverlapError,
  InvalidWindowError,
  RESERVATION_LIMITS,
} from "@/lib/reservations";
import { getTestPrisma } from "../setup/db";
import {
  makeUser,
  makeAvailabilityBlock,
  makeOpenPeriod,
  makeReservation,
} from "../setup/factories";
import { parisLocalToUtc } from "@/lib/format";

function parisWindow(ymd: string, hhStart: number, hhEnd: number) {
  return {
    startsAtUtc: parisLocalToUtc(ymd, hhStart, 0),
    endsAtUtc: parisLocalToUtc(ymd, hhEnd, 0),
  };
}

describe("bookReservation — rule #3", () => {
  it("creates a CONFIRMED reservation on the happy path", async () => {
    const prisma = getTestPrisma();
    const user = await makeUser();
    const { startsAtUtc, endsAtUtc } = parisWindow("2026-05-01", 9, 12);

    const res = await bookReservation({
      userId: user.id,
      startsAtUtc,
      endsAtUtc,
    });

    expect(res.durationMin).toBe(180);
    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: res.id },
    });
    expect(row.status).toBe("CONFIRMED");
    expect(row.userId).toBe(user.id);
  });

  it("rejects a window that overlaps an existing CONFIRMED reservation (same user)", async () => {
    const user = await makeUser();
    const w = parisWindow("2026-05-02", 9, 12);
    await bookReservation({ userId: user.id, ...w });

    // Full overlap with self.
    await expect(
      bookReservation({ userId: user.id, ...w }),
    ).rejects.toBeInstanceOf(OverlapError);
  });

  it("rejects a window that overlaps another pilot's CONFIRMED reservation", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const w = parisWindow("2026-05-03", 9, 12);
    await bookReservation({ userId: a.id, ...w });
    await expect(
      bookReservation({ userId: b.id, ...w }),
    ).rejects.toBeInstanceOf(OverlapError);
  });

  it("allows adjacent bookings sharing the boundary (half-open intervals)", async () => {
    const user = await makeUser();
    await bookReservation({
      userId: user.id,
      ...parisWindow("2026-05-04", 9, 12),
    });
    await expect(
      bookReservation({
        userId: user.id,
        ...parisWindow("2026-05-04", 12, 15),
      }),
    ).resolves.toMatchObject({ durationMin: 180 });
  });

  it("allows booking over a cancelled reservation", async () => {
    const user = await makeUser();
    const w = parisWindow("2026-05-05", 9, 12);
    await makeReservation({
      userId: user.id,
      startsAt: w.startsAtUtc,
      endsAt: w.endsAtUtc,
      status: "CANCELLED_BY_PILOT",
    });
    await expect(
      bookReservation({ userId: user.id, ...w }),
    ).resolves.toBeTruthy();
  });

  it("rejects durations outside the documented bounds", async () => {
    const user = await makeUser();
    const tooShort = {
      startsAtUtc: parisLocalToUtc("2026-05-06", 9, 0),
      endsAtUtc: parisLocalToUtc("2026-05-06", 10, 0), // 1h
    };
    await expect(
      bookReservation({ userId: user.id, ...tooShort }),
    ).rejects.toBeInstanceOf(InvalidWindowError);

    const misaligned = {
      startsAtUtc: parisLocalToUtc("2026-05-07", 9, 0),
      endsAtUtc: parisLocalToUtc("2026-05-07", 13, 0), // 4h, not multiple of 3h
    };
    await expect(
      bookReservation({ userId: user.id, ...misaligned }),
    ).rejects.toBeInstanceOf(InvalidWindowError);
  });

  it("respects specificDate AvailabilityBlock exceptions", async () => {
    const user = await makeUser();
    await makeAvailabilityBlock({
      specificDate: new Date("2026-05-08T00:00:00.000Z"),
      startMinutes: 8 * 60,
      endMinutes: 18 * 60,
      reason: "Maintenance",
    });
    await expect(
      bookReservation({
        userId: user.id,
        ...parisWindow("2026-05-08", 9, 12),
      }),
    ).rejects.toBeInstanceOf(InvalidWindowError);
  });

  it("respects dayOfWeek AvailabilityBlock exceptions", async () => {
    const user = await makeUser();
    // 2026-05-09 is a Saturday (JS dayOfWeek = 6).
    await makeAvailabilityBlock({
      dayOfWeek: 6,
      startMinutes: 0,
      endMinutes: 1440,
      reason: "Fermé le samedi",
    });
    await expect(
      bookReservation({
        userId: user.id,
        ...parisWindow("2026-05-09", 9, 12),
      }),
    ).rejects.toBeInstanceOf(InvalidWindowError);
  });

  it("specificDate override lets a booking through even if dayOfWeek would block", async () => {
    const user = await makeUser();
    // Block every Saturday fully…
    await makeAvailabilityBlock({
      dayOfWeek: 6,
      startMinutes: 0,
      endMinutes: 1440,
      reason: "Fermé le samedi",
    });
    // …but override 2026-05-16 to an afternoon-only exception.
    await makeAvailabilityBlock({
      specificDate: new Date("2026-05-16T00:00:00.000Z"),
      startMinutes: 14 * 60,
      endMinutes: 18 * 60,
      reason: "Seulement bloqué l'après-midi ce jour-là",
    });
    // Booking 09:00–12:00 should succeed (dayOfWeek override supplanted).
    await expect(
      bookReservation({
        userId: user.id,
        ...parisWindow("2026-05-16", 9, 12),
      }),
    ).resolves.toBeTruthy();
    // But 15:00–18:00 still hits the specific-date exception.
    await expect(
      bookReservation({
        userId: user.id,
        ...parisWindow("2026-05-16", 15, 18),
      }),
    ).rejects.toBeInstanceOf(InvalidWindowError);
  });

  it("treats a DB with NO OpenPeriod rows as always-open", async () => {
    const user = await makeUser();
    await expect(
      bookReservation({
        userId: user.id,
        ...parisWindow("2026-05-10", 9, 12),
      }),
    ).resolves.toBeTruthy();
  });

  it("rejects a booking outside any OpenPeriod when at least one exists", async () => {
    const user = await makeUser();
    await makeOpenPeriod({
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: new Date("2026-06-30T00:00:00.000Z"),
    });
    await expect(
      bookReservation({
        userId: user.id,
        ...parisWindow("2026-05-15", 9, 12),
      }),
    ).rejects.toBeInstanceOf(InvalidWindowError);
    await expect(
      bookReservation({
        userId: user.id,
        ...parisWindow("2026-06-10", 9, 12),
      }),
    ).resolves.toBeTruthy();
  });

  it("serialises concurrent attempts on the same window", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const w = parisWindow("2026-05-11", 9, 12);

    const results = await Promise.allSettled([
      bookReservation({ userId: a.id, ...w }),
      bookReservation({ userId: b.id, ...w }),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      OverlapError,
    );
  });

  it("exposes the documented limits", () => {
    expect(RESERVATION_LIMITS.MIN_DURATION_MIN).toBe(180);
    expect(RESERVATION_LIMITS.SLOT_GRANULARITY_MIN).toBe(180);
  });
});
