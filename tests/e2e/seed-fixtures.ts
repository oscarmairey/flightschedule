// Standalone seed script used by tests/e2e/global-setup.ts. Runs in its
// own tsx process so Playwright's CJS loader doesn't have to evaluate
// the ESM-only Prisma client in-band.

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { hash } from "bcryptjs";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const envFile = path.resolve(__dirname, "../../.env.test");
if (fs.existsSync(envFile)) {
  loadEnv({ path: envFile, override: true });
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/:5443\/cavok_test(\?|$)/.test(url)) {
    throw new Error(`seed-fixtures: unsafe DATABASE_URL "${url}"`);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "BankTransfer", "Transaction", "Flight", "Reservation",
      "AvailabilityBlock", "OpenPeriod", "Package", "BankAccount", "User"
    RESTART IDENTITY CASCADE
  `);

  const passwordHash = await hash("Pilot-Test-1234", 4);

  await prisma.user.create({
    data: {
      id: "00000000-0000-0000-0000-00000000a001",
      email: "admin@test.local",
      name: "Test Admin",
      passwordHash,
      role: "ADMIN",
      isActive: true,
      mustResetPw: false,
      hdvBalanceMin: 0,
    },
  });

  await prisma.user.create({
    data: {
      id: "00000000-0000-0000-0000-0000000000a1",
      email: "pilot1@test.local",
      name: "Pilot One",
      passwordHash,
      role: "PILOT",
      isActive: true,
      mustResetPw: false,
      hdvBalanceMin: 600,
    },
  });

  await prisma.user.create({
    data: {
      id: "00000000-0000-0000-0000-0000000000a2",
      email: "pilot2@test.local",
      name: "Pilot Two",
      passwordHash,
      role: "PILOT",
      isActive: true,
      mustResetPw: true,
      hdvBalanceMin: 0,
    },
  });

  await prisma.$disconnect();
  // eslint-disable-next-line no-console
  console.log("E2E fixtures seeded.");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("seed-fixtures failed:", err);
  process.exit(1);
});
