// Rule #2 — HDV ledger atomicity. Every Transaction + UserFlightHourBalance
// update goes through applyHdvMutation in one DB transaction. This suite
// asserts the invariant for the Standard type:
//   SUM(Transaction.amountMin WHERE type=Standard) == UserFlightHourBalance(Standard).balanceMin

import { describe, it, expect } from "vitest";
import { getTestPrisma } from "../setup/db";
import {
  makeUser,
  ensureStandardFlightHourType,
  getUserTypeBalance,
} from "../setup/factories";
import { applyHdvMutation, InsufficientBalanceError } from "@/lib/hdv";

async function sumLedger(userId: string, typeId: string): Promise<number> {
  const prisma = getTestPrisma();
  const rows = await prisma.transaction.findMany({
    where: { userId, flightHourTypeId: typeId },
    select: { amountMin: true },
  });
  return rows.reduce((s, r) => s + r.amountMin, 0);
}

describe("applyHdvMutation — rule #2", () => {
  it("credits the balance and snapshots balanceAfterMin", async () => {
    const prisma = getTestPrisma();
    const typeId = await ensureStandardFlightHourType();
    const user = await makeUser({ hdvBalanceMin: 0 });

    await prisma.$transaction(async (tx) => {
      await applyHdvMutation(tx, {
        userId: user.id,
        flightHourTypeId: typeId,
        type: "PACKAGE_PURCHASE",
        amountMin: 300,
        performedById: user.id,
        reference: "cs_test_123",
      });
    });

    expect(await getUserTypeBalance(user.id, typeId)).toBe(300);

    const txRow = await prisma.transaction.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(txRow.amountMin).toBe(300);
    expect(txRow.balanceAfterMin).toBe(300);
    expect(txRow.reference).toBe("cs_test_123");
    expect(txRow.flightHourTypeId).toBe(typeId);
  });

  it("debits the balance (FLIGHT_DEBIT with allowNegative)", async () => {
    const prisma = getTestPrisma();
    const typeId = await ensureStandardFlightHourType();
    const user = await makeUser({ hdvBalanceMin: 60 });

    await prisma.$transaction(async (tx) => {
      await applyHdvMutation(tx, {
        userId: user.id,
        flightHourTypeId: typeId,
        type: "FLIGHT_DEBIT",
        amountMin: -90,
        performedById: user.id,
        allowNegative: true,
      });
    });

    expect(await getUserTypeBalance(user.id, typeId)).toBe(-30);
  });

  it("refuses debits that would overdraft when allowNegative=false", async () => {
    const prisma = getTestPrisma();
    const typeId = await ensureStandardFlightHourType();
    const user = await makeUser({ hdvBalanceMin: 50 });

    await expect(
      prisma.$transaction(async (tx) => {
        await applyHdvMutation(tx, {
          userId: user.id,
          flightHourTypeId: typeId,
          type: "ADMIN_ADJUSTMENT",
          amountMin: -100,
          performedById: user.id,
          allowNegative: false,
        });
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);

    const txs = await prisma.transaction.count({ where: { userId: user.id } });
    expect(txs).toBe(0);
    expect(await getUserTypeBalance(user.id, typeId)).toBe(50);
  });

  it("rolls back the entire transaction if a later step throws", async () => {
    const prisma = getTestPrisma();
    const typeId = await ensureStandardFlightHourType();
    const user = await makeUser({ hdvBalanceMin: 100 });

    await expect(
      prisma.$transaction(async (tx) => {
        await applyHdvMutation(tx, {
          userId: user.id,
          flightHourTypeId: typeId,
          type: "ADMIN_ADJUSTMENT",
          amountMin: 50,
          performedById: user.id,
        });
        throw new Error("abort");
      }),
    ).rejects.toThrow(/abort/);

    expect(await getUserTypeBalance(user.id, typeId)).toBe(100);
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(
      0,
    );
  });

  it("keeps UserFlightHourBalance == SUM(Transaction.amountMin) after N mixed ops", async () => {
    const prisma = getTestPrisma();
    const typeId = await ensureStandardFlightHourType();
    const user = await makeUser({ hdvBalanceMin: 0 });
    const admin = await makeUser({ role: "ADMIN" });

    const ops: Array<{
      type: Parameters<typeof applyHdvMutation>[1]["type"];
      amt: number;
    }> = [
      { type: "PACKAGE_PURCHASE", amt: 600 },
      { type: "FLIGHT_DEBIT", amt: -90 },
      { type: "FLIGHT_DEBIT", amt: -120 },
      { type: "PACKAGE_PURCHASE", amt: 300 },
      { type: "ADMIN_ADJUSTMENT", amt: -15 },
      { type: "ADMIN_ADJUSTMENT", amt: 30 },
      { type: "FLIGHT_DEBIT", amt: -60 },
      { type: "BANK_TRANSFER", amt: 600 },
    ];

    for (const op of ops) {
      await prisma.$transaction(async (tx) => {
        await applyHdvMutation(tx, {
          userId: user.id,
          flightHourTypeId: typeId,
          type: op.type,
          amountMin: op.amt,
          performedById: admin.id,
          allowNegative: true,
        });
      });
    }

    const balance = await getUserTypeBalance(user.id, typeId);
    const ledger = await sumLedger(user.id, typeId);
    expect(balance).toBe(ledger);
    expect(balance).toBe(ops.reduce((s, o) => s + o.amt, 0));
  });

  it("rejects non-integer amountMin to avoid float drift", async () => {
    const prisma = getTestPrisma();
    const typeId = await ensureStandardFlightHourType();
    const user = await makeUser({ hdvBalanceMin: 0 });
    await expect(
      prisma.$transaction(async (tx) => {
        await applyHdvMutation(tx, {
          userId: user.id,
          flightHourTypeId: typeId,
          type: "ADMIN_ADJUSTMENT",
          amountMin: 1.5,
          performedById: user.id,
        });
      }),
    ).rejects.toThrow(/integer/i);
  });

  it("serialises two concurrent mutations without losing a Transaction", async () => {
    const prisma = getTestPrisma();
    const typeId = await ensureStandardFlightHourType();
    const user = await makeUser({ hdvBalanceMin: 0 });

    // Seed the starting balance through the ledger so the invariant
    // `balanceMin == SUM(amountMin)` holds at t0.
    await prisma.$transaction(async (tx) => {
      await applyHdvMutation(tx, {
        userId: user.id,
        flightHourTypeId: typeId,
        type: "PACKAGE_PURCHASE",
        amountMin: 1000,
        performedById: user.id,
        reference: "seed",
      });
    });

    const DEBIT_EACH = -100;

    async function doDebit(): Promise<void> {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          await prisma.$transaction(
            async (tx) => {
              await applyHdvMutation(tx, {
                userId: user.id,
                flightHourTypeId: typeId,
                type: "FLIGHT_DEBIT",
                amountMin: DEBIT_EACH,
                performedById: user.id,
                allowNegative: true,
              });
            },
            { isolationLevel: "Serializable" },
          );
          return;
        } catch (err) {
          const code = (err as { code?: string })?.code;
          if (code !== "P2034" && code !== "40001") throw err;
        }
      }
      throw new Error("Serialization retries exhausted");
    }

    await Promise.all([doDebit(), doDebit()]);

    const balance = await getUserTypeBalance(user.id, typeId);
    const count = await prisma.transaction.count({
      where: { userId: user.id },
    });
    expect(count).toBe(3); // seed + 2 debits
    expect(balance).toBe(1000 + 2 * DEBIT_EACH);
    expect(balance).toBe(await sumLedger(user.id, typeId));
  });
});
