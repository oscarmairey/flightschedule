// Rule #9 — admin flight edit must cascade via a compensating
// ADMIN_ADJUSTMENT. The original FLIGHT_DEBIT row is never mutated.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestPrisma } from "../setup/db";
import {
  makeUser,
  ensureStandardFlightHourType,
  getUserNetBalance,
} from "../setup/factories";
import { applyHdvMutation } from "@/lib/hdv";

let currentAdminId: string = "";
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    user: {
      id: currentAdminId,
      email: "admin@test.local",
      role: "ADMIN",
      mustResetPw: false,
    },
  })),
  requireAdmin: vi.fn(async () => ({
    user: {
      id: currentAdminId,
      email: "admin@test.local",
      role: "ADMIN",
      mustResetPw: false,
    },
  })),
}));

type RedirectSignal = { url: string };
function captureRedirect(err: unknown): RedirectSignal | null {
  if (!err || typeof err !== "object") return null;
  const digest = (err as { digest?: string }).digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT")) {
    return null;
  }
  return { url: digest.split(";")[2] ?? "" };
}

async function runExpectingRedirect(fn: () => Promise<unknown>): Promise<RedirectSignal> {
  try {
    await fn();
  } catch (err) {
    const r = captureRedirect(err);
    if (r) return r;
    throw err;
  }
  throw new Error("Expected a redirect to be thrown");
}

async function seedOneHourFlight(): Promise<{
  pilotId: string;
  adminId: string;
  flightId: string;
  typeId: string;
  initialBalance: number;
}> {
  const prisma = getTestPrisma();
  const typeId = await ensureStandardFlightHourType();
  const admin = await makeUser({ role: "ADMIN" });
  const pilot = await makeUser({ hdvBalanceMin: 0 });

  // Credit 600 min into the ledger so the invariant holds at t0.
  await prisma.$transaction(async (tx) => {
    await applyHdvMutation(tx, {
      userId: pilot.id,
      flightHourTypeId: typeId,
      type: "PACKAGE_PURCHASE",
      amountMin: 600,
      performedById: admin.id,
      reference: "seed",
    });
  });

  // Create a 60-min flight through the ledger (mirrors what submitFlight
  // would do atomically). Use two days ago so `no future flights` holds.
  const flightDateUtc = new Date("2026-04-01T00:00:00.000Z");
  let flightId = "";
  await prisma.$transaction(async (tx) => {
    const f = await tx.flight.create({
      data: {
        userId: pilot.id,
        date: flightDateUtc,
        depAirport: "LFPN",
        arrAirport: "LFPN",
        engineStart: "10:00",
        engineStop: "11:00",
        actualDurationMin: 60,
        landings: 1,
        photos: [],
      },
      select: { id: true },
    });
    flightId = f.id;
    await applyHdvMutation(tx, {
      userId: pilot.id,
      flightHourTypeId: typeId,
      type: "FLIGHT_DEBIT",
      amountMin: -60,
      flightId: f.id,
      performedById: pilot.id,
      allowNegative: true,
    });
  });

  return {
    pilotId: pilot.id,
    adminId: admin.id,
    flightId,
    typeId,
    initialBalance: 540,
  };
}

function buildEditFormData(params: {
  flightId: string;
  engineStart: string;
  engineStop: string;
  flightDate: string;
  reason: string;
  depAirport?: string;
  arrAirport?: string;
  landings?: string;
}): FormData {
  const fd = new FormData();
  fd.set("flightId", params.flightId);
  fd.set("depAirport", params.depAirport ?? "LFPN");
  fd.set("arrAirport", params.arrAirport ?? "LFPN");
  fd.set("flightDate", params.flightDate);
  fd.set("engineStart", params.engineStart);
  fd.set("engineStop", params.engineStop);
  fd.set("landings", params.landings ?? "1");
  fd.set("reason", params.reason);
  return fd;
}

