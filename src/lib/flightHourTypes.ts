// FlightSchedule V2.4 — per-type HDV helper functions.
//
// See schema: FlightHourType, UserFlightHourBalance, Transaction.
//
// These helpers are tx-aware: every function takes a TransactionClient so
// the caller composes them with `applyHdvMutation` inside one serializable
// Postgres transaction (rule #2 / #3b).

import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";
import { MixedTypeBalanceError } from "./hdv";

export type UserTypeBalance = {
  typeId: string;
  typeName: string;
  typeIsActive: boolean;
  balanceMin: number;
};

/**
 * Return every type the user has an UserFlightHourBalance row for, sorted
 * alphabetically by FlightHourType.name. Zero-balance rows are included —
 * they carry audit signal ("pilot used to fly École, now at 0"). Callers
 * that only care about active wallets can filter by `balanceMin !== 0`.
 */
export async function getUserBalances(
  tx: TransactionClient,
  userId: string,
): Promise<UserTypeBalance[]> {
  const rows = await tx.userFlightHourBalance.findMany({
    where: { userId },
    select: {
      balanceMin: true,
      flightHourType: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
    },
    orderBy: [{ flightHourType: { name: "asc" } }],
  });
  return rows.map((row) => ({
    typeId: row.flightHourType.id,
    typeName: row.flightHourType.name,
    typeIsActive: row.flightHourType.isActive,
    balanceMin: row.balanceMin,
  }));
}

/**
 * Resolve the FlightHourType a new FLIGHT_DEBIT should land on for a
 * given pilot.
 *
 * Rules (in order):
 *   1. If exactly one wallet has `balanceMin > 0`, use it. (This is the
 *      common case under the single-active-type invariant.)
 *   2. Otherwise fall back to the type of the user's most recent
 *      Transaction — so a pilot who just went to 0h and flies again
 *      overdrafts the same wallet they were flying.
 *   3. If the user has no Transaction history at all, return null and let
 *      the caller reject the flight with a French error.
 */
export async function resolveActiveFlightHourType(
  tx: TransactionClient,
  userId: string,
): Promise<string | null> {
  const positive = await tx.userFlightHourBalance.findFirst({
    where: { userId, balanceMin: { gt: 0 } },
    select: { flightHourTypeId: true },
    orderBy: { flightHourType: { name: "asc" } },
  });
  if (positive) return positive.flightHourTypeId;

  const latest = await tx.transaction.findFirst({
    where: { userId },
    select: { flightHourTypeId: true },
    orderBy: { createdAt: "desc" },
  });
  return latest?.flightHourTypeId ?? null;
}

/**
 * Throw `MixedTypeBalanceError` if the user holds a non-zero balance in
 * any type OTHER than `targetTypeId`. Reused outside `applyHdvMutation`
 * by the pre-checkout guard so the Stripe redirect never happens on a
 * doomed purchase — the user sees the French error on /dashboard instead.
 *
 * Must be called inside a transaction if the caller is about to mutate —
 * otherwise a concurrent flight debit could sneak in between the check
 * and the purchase. When used purely for UI feedback (greying out
 * package cards on initial render) it's fine to call with the singleton.
 */
export async function assertSingleActiveTypeForCredit(
  tx: TransactionClient,
  userId: string,
  targetTypeId: string,
): Promise<void> {
  const other = await tx.userFlightHourBalance.findFirst({
    where: {
      userId,
      flightHourTypeId: { not: targetTypeId },
      balanceMin: { not: 0 },
    },
    select: {
      balanceMin: true,
      flightHourType: { select: { name: true } },
    },
  });
  if (other) {
    throw new MixedTypeBalanceError(
      other.flightHourType.name,
      other.balanceMin,
    );
  }
}
