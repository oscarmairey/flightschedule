// FlightSchedule — test Postgres helpers.
//
// The test Prisma client is the SAME lazy singleton used by production
// code (`src/lib/db.ts`). Using one client instead of two avoids a
// subtle class of failure where writes from `testPrisma` aren't visible
// to the library code under test due to separate connection pools.
// Env guard (`tests/setup/env.ts`) ensures DATABASE_URL points at the
// sandbox before this module loads.

import "./env";
import { prisma } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";

export function getTestPrisma(): PrismaClient {
  return prisma;
}

// Order matters: child tables first so FK references are valid. We use
// TRUNCATE … CASCADE on the parent set to simplify, since the schema is
// small and the tables are not that interlinked. This is the fastest
// reset possible — far faster than `prisma migrate reset`.
const TABLES = [
  "BankTransfer",
  "Transaction",
  "Flight",
  "Reservation",
  "AvailabilityBlock",
  "OpenPeriod",
  "Package",
  "BankAccount",
  "User",
] as const;

export async function resetDb(): Promise<void> {
  const client = getTestPrisma();
  // Quote identifiers: Prisma creates tables in PascalCase which Postgres
  // treats as case-sensitive only when quoted.
  const quoted = TABLES.map((t) => `"${t}"`).join(", ");
  await client.$executeRawUnsafe(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
  );
}

export async function disconnectTestPrisma(): Promise<void> {
  await getTestPrisma().$disconnect();
}