describe("updateFlightAsAdmin — rule #9", () => {
  beforeEach(() => {
    currentAdminId = "";
  });

  it("shortening 1h30 → 1h00 refunds 30 min via ADMIN_ADJUSTMENT", async () => {
    const prisma = getTestPrisma();
    const typeId = await ensureStandardFlightHourType();
    const admin = await makeUser({ role: "ADMIN" });
    const pilot = await makeUser({ hdvBalanceMin: 0 });
    currentAdminId = admin.id;

    // Seed a 90-min flight.
    await prisma.$transaction(async (tx) => {
      await applyHdvMutation(tx, {
        userId: pilot.id,
        flightHourTypeId: typeId,
        type: "PACKAGE_PURCHASE",
        amountMin: 600,
        performedById: admin.id,
        reference: "seed",
      });
    });
    let flightId = "";
    await prisma.$transaction(async (tx) => {
      const f = await tx.flight.create({
        data: {
          userId: pilot.id,
          date: new Date("2026-04-01T00:00:00.000Z"),
          depAirport: "LFPN",
          arrAirport: "LFPN",
          engineStart: "10:00",
          engineStop: "11:30",
          actualDurationMin: 90,
          landings: 1,
          photos: [],
        },
        select: { id: true },
      });
      flightId = f.id;
      await applyHdvMutation(tx, {
        userId: pilot.id,
        flightHourTypeId: typeId,
        type: "FLIGHT_DEBIT",
        amountMin: -90,
        flightId: f.id,
        performedById: pilot.id,
        allowNegative: true,
      });
    });

    const balanceBefore = 600 - 90; // 510

    // Snapshot the original FLIGHT_DEBIT so we can prove it's untouched.
    const debitBefore = await prisma.transaction.findFirstOrThrow({
      where: { userId: pilot.id, type: "FLIGHT_DEBIT" },
    });

    const { updateFlightAsAdmin } = await import(
      "@/app/admin/flights/[id]/edit/actions"
    );

    const redirect = await runExpectingRedirect(() =>
      updateFlightAsAdmin(
        buildEditFormData({
          flightId,
          engineStart: "10:00",
          engineStop: "11:00", // 90 → 60 = -30 new, +30 compensation
          flightDate: "2026-04-01",
          reason: "Correction fat-finger bloc ON",
        }),
      ),
    );
    expect(redirect.url).toMatch(/flightedited=1/);

    // Original FLIGHT_DEBIT row is byte-identical.
    const debitAfter = await prisma.transaction.findUniqueOrThrow({
      where: { id: debitBefore.id },
    });
    expect(debitAfter.amountMin).toBe(debitBefore.amountMin);
    expect(debitAfter.balanceAfterMin).toBe(debitBefore.balanceAfterMin);

    // Compensating ADMIN_ADJUSTMENT appended, tied to the same flight.
    const adj = await prisma.transaction.findFirstOrThrow({
      where: {
        userId: pilot.id,
        type: "ADMIN_ADJUSTMENT",
        flightId,
      },
    });
    expect(adj.amountMin).toBe(30);
    expect(adj.performedById).toBe(admin.id);
    expect(adj.reference).toMatch(/Correction/);

    // Flight row reflects the new duration.
    const flight = await prisma.flight.findUniqueOrThrow({ where: { id: flightId } });
    expect(flight.actualDurationMin).toBe(60);

    // Invariant holds (type-scoped).
    const netAfter = await getUserNetBalance(pilot.id);
    const ledger = await prisma.transaction.findMany({
      where: { userId: pilot.id },
      select: { amountMin: true },
    });
    const sum = ledger.reduce((s, r) => s + r.amountMin, 0);
    expect(netAfter).toBe(sum);
    expect(netAfter).toBe(balanceBefore + 30);
  });

  it("lengthening 1h00 → 1h30 debits 30 min further", async () => {
    const prisma = getTestPrisma();
    const seeded = await seedOneHourFlight();
    currentAdminId = seeded.adminId;

    const { updateFlightAsAdmin } = await import(
      "@/app/admin/flights/[id]/edit/actions"
    );

    await runExpectingRedirect(() =>
      updateFlightAsAdmin(
        buildEditFormData({
          flightId: seeded.flightId,
          engineStart: "10:00",
          engineStop: "11:30",
          flightDate: "2026-04-01",
          reason: "Ajout manquant",
        }),
      ),
    );

    const adj = await prisma.transaction.findFirstOrThrow({
      where: { type: "ADMIN_ADJUSTMENT", flightId: seeded.flightId },
    });
    expect(adj.amountMin).toBe(-30);

    expect(await getUserNetBalance(seeded.pilotId)).toBe(
      seeded.initialBalance - 30,
    );
  });

  it("zero-duration change does NOT write an ADMIN_ADJUSTMENT", async () => {
    const prisma = getTestPrisma();
    const seeded = await seedOneHourFlight();
    currentAdminId = seeded.adminId;

    const { updateFlightAsAdmin } = await import(
      "@/app/admin/flights/[id]/edit/actions"
    );

    await runExpectingRedirect(() =>
      updateFlightAsAdmin(
        buildEditFormData({
          flightId: seeded.flightId,
          engineStart: "10:00",
          engineStop: "11:00",
          flightDate: "2026-04-01",
          reason: "Juste un correctif d'aéroport",
          depAirport: "LFPO",
        }),
      ),
    );

    const adjCount = await prisma.transaction.count({
      where: { type: "ADMIN_ADJUSTMENT" },
    });
    expect(adjCount).toBe(0);

    // Balance unchanged, flight row updated.
    expect(await getUserNetBalance(seeded.pilotId)).toBe(
      seeded.initialBalance,
    );
    const flight = await prisma.flight.findUniqueOrThrow({
      where: { id: seeded.flightId },
    });
    expect(flight.depAirport).toBe("LFPO");
  });

  it("rejects an edit whose new window overlaps another flight", async () => {
    const prisma = getTestPrisma();
    const seeded = await seedOneHourFlight();
    currentAdminId = seeded.adminId;

    // A second flight on the same day 12:00–13:00 for another pilot.
    const other = await makeUser();
    await prisma.flight.create({
      data: {
        userId: other.id,
        date: new Date("2026-04-01T00:00:00.000Z"),
        depAirport: "LFPN",
        arrAirport: "LFPN",
        engineStart: "12:00",
        engineStop: "13:00",
        actualDurationMin: 60,
        landings: 1,
        photos: [],
      },
    });

    const { updateFlightAsAdmin } = await import(
      "@/app/admin/flights/[id]/edit/actions"
    );

    // Try to lengthen seeded flight into 12:00–13:00 window.
    const r = await runExpectingRedirect(() =>
      updateFlightAsAdmin(
        buildEditFormData({
          flightId: seeded.flightId,
          engineStart: "10:00",
          engineStop: "12:30",
          flightDate: "2026-04-01",
          reason: "Ne devrait pas passer",
        }),
      ),
    );
    expect(r.url).toMatch(/error=engine/);

    // Neither the flight nor the ledger moved.
    const flight = await prisma.flight.findUniqueOrThrow({
      where: { id: seeded.flightId },
    });
    expect(flight.actualDurationMin).toBe(60);
    expect(
      await prisma.transaction.count({ where: { type: "ADMIN_ADJUSTMENT" } }),
    ).toBe(0);
  });
});
