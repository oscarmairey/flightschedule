// Bank transfer flow — /admin/virements validate/reject and the
// pilot-side /dashboard prepare/confirm. Ledger contract (rule #2) must
// hold across the pilot-admin handoff.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestPrisma } from "../setup/db";
import {
  makeUser,
  makePackage,
  makeBankTransfer,
  getUserNetBalance,
} from "../setup/factories";

let currentAdminId: string = "";
let currentPilotId: string = "";

vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    user: {
      id: currentPilotId,
      email: "pilot@test.local",
      role: "PILOT",
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

function captureRedirect(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const digest = (err as { digest?: string }).digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT"))
    return null;
  return digest.split(";")[2] ?? "";
}

async function runExpectingRedirect(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    const u = captureRedirect(err);
    if (u !== null) return u;
    throw err;
  }
  throw new Error("Expected redirect");
}

describe("Bank transfer flow", () => {
  beforeEach(() => {
    currentAdminId = "";
    currentPilotId = "";
  });

  it("admin validate: PENDING → VALIDATED creates a BANK_TRANSFER Transaction", async () => {
    const prisma = getTestPrisma();
    const admin = await makeUser({ role: "ADMIN" });
    const pilot = await makeUser({ hdvBalanceMin: 0 });
    const pkg = await makePackage({ hdvMinutes: 300, priceCentsHT: 75000 });
    const bt = await makeBankTransfer({
      userId: pilot.id,
      packageId: pkg.id,
      packageName: pkg.name,
      hdvMinutes: 300,
      priceCentsTTC: 90000,
      status: "PENDING",
    });
    currentAdminId = admin.id;

    const { validateBankTransfer } = await import(
      "@/app/admin/virements/actions"
    );
    const fd = new FormData();
    fd.set("id", bt.id);

    const url = await runExpectingRedirect(() => validateBankTransfer(fd));
    expect(url).toMatch(/virements/);

    const btAfter = await prisma.bankTransfer.findUniqueOrThrow({
      where: { id: bt.id },
    });
    expect(btAfter.status).toBe("VALIDATED");
    expect(btAfter.transactionId).not.toBeNull();
    expect(btAfter.reviewedById).toBe(admin.id);
    expect(btAfter.reviewedAt).not.toBeNull();

    const tx = await prisma.transaction.findUniqueOrThrow({
      where: { id: btAfter.transactionId! },
    });
    expect(tx.type).toBe("BANK_TRANSFER");
    expect(tx.amountMin).toBe(300);
    expect(tx.priceCents).toBe(90000);
    expect(tx.userId).toBe(pilot.id);

    expect(await getUserNetBalance(pilot.id)).toBe(300);
  });

  it("admin reject: PENDING → REJECTED with no Transaction created", async () => {
    const prisma = getTestPrisma();
    const admin = await makeUser({ role: "ADMIN" });
    const pilot = await makeUser();
    const bt = await makeBankTransfer({
      userId: pilot.id,
      status: "PENDING",
    });
    currentAdminId = admin.id;

    const { rejectBankTransfer } = await import(
      "@/app/admin/virements/actions"
    );
    const fd = new FormData();
    fd.set("id", bt.id);
    fd.set("rejectionNote", "Virement jamais reçu.");

    await runExpectingRedirect(() => rejectBankTransfer(fd));

    const btAfter = await prisma.bankTransfer.findUniqueOrThrow({
      where: { id: bt.id },
    });
    expect(btAfter.status).toBe("REJECTED");
    expect(btAfter.rejectionNote).toMatch(/jamais/);
    expect(btAfter.transactionId).toBeNull();
    expect(
      await prisma.transaction.count({ where: { userId: pilot.id } }),
    ).toBe(0);
  });

  it("double-validate is a no-op on the second call (status guard)", async () => {
    const prisma = getTestPrisma();
    const admin = await makeUser({ role: "ADMIN" });
    const pilot = await makeUser();
    const pkg = await makePackage({ hdvMinutes: 180 });
    const bt = await makeBankTransfer({
      userId: pilot.id,
      packageId: pkg.id,
      hdvMinutes: 180,
      priceCentsTTC: 60000,
      status: "PENDING",
    });
    currentAdminId = admin.id;

    const { validateBankTransfer } = await import(
      "@/app/admin/virements/actions"
    );
    const fd = () => {
      const f = new FormData();
      f.set("id", bt.id);
      return f;
    };

    await runExpectingRedirect(() => validateBankTransfer(fd()));
    await runExpectingRedirect(() => validateBankTransfer(fd()));

    const txs = await prisma.transaction.count({ where: { userId: pilot.id } });
    expect(txs).toBe(1);
    expect(await getUserNetBalance(pilot.id)).toBe(180);
  });
});
