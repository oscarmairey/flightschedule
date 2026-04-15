// Rule #2 — HDV ledger atomicity. Every Transaction + User.hdvBalanceMin
// update goes through applyHdvMutation in one DB transaction. This suite
// asserts the invariant: SUM(Transaction.amountMin) == User.hdvBalanceMin.

import { describe, it, expect } from "vitest";
import { getTestPrisma } from "../setup/db";
import { makeUser } from "../setup/factories";
import { applyHdvMutation, InsufficientBalanceError } from "@/lib/hdv";

async function sumLedger(userId: string): Promise<number> {
  const prisma = getTestPrisma();
  const rows = await prisma.transaction.findMany({
    where: { userId },
    select: { amountMin: true },
  });
  return rows.reduce((s, r) => s + r.amountMin, 0);
}

describe("applyHdvMutation — rule #2", () => {
  it("credits the balance and snapshots balanceAfterMin", async () => {
    const prisma = getTestPrisma();
    const user = await makeUser({ hdvBalanceMin: 0 });

    await prisma.$transaction(async (tx) => {
      await applyHdvMutation(tx, {
        userId: user.id,
        type: "PACKAGE_PURCHASE",
        amountMin: 300,
        performedById: user.id,
        reference: "cs_test_123",
      });
    });

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(after.hdvBalanceMin).toBe(300);

    const tx = await prisma.transaction.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(tx.amountMin).toBe(300);
    expect(tx.balanceAfterMin).toBe(300);
    expect(tx.reference).toBe("cs_test_123");
  });

  it("debits the balance (FLIGHT_DEBIT with allowNegative)", async () => {
    const prisma = getTestPrisma();
    const user = await makeUser({ hdvBalanceMin: 60 });

    await prisma.$transaction(async (tx) => {
      await applyHdvMutation(tx, {
        userId: user.id,
        type: "FLIGHT_DEBIT",
        amountMin: -90,
        performedById: user.id,
        allowNegative: true,
      });
    });

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(after.hdvBalanceMin).toBe(-30);
  });

  it("refuses debits that would overdraft when allowNegative=false", async () => {
    const prisma = getTestPrisma();
    const user = await makeUser({ hdvBalanceMin: 50 });

    await expect(
      prisma.$transaction(async (tx) => {
        await applyHdvMutation(tx, {
          userId: user.id,
          type: "ADMIN_ADJUSTMENT",
          amountMin: -100,
          performedById: user.id,
          allowNegative: false,
        });
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);

    // No Transaction row should exist, balance unchanged.
    const txs = await prisma.transaction.count({ where: { userId: user.id } });
    expect(txs).toBe(0);
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(after.hdvBalanceMin).toBe(50);
  });

  it("rolls back the entire transaction if a later step throws", async () => {
    const prisma = getTestPrisma();
    const user = await makeUser({ hdvBalanceMin: 100 });

    await expect(
      prisma.$transaction(async (tx) => {
        await applyHdvMutation(tx, {
          userId: user.id,
          type: "ADMIN_ADJUSTMENT",
          amountMin: 50,
          performedById: user.id,
        });
        throw new Error("abort");
      }),
    ).rejects.toThrow(/abort/);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(after.hdvBalanceMin).toBe(100);
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(
      0,
    );
  });

  it("keeps User.hdvBalanceMin == SUM(Transaction.amountMin) after N mixed ops", async () => {
    const prisma = getTestPrisma();
    const user = await makeUser({ hdvBalanceMin: 0 });
    const admin = await makeUser({ role: "ADMIN" });

    const ops: Array<{ type: Parameters<typeof applyHdvMutation>[1]["type"]; amt: number }> = [
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
          type: op.type,
          amountMin: op.amt,
          performedById: admin.id,
          allowNegative: true,
        });
      });
    }

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    const ledger = await sumLedger(user.id);
    expect(after.hdvBalanceMin).toBe(ledger);
    expect(after.hdvBalanceMin).toBe(
      ops.reduce((s, o) => s + o.amt, 0),
    );
  });

  it("rejects non-integer amountMin to avoid float drift", async () => {
    const prisma = getTestPrisma();
    const user = await makeUser({ hdvBalanceMin: 0 });
    await expect(
      prisma.$transaction(async (tx) => {
        await applyHdvMutation(tx, {
          userId: user.id,
          type: "ADMIN_ADJUSTMENT",
          amountMin: 1.5,
          performedById: user.id,
        });
      }),
    ).rejects.toThrow(/integer/i);
  });

  it("serialises two concurrent mutations without losing a Transaction", async () => {
    const prisma = getTestPrisma();
    const user = await makeUser({ hdvBalanceMin: 0 });

    // Seed the starting balance through the ledger so the invariant
    // `hdvBalanceMin == SUM(amountMin)` holds at t0. Otherwise a direct
    // User.hdvBalanceMin set skips the ledger and breaks rule #2.
    await prisma.$transaction(async (tx) => {
      await applyHdvMutation(tx, {
        userId: user.id,
        type: "PACKAGE_PURCHASE",
        amountMin: 1000,
        performedById: user.id,
        reference: "seed",
      });
    });

    // Run two concurrent debits under Serializable. Postgres may abort
    // one with P2034 — we retry it once inline. The invariant after both
    // succeed is that three Transaction rows exist (seed + 2 debits) and
    // the balance reflects both.
    const DEBIT_EACH = -100;

    async function doDebit(): Promise<void> {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          await prisma.$transaction(
            async (tx) => {
              await applyHdvMutation(tx, {
                userId: user.id,
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

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    const count = await prisma.transaction.count({
      where: { userId: user.id },
    });
    expect(count).toBe(3); // seed + 2 debits
    expect(after.hdvBalanceMin).toBe(1000 + 2 * DEBIT_EACH);
    expect(after.hdvBalanceMin).toBe(await sumLedger(user.id));
  });
});
