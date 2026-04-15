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
      id: "00000000-0000-4000-a000-000000000001",
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
      id: "00000000-0000-4000-a000-000000000002",
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
      id: "00000000-0000-4000-a000-000000000003",
      email: "pilot2@test.local",
      name: "Pilot Two",
      passwordHash,
      role: "PILOT",
      isActive: true,
      mustResetPw: true,
      hdvBalanceMin: 0,
    },
  });

  // Seed three packages so /admin/tarifs has editable rows and the
  // pilot dashboard's "Forfaits HDV" section renders content.
  // Stripe IDs are synthetic — Stripe is never reached in the test
  // suite (the suite's STRIPE_SECRET_KEY is a fixture).
  await prisma.package.createMany({
    data: [
      {
        name: "Pack Découverte 3h",
        description: "Idéal pour tester l'avion sur une après-midi.",
        priceCentsHT: 42000,
        hdvMinutes: 180,
        isActive: true,
        sortOrder: 0,
        stripeProductId: "prod_test_decouverte",
        stripePriceId: "price_test_decouverte",
      },
      {
        name: "Pack Initiation 5h",
        description: "Pour accumuler l'heures en vols réguliers.",
        priceCentsHT: 65000,
        hdvMinutes: 300,
        isActive: true,
        sortOrder: 1,
        stripeProductId: "prod_test_initiation",
        stripePriceId: "price_test_initiation",
      },
      {
        name: "Pack Avancé 10h",
        description: "La plus économique au HDV.",
        priceCentsHT: 120000,
        hdvMinutes: 600,
        isActive: true,
        sortOrder: 2,
        stripeProductId: "prod_test_avance",
        stripePriceId: "price_test_avance",
      },
    ],
  });

  // Seed one past flight for pilot1 so /admin/flights/[id]/edit has a
  // target, paired with its FLIGHT_DEBIT ledger row so the invariant
  // (User.hdvBalanceMin == Σ transactions.amountMin) holds from t0.
  // pilot1 seeded with hdvBalanceMin=600 — we debit 90 min here and
  // leave the denormalised balance at 600 by crediting a
  // PACKAGE_PURCHASE of 90 to net it out. This keeps rule #2 intact
  // for factory users.
  const pilot1Id = "00000000-0000-4000-a000-000000000002";
  const flightDate = new Date();
  flightDate.setUTCDate(flightDate.getUTCDate() - 2);
  flightDate.setUTCHours(0, 0, 0, 0);

  const seededFlight = await prisma.flight.create({
    data: {
      userId: pilot1Id,
      date: flightDate,
      depAirport: "LFPN",
      arrAirport: "LFPO",
      engineStart: "10:00",
      engineStop: "11:30",
      actualDurationMin: 90,
      landings: 2,
      photos: [],
    },
  });
  // Balance-neutral seed: credit 90 min (balance 600→690), then debit
  // 90 min for the flight (690→600). User.hdvBalanceMin stays at 600
  // AND both Transaction rows carry the correct balanceAfterMin snapshots.
  await prisma.$transaction(async (tx) => {
    const credited = await tx.user.update({
      where: { id: pilot1Id },
      data: { hdvBalanceMin: 690 },
      select: { hdvBalanceMin: true },
    });
    await tx.transaction.create({
      data: {
        userId: pilot1Id,
        type: "PACKAGE_PURCHASE",
        amountMin: 90,
        balanceAfterMin: credited.hdvBalanceMin,
        reference: "seed-credit",
        performedById: pilot1Id,
      },
    });
    const debited = await tx.user.update({
      where: { id: pilot1Id },
      data: { hdvBalanceMin: 600 },
      select: { hdvBalanceMin: true },
    });
    await tx.transaction.create({
      data: {
        userId: pilot1Id,
        type: "FLIGHT_DEBIT",
        amountMin: -90,
        balanceAfterMin: debited.hdvBalanceMin,
        flightId: seededFlight.id,
        performedById: pilot1Id,
      },
    });
  });

  // Seed one PENDING BankTransfer for /admin/virements so the admin
  // queue has a row to validate/reject.
  await prisma.bankTransfer.create({
    data: {
      userId: "00000000-0000-4000-a000-000000000002",
      packageId: (await prisma.package.findFirstOrThrow({
        where: { name: "Pack Initiation 5h" },
      })).id,
      packageName: "Pack Initiation 5h",
      hdvMinutes: 300,
      priceCentsTTC: 78000,
      reference: "FS-TEST01",
      status: "PENDING",
    },
  });

  // Seed a bank account so /admin/tarifs renders the IBAN form
  // pre-filled and the pilot bank-transfer modal has data.
  await prisma.bankAccount.create({
    data: {
      holderName: "Aéroclub Test",
      iban: "FR7630006000011234567890189",
      bic: "AGRIFRPPXXX",
      bankName: "Crédit Agricole",
      instructions: "Référence obligatoire dans le libellé du virement.",
      updatedById: "00000000-0000-4000-a000-000000000001",
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
