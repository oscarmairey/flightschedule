// CAVOK — HDV mutation chokepoint.
//
// ARCHITECTURAL RULE #2 (load-bearing):
//
//   Every change to User.hdvBalanceMin MUST go through this function, AND
//   this function MUST be called inside an active Prisma transaction (the
//   caller passes the `tx` client). The Transaction table is the source of
//   truth — User.hdvBalanceMin is denormalized for read performance and
//   must always equal SUM(transactions.amountMin) for that user.
//
// If you find yourself updating `hdvBalanceMin` from anywhere else, stop
// and ask why. The answer is "you shouldn't be".
//
// Common pitfalls:
//   - Calling this OUTSIDE a $transaction → balance and ledger can drift
//     if the caller's outer logic fails midway. Always wrap.
//   - Forgetting `performedById` → audit trail loses who triggered it.
//     Use `userId` for self-service actions, the admin's id for admin
//     actions.
//   - Negative debit amounts → pass `amountMin` as a SIGNED integer.
//     Credits are positive, debits are negative. Don't double-negate.

import { TransactionType } from "@/generated/prisma/enums";
import type { TransactionClient } from "@/generated/prisma/internal/prismaNamespace";

export type HdvMutationInput = {
  /** The user whose balance is changing. */
  userId: string;
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
  /** Optional FK to a flight (used by FLIGHT_RECONCILIATION). */
  flightId?: string | null;
  /** Optional FK to a reservation (used by RESERVATION_DEBIT / refund). */
  reservationId?: string | null;
  /** Who triggered this — self for pilots, admin id for admin actions. */
  performedById: string;
  /**
   * If true, allow the resulting balance to go below zero. Defaults to
   * false. Used by ADMIN_ADJUSTMENT and CANCELLATION_REFUND for the rare
   * cases where balance arithmetic produces a negative.
   */
  allowNegative?: boolean;
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

/**
 * Insert a Transaction row and update User.hdvBalanceMin atomically.
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

  // Re-read the user row inside the transaction so we have the latest
  // balance. Under serializable isolation this guarantees no concurrent
  // mutation can sneak in between read and write — Postgres will abort
  // one of the transactions on conflict and the caller will retry.
  const user = await tx.user.findUnique({
    where: { id: input.userId },
    select: { id: true, hdvBalanceMin: true },
  });

  if (!user) {
    throw new Error(`applyHdvMutation: user ${input.userId} not found`);
  }

  const newBalanceMin = user.hdvBalanceMin + input.amountMin;

  if (newBalanceMin < 0 && !input.allowNegative) {
    throw new InsufficientBalanceError(user.hdvBalanceMin, -input.amountMin);
  }

  const transaction = await tx.transaction.create({
    data: {
      userId: input.userId,
      type: input.type,
      amountMin: input.amountMin,
      balanceAfterMin: newBalanceMin,
      reference: input.reference ?? null,
      flightId: input.flightId ?? null,
      reservationId: input.reservationId ?? null,
      performedById: input.performedById,
    },
    select: { id: true },
  });

  await tx.user.update({
    where: { id: input.userId },
    data: { hdvBalanceMin: newBalanceMin },
  });

  return {
    transactionId: transaction.id,
    newBalanceMin,
  };
}
