// FlightSchedule — HDV mutation chokepoint.
//
// ARCHITECTURAL RULE #2 (load-bearing, V2.4 per-type rewrite):
//
//   Every change to a user's HDV balance MUST go through this function,
//   AND this function MUST be called inside an active Prisma transaction
//   (the caller passes the `tx` client). The Transaction table is the
//   source of truth; `UserFlightHourBalance(userId, flightHourTypeId)` is
//   the denormalized per-type cache and must always equal
//     SUM(Transaction.amountMin WHERE userId=U AND flightHourTypeId=T).
//
// Every Transaction belongs to exactly one FlightHourType. A user may
// only hold a non-zero balance in ONE type at a time — the
// "single-active-type invariant" — enforced on credits here.
//
// Common pitfalls:
//   - Calling this OUTSIDE a $transaction → balance and ledger can drift
//     if the caller's outer logic fails midway. Always wrap.
//   - Forgetting `performedById` → audit trail loses who triggered it.
//   - Negative debit amounts → pass `amountMin` as a SIGNED integer.
//     Credits are positive, debits are negative. Don't double-negate.
//   - Wrong `flightHourTypeId` on a flight debit → use
//     `resolveActiveFlightHourType()` from `./flightHourTypes` so the
//     debit lands on the pilot's currently active wallet.

import { TransactionType } from "@/generated/prisma/enums";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";

export type HdvMutationInput = {
  /** The user whose balance is changing. */
  userId: string;
  /** FlightHourType wallet this mutation applies to. Required on every call. */
  flightHourTypeId: string;
  /** Transaction type — see schema enum. */
  type: TransactionType;
  /** Signed delta in minutes. Positive = credit, negative = debit. */
  amountMin: number;
  /**
   * External reference. For Stripe purchases this is the Stripe session ID
   * (load-bearing for webhook idempotency — see rule #5). For admin
   * adjustments this is the human-readable reason text. Optional otherwise.
   */
  reference?: string | null;
  /** Optional FK to a flight (load-bearing on FLIGHT_DEBIT — links the ledger row to the logbook entry that produced it). */
  flightId?: string | null;
  /** Optional FK to a reservation (legacy V1 field — V2 reservations have no HDV impact, so this is rarely set anymore). */
  reservationId?: string | null;
  /** EUR cents charged (PACKAGE_PURCHASE / BANK_TRANSFER only). Stamped on the Transaction so admin reports can show "Montant dépensé" without a Stripe API round-trip. */
  priceCents?: number | null;
  /** Who triggered this — self for pilots, admin id for admin actions. */
  performedById: string;
  /**
   * If true, allow the resulting balance to go below zero. Defaults to
   * false. Used by FLIGHT_DEBIT (V2 — pilots may overdraft after a flight,
   * admin reconciles off-platform), negative ADMIN_ADJUSTMENT, and
   * CANCELLATION_REFUND.
   */
  allowNegative?: boolean;
  /**
   * If true, SKIP the single-active-type invariant check. Only the caller
   * knows when it is safe (e.g. a cancellation refund whose type matches
   * an originating debit, or an admin adjustment that the admin is
   * consciously making on top of an existing wallet). Defaults to false.
   */
  skipInvariantCheck?: boolean;
};

export type HdvMutationResult = {
  transactionId: string;
  newBalanceMin: number;
};

export class InsufficientBalanceError extends Error {
  constructor(have: number, need: number) {
    super(
      `Solde HDV insuffisant : ${have} minutes disponibles, ${need} requises.`,
    );
    this.name = "InsufficientBalanceError";
  }
}

export class MixedTypeBalanceError extends Error {
  /** Name of the blocking FlightHourType the user still has hours (or debt) in. */
  public readonly blockingTypeName: string;
  /** Minutes in the blocking type (signed — may be positive or negative). */
  public readonly blockingBalanceMin: number;
  constructor(blockingTypeName: string, blockingBalanceMin: number) {
    super(
      `Vous avez encore un solde en « ${blockingTypeName} » (${blockingBalanceMin} min). Ramenez-le à zéro avant d'acheter un forfait d'un autre type.`,
    );
    this.name = "MixedTypeBalanceError";
    this.blockingTypeName = blockingTypeName;
    this.blockingBalanceMin = blockingBalanceMin;
  }
}

/**
 * Insert a Transaction row and update the per-type UserFlightHourBalance
 * atomically.
 *
 * Must be called from within `prisma.$transaction(async (tx) => ...)`.
 * The first argument is the transaction client, NOT the singleton.
 */
export async function applyHdvMutation(
  tx: TransactionClient,
  input: HdvMutationInput,
): Promise<HdvMutationResult> {
  if (!Number.isInteger(input.amountMin)) {
    throw new Error(
      `applyHdvMutation: amountMin must be an integer (got ${input.amountMin})`,
    );
  }

  // 1. Single-active-type invariant — only guard true CREDITS. A debit
  //    (amountMin < 0) on any wallet is always allowed; cancellation
  //    refunds and negative admin adjustments are always safe.
  const isCredit = input.amountMin > 0;
  if (isCredit && !input.skipInvariantCheck) {
    const other = await tx.userFlightHourBalance.findFirst({
      where: {
        userId: input.userId,
        flightHourTypeId: { not: input.flightHourTypeId },
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

  // 2. Re-read (or create) the target wallet row inside the transaction.
  //    Under serializable isolation this guarantees no concurrent mutation
  //    can sneak in between read and write.
  const existing = await tx.userFlightHourBalance.findUnique({
    where: {
      userId_flightHourTypeId: {
        userId: input.userId,
        flightHourTypeId: input.flightHourTypeId,
      },
    },
    select: { balanceMin: true },
  });
  const currentBalanceMin = existing?.balanceMin ?? 0;

  const newBalanceMin = currentBalanceMin + input.amountMin;

  if (newBalanceMin < 0 && !input.allowNegative) {
    throw new InsufficientBalanceError(currentBalanceMin, -input.amountMin);
  }

  // 3. Insert the Transaction ledger row. balanceAfterMin is the per-type
  //    snapshot — see schema comment.
  const transaction = await tx.transaction.create({
    data: {
      userId: input.userId,
      flightHourTypeId: input.flightHourTypeId,
      type: input.type,
      amountMin: input.amountMin,
      balanceAfterMin: newBalanceMin,
      reference: input.reference ?? null,
      flightId: input.flightId ?? null,
      reservationId: input.reservationId ?? null,
      priceCents: input.priceCents ?? null,
      performedById: input.performedById,
    },
    select: { id: true },
  });

  // 4. Upsert the denormalized wallet row.
  await tx.userFlightHourBalance.upsert({
    where: {
      userId_flightHourTypeId: {
        userId: input.userId,
        flightHourTypeId: input.flightHourTypeId,
      },
    },
    create: {
      userId: input.userId,
      flightHourTypeId: input.flightHourTypeId,
      balanceMin: newBalanceMin,
    },
    update: {
      balanceMin: newBalanceMin,
    },
  });

  return {
    transactionId: transaction.id,
    newBalanceMin,
  };
}
