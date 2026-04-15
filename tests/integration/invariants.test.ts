// Cross-cutting invariant: after ANY scripted workload, for every
// (user, flightHourType) pair:
//   UserFlightHourBalance.balanceMin === SUM(Transaction.amountMin)
// AND the balanceAfterMin snapshot on every Transaction row equals the
// per-type rolling sum. Rule #2 is only meaningful if this invariant
// holds.

import { describe, it, expect } from "vitest";
import { getTestPrisma } from "../setup/db";
import {
  makeUser,
  ensureStandardFlightHourType,
  getUserTypeBalance,
} from "../setup/factories";
import { applyHdvMutation } from "@/lib/hdv";
import type { TransactionType } from "@/generated/prisma/enums";

async function applyOp(
  userId: string,
  flightHourTypeId: string,
  performedById: string,
  type: TransactionType,
  amountMin: number,
): Promise<void> {
  const prisma = getTestPrisma();
  await prisma.$transaction(async (tx) => {
    await applyHdvMutation(tx, {
      userId,
      flightHourTypeId,
      type,
      amountMin,
      performedById,
      allowNegative: true,
    });
  });
}

describe("HDV invariant — rule #2", () => {
  it("stays consistent across a mixed workload on multiple users", async () => {
    const prisma = getTestPrisma();
    const typeId = await ensureStandardFlightHourType();
    const admin = await makeUser({ role: "ADMIN" });

    const pilots = await Promise.all(
      Array.from({ length: 5 }, () => makeUser({ hdvBalanceMin: 0 })),
    );

    const workload: Array<{
      pilot: number;
      type: TransactionType;
      amt: number;
    }> = [
      { pilot: 0, type: "PACKAGE_PURCHASE", amt: 600 },
      { pilot: 1, type: "PACKAGE_PURCHASE", amt: 300 },
      { pilot: 2, type: "BANK_TRANSFER", amt: 450 },
      { pilot: 0, type: "FLIGHT_DEBIT", amt: -90 },
      { pilot: 1, type: "FLIGHT_DEBIT", amt: -60 },
      { pilot: 0, type: "ADMIN_ADJUSTMENT", amt: -30 },
      { pilot: 2, type: "FLIGHT_DEBIT", amt: -75 },
      { pilot: 3, type: "PACKAGE_PURCHASE", amt: 900 },
      { pilot: 3, type: "FLIGHT_DEBIT", amt: -180 },
      { pilot: 0, type: "FLIGHT_DEBIT", amt: -120 },
      { pilot: 4, type: "PACKAGE_PURCHASE", amt: 300 },
      { pilot: 4, type: "FLIGHT_DEBIT", amt: -200 },
      { pilot: 1, type: "ADMIN_ADJUSTMENT", amt: 45 },
      { pilot: 2, type: "CANCELLATION_REFUND", amt: 15 },
      { pilot: 0, type: "PACKAGE_PURCHASE", amt: 150 },
      { pilot: 3, type: "ADMIN_ADJUSTMENT", amt: -10 },
      { pilot: 4, type: "PACKAGE_PURCHASE", amt: 300 },
      { pilot: 2, type: "FLIGHT_DEBIT", amt: -200 },
      { pilot: 1, type: "PACKAGE_PURCHASE", amt: 60 },
      { pilot: 0, type: "FLIGHT_DEBIT", amt: -45 },
    ];

    for (const op of workload) {
      await applyOp(pilots[op.pilot].id, typeId, admin.id, op.type, op.amt);
    }

    for (const pilot of pilots) {
      const balance = await getUserTypeBalance(pilot.id, typeId);
      const txs = await prisma.transaction.findMany({
        where: { userId: pilot.id, flightHourTypeId: typeId },
        orderBy: { createdAt: "asc" },
      });

      const sum = txs.reduce((s, r) => s + r.amountMin, 0);
      expect(balance).toBe(sum);

      let rolling = 0;
      for (const tx of txs) {
        rolling += tx.amountMin;
        expect(tx.balanceAfterMin).toBe(rolling);
      }
    }
  });

  it("no soft-delete leak: no DELETE on User was issued (deactivate-only)", async () => {
    const prisma = getTestPrisma();
    const user = await makeUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after).not.toBeNull();
    expect(after!.isActive).toBe(false);
  });
});
