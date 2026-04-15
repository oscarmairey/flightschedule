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
      "AvailabilityBlock", "OpenPeriod", "Package", "BankAccount",
      "UserFlightHourBalance", "FlightHourType", "User"
    RESTART IDENTITY CASCADE
  `);

  const passwordHash = await hash("Pilot-Test-1234", 4);

  // V2.4 — seed the Standard FlightHourType first; all fixtures below
  // hang off it.
  const standardTypeId = "00000000-0000-4000-8000-000000000001";
  await prisma.flightHourType.create({
    data: {
      id: standardTypeId,
      name: "Standard",
      isActive: true,
    },
  });

  await prisma.user.create({
    data: {
      id: "00000000-0000-4000-a000-000000000001",
      email: "admin@test.local",
      name: "Test Admin",
      passwordHash,
      role: "ADMIN",
      isActive: true,
      mustResetPw: false,
    },
  });

  const pilot1Id = "00000000-0000-4000-a000-000000000002";
  await prisma.user.create({
    data: {
      id: pilot1Id,
      email: "pilot1@test.local",
      name: "Pilot One",
      passwordHash,
      role: "PILOT",
      isActive: true,
      mustResetPw: false,
    },
  });

  // Pilot 1 seeded with 600 min (10h) on the Standard wallet.
  await prisma.userFlightHourBalance.create({
    data: {
      userId: pilot1Id,
      flightHourTypeId: standardTypeId,
      balanceMin: 600,
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
        flightHourTypeId: standardTypeId,
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
        flightHourTypeId: standardTypeId,
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
        flightHourTypeId: standardTypeId,
      },
    ],
  });

  // Seed one past flight for pilot1 so /admin/flights/[id]/edit has a
  // target, paired with its FLIGHT_DEBIT ledger row so the per-type
  // invariant (UserFlightHourBalance.balanceMin == Σ tx.amountMin) holds
  // from t0. Net-neutral: credit 90, debit 90 — balance stays at 600.
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
  await prisma.$transaction(async (tx) => {
    // Credit 90 → balance 690.
    await tx.userFlightHourBalance.update({
      where: {
        userId_flightHourTypeId: {
          userId: pilot1Id,
          flightHourTypeId: standardTypeId,
        },
      },
      data: { balanceMin: 690 },
    });
    await tx.transaction.create({
      data: {
        userId: pilot1Id,
        flightHourTypeId: standardTypeId,
        type: "PACKAGE_PURCHASE",
        amountMin: 90,
        balanceAfterMin: 690,
        reference: "seed-credit",
        performedById: pilot1Id,
      },
    });
    // Debit 90 for the seeded flight → balance 600.
    await tx.userFlightHourBalance.update({
      where: {
        userId_flightHourTypeId: {
          userId: pilot1Id,
          flightHourTypeId: standardTypeId,
        },
      },
      data: { balanceMin: 600 },
    });
    await tx.transaction.create({
      data: {
        userId: pilot1Id,
        flightHourTypeId: standardTypeId,
        type: "FLIGHT_DEBIT",
        amountMin: -90,
        balanceAfterMin: 600,
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
      flightHourTypeId: standardTypeId,
      flightHourTypeName: "Standard",
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
