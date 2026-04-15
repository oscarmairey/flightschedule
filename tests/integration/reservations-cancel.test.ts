// Rule #7 — cancellation timing and status transitions.

import { describe, it, expect } from "vitest";
import {
  cancelReservation,
  LateCancellationError,
  AutoCreatedReservationError,
} from "@/lib/reservations";
import { getTestPrisma } from "../setup/db";
import { makeUser, makeReservation } from "../setup/factories";

const HOUR = 60 * 60 * 1000;

describe("cancelReservation — rule #7", () => {
  it("pilot cancels ≥24 h before start → CANCELLED_BY_PILOT", async () => {
    const prisma = getTestPrisma();
    const pilot = await makeUser();
    const res = await makeReservation({
      userId: pilot.id,
      startsAt: new Date(Date.now() + 48 * HOUR),
      endsAt: new Date(Date.now() + 51 * HOUR),
    });

    await cancelReservation({
      reservationId: res.id,
      actorId: pilot.id,
      isAdmin: false,
    });

    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id: res.id },
    });
    expect(after.status).toBe("CANCELLED_BY_PILOT");
    expect(after.cancelledById).toBe(pilot.id);
    expect(after.cancelledAt).not.toBeNull();
  });

  it("pilot cancels <24 h before start → LateCancellationError", async () => {
    const pilot = await makeUser();
    const res = await makeReservation({
      userId: pilot.id,
      startsAt: new Date(Date.now() + 12 * HOUR),
      endsAt: new Date(Date.now() + 15 * HOUR),
    });
    await expect(
      cancelReservation({
        reservationId: res.id,
        actorId: pilot.id,
        isAdmin: false,
      }),
    ).rejects.toBeInstanceOf(LateCancellationError);
  });

  it("admin can cancel <24 h before start (bypasses the rule)", async () => {
    const prisma = getTestPrisma();
    const pilot = await makeUser();
    const admin = await makeUser({ role: "ADMIN" });
    const res = await makeReservation({
      userId: pilot.id,
      startsAt: new Date(Date.now() + 12 * HOUR),
      endsAt: new Date(Date.now() + 15 * HOUR),
    });
    await cancelReservation({
      reservationId: res.id,
      actorId: admin.id,
      isAdmin: true,
    });
    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id: res.id },
    });
    expect(after.status).toBe("CANCELLED_BY_ADMIN");
    expect(after.cancelledById).toBe(admin.id);
  });

  it("auto-created reservations cannot be cancelled, even by admin", async () => {
    const pilot = await makeUser();
    const admin = await makeUser({ role: "ADMIN" });
    const res = await makeReservation({
      userId: pilot.id,
      startsAt: new Date(Date.now() + 48 * HOUR),
      endsAt: new Date(Date.now() + 51 * HOUR),
      autoCreatedFromFlight: true,
    });

    await expect(
      cancelReservation({
        reservationId: res.id,
        actorId: pilot.id,
        isAdmin: false,
      }),
    ).rejects.toBeInstanceOf(AutoCreatedReservationError);

    await expect(
      cancelReservation({
        reservationId: res.id,
        actorId: admin.id,
        isAdmin: true,
      }),
    ).rejects.toBeInstanceOf(AutoCreatedReservationError);
  });

  it("pilot cannot cancel someone else's reservation", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const res = await makeReservation({
      userId: owner.id,
      startsAt: new Date(Date.now() + 48 * HOUR),
      endsAt: new Date(Date.now() + 51 * HOUR),
    });
    await expect(
      cancelReservation({
        reservationId: res.id,
        actorId: other.id,
        isAdmin: false,
      }),
    ).rejects.toThrow(/refusé|denied/i);
  });

  it("double-cancellation throws on the second attempt", async () => {
    const pilot = await makeUser();
    const res = await makeReservation({
      userId: pilot.id,
      startsAt: new Date(Date.now() + 48 * HOUR),
      endsAt: new Date(Date.now() + 51 * HOUR),
    });
    await cancelReservation({
      reservationId: res.id,
      actorId: pilot.id,
      isAdmin: false,
    });
    await expect(
      cancelReservation({
        reservationId: res.id,
        actorId: pilot.id,
        isAdmin: false,
      }),
    ).rejects.toThrow(/déjà annulée/i);
  });
});
