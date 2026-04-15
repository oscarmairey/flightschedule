// FlightSchedule — test data factories.
//
// Thin helpers over the test Prisma client. Every factory returns a
// persisted row and accepts overrides. Composable — later factories
// default to an auto-created user when userId is omitted.

import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getTestPrisma } from "./db";
import type { Role, ReservationStatus, BankTransferStatus } from "@/generated/prisma/enums";

export const DEFAULT_PASSWORD = "Pilot-Test-1234";
let cachedHash: string | null = null;
async function defaultPasswordHash(): Promise<string> {
  if (cachedHash) return cachedHash;
  cachedHash = await hash(DEFAULT_PASSWORD, 4);
  return cachedHash;
}

function rand(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export type MakeUserOverrides = Partial<{
  email: string;
  name: string;
  role: Role;
  /**
   * Legacy single-wallet helper — seed the user with this many minutes on
   * the Standard FlightHourType wallet. Use `makeUserBalance` directly for
   * per-type seeding.
   */
  hdvBalanceMin: number;
  /** Override the FlightHourType the `hdvBalanceMin` seed lands on. */
  flightHourTypeId: string;
  mustResetPw: boolean;
  isActive: boolean;
  passwordHash: string;
}>;

export async function makeUser(overrides: MakeUserOverrides = {}) {
  const prisma = getTestPrisma();
  const email = overrides.email ?? `${rand("pilot")}@test.local`;
  const passwordHash = overrides.passwordHash ?? (await defaultPasswordHash());
  const user = await prisma.user.create({
    data: {
      email,
      name: overrides.name ?? "Test Pilot",
      passwordHash,
      role: overrides.role ?? "PILOT",
      mustResetPw: overrides.mustResetPw ?? false,
      isActive: overrides.isActive ?? true,
    },
  });
  if ((overrides.hdvBalanceMin ?? 0) !== 0) {
    const typeId =
      overrides.flightHourTypeId ?? (await ensureStandardFlightHourType());
    await prisma.userFlightHourBalance.create({
      data: {
        userId: user.id,
        flightHourTypeId: typeId,
        balanceMin: overrides.hdvBalanceMin!,
      },
    });
  }
  return user;
}

/**
 * Upserts the canonical "Standard" FlightHourType used by the migration
 * backfill + the factory helpers. Returns its id. Cached across one test
 * file's runs via the DB row (idempotent).
 */
export async function ensureStandardFlightHourType(): Promise<string> {
  const prisma = getTestPrisma();
  const standardId = "00000000-0000-4000-8000-000000000001";
  await prisma.flightHourType.upsert({
    where: { id: standardId },
    update: {},
    create: {
      id: standardId,
      name: "Standard",
      isActive: true,
    },
  });
  return standardId;
}

export type MakeFlightHourTypeOverrides = Partial<{
  name: string;
  description: string;
  isActive: boolean;
}>;

export async function makeFlightHourType(
  overrides: MakeFlightHourTypeOverrides = {},
) {
  const prisma = getTestPrisma();
  return prisma.flightHourType.create({
    data: {
      name: overrides.name ?? rand("Type"),
      description: overrides.description ?? null,
      isActive: overrides.isActive ?? true,
    },
  });
}

/**
 * Seed a user's per-type wallet directly. Skips `applyHdvMutation` (no
 * Transaction ledger row), so use only in fixtures where the test is
 * asserting balance-after-mutation behaviour, not ledger integrity.
 */
export async function makeUserBalance(params: {
  userId: string;
  flightHourTypeId: string;
  balanceMin: number;
}) {
  const prisma = getTestPrisma();
  return prisma.userFlightHourBalance.upsert({
    where: {
      userId_flightHourTypeId: {
        userId: params.userId,
        flightHourTypeId: params.flightHourTypeId,
      },
    },
    create: params,
    update: { balanceMin: params.balanceMin },
  });
}

/**
 * Helper to read a user's net balance across all types. Keeps the test
 * assertion-site short where the old `user.hdvBalanceMin` column was.
 */
export async function getUserNetBalance(userId: string): Promise<number> {
  const prisma = getTestPrisma();
  const agg = await prisma.userFlightHourBalance.aggregate({
    where: { userId },
    _sum: { balanceMin: true },
  });
  return agg._sum.balanceMin ?? 0;
}

/**
 * Helper to read a user's balance scoped to a single type.
 */
export async function getUserTypeBalance(
  userId: string,
  flightHourTypeId: string,
): Promise<number> {
  const prisma = getTestPrisma();
  const row = await prisma.userFlightHourBalance.findUnique({
    where: { userId_flightHourTypeId: { userId, flightHourTypeId } },
    select: { balanceMin: true },
  });
  return row?.balanceMin ?? 0;
}

export async function makeAdmin(overrides: MakeUserOverrides = {}) {
  return makeUser({ ...overrides, role: "ADMIN" });
}

export type MakeReservationOverrides = Partial<{
  userId: string;
  startsAt: Date;
  endsAt: Date;
  status: ReservationStatus;
  autoCreatedFromFlight: boolean;
  comment: string;
  estimatedFlightHours: number;
}>;

export async function makeReservation(overrides: MakeReservationOverrides = {}) {
  const prisma = getTestPrisma();
  const userId = overrides.userId ?? (await makeUser()).id;
  // Default: a 3h confirmed reservation starting "tomorrow 10:00 UTC".
  const startsAt =
    overrides.startsAt ??
    new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endsAt =
    overrides.endsAt ?? new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
  const durationMin = Math.round(
    (endsAt.getTime() - startsAt.getTime()) / 60_000,
  );
  return prisma.reservation.create({
    data: {
      userId,
      startsAt,
      endsAt,
      durationMin,
      comment: overrides.comment ?? null,
      estimatedFlightHours: overrides.estimatedFlightHours ?? null,
      status: overrides.status ?? "CONFIRMED",
      autoCreatedFromFlight: overrides.autoCreatedFromFlight ?? false,
    },
  });
}

export type MakeFlightOverrides = Partial<{
  userId: string;
  date: Date;
  depAirport: string;
  arrAirport: string;
  engineStart: string;
  engineStop: string;
  actualDurationMin: number;
  landings: number;
  photos: string[];
}>;

/**
 * Create a Flight row directly (no HDV side effect). Use this when you
 * want a pre-seeded flight for an admin-edit test. Exercising the full
 * atomic insert path goes through submitFlight/the server action.
 */
export async function makeFlight(overrides: MakeFlightOverrides = {}) {
  const prisma = getTestPrisma();
  const userId = overrides.userId ?? (await makeUser()).id;
  const date = overrides.date ?? new Date("2026-04-01T00:00:00.000Z");
  const engineStart = overrides.engineStart ?? "10:00";
  const engineStop = overrides.engineStop ?? "11:30";
  const actualDurationMin = overrides.actualDurationMin ?? 90;
  return prisma.flight.create({
    data: {
      userId,
      date,
      depAirport: overrides.depAirport ?? "LFPN",
      arrAirport: overrides.arrAirport ?? "LFPN",
      engineStart,
      engineStop,
      actualDurationMin,
      landings: overrides.landings ?? 1,
      photos: overrides.photos ?? [],
    },
  });
}

export type MakeAvailabilityBlockOverrides = Partial<{
  dayOfWeek: number;
  specificDate: Date;
  startMinutes: number;
  endMinutes: number;
  reason: string;
  createdById: string;
}>;

export async function makeAvailabilityBlock(
  overrides: MakeAvailabilityBlockOverrides = {},
) {
  const prisma = getTestPrisma();
  const createdById =
    overrides.createdById ?? (await makeAdmin()).id;
  const hasDay = overrides.dayOfWeek !== undefined;
  const hasDate = overrides.specificDate !== undefined;
  if (hasDay === hasDate) {
    throw new Error(
      "makeAvailabilityBlock: exactly one of dayOfWeek or specificDate is required",
    );
  }
  return prisma.availabilityBlock.create({
    data: {
      dayOfWeek: overrides.dayOfWeek ?? null,
      specificDate: overrides.specificDate ?? null,
      startMinutes: overrides.startMinutes ?? 0,
      endMinutes: overrides.endMinutes ?? 1440,
      reason: overrides.reason ?? null,
      createdById,
    },
  });
}

export type MakeOpenPeriodOverrides = Partial<{
  startDate: Date;
  endDate: Date;
  createdById: string;
  reason: string;
}>;

export async function makeOpenPeriod(overrides: MakeOpenPeriodOverrides = {}) {
  const prisma = getTestPrisma();
  const createdById =
    overrides.createdById ?? (await makeAdmin()).id;
  return prisma.openPeriod.create({
    data: {
      startDate: overrides.startDate ?? new Date("2020-01-01T00:00:00.000Z"),
      endDate: overrides.endDate ?? new Date("2100-12-31T00:00:00.000Z"),
      reason: overrides.reason ?? null,
      createdById,
    },
  });
}

export type MakePackageOverrides = Partial<{
  name: string;
  priceCentsHT: number;
  hdvMinutes: number;
  isActive: boolean;
  sortOrder: number;
  stripeProductId: string;
  stripePriceId: string;
  flightHourTypeId: string;
}>;

export async function makePackage(overrides: MakePackageOverrides = {}) {
  const prisma = getTestPrisma();
  const flightHourTypeId =
    overrides.flightHourTypeId ?? (await ensureStandardFlightHourType());
  return prisma.package.create({
    data: {
      name: overrides.name ?? "Pack Test 5h",
      priceCentsHT: overrides.priceCentsHT ?? 75000,
      hdvMinutes: overrides.hdvMinutes ?? 300,
      isActive: overrides.isActive ?? true,
      sortOrder: overrides.sortOrder ?? 0,
      stripeProductId: overrides.stripeProductId ?? rand("prod"),
      stripePriceId: overrides.stripePriceId ?? rand("price"),
      flightHourTypeId,
    },
  });
}

export type MakeBankTransferOverrides = Partial<{
  userId: string;
  packageId: string;
  packageName: string;
  hdvMinutes: number;
  priceCentsTTC: number;
  reference: string;
  status: BankTransferStatus;
  flightHourTypeId: string;
  flightHourTypeName: string;
}>;

export async function makeBankTransfer(
  overrides: MakeBankTransferOverrides = {},
) {
  const prisma = getTestPrisma();
  const userId = overrides.userId ?? (await makeUser()).id;
  const pkg = overrides.packageId ? null : await makePackage();
  const flightHourTypeId =
    overrides.flightHourTypeId ??
    pkg?.flightHourTypeId ??
    (await ensureStandardFlightHourType());
  const typeRow = await prisma.flightHourType.findUnique({
    where: { id: flightHourTypeId },
    select: { name: true },
  });
  return prisma.bankTransfer.create({
    data: {
      userId,
      packageId: overrides.packageId ?? pkg!.id,
      packageName: overrides.packageName ?? pkg?.name ?? "Pack Test",
      hdvMinutes: overrides.hdvMinutes ?? pkg?.hdvMinutes ?? 300,
      priceCentsTTC: overrides.priceCentsTTC ?? 90000,
      reference:
        overrides.reference ??
        `FS-${rand("REF").slice(-6).toUpperCase()}`,
      status: overrides.status ?? "PENDING",
      flightHourTypeId,
      flightHourTypeName:
        overrides.flightHourTypeName ?? typeRow?.name ?? "Standard",
    },
  });
}
