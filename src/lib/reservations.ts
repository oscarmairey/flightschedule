// FlySchedule — reservation booking and cancellation.
//
// ════════════════════════════════════════════════════════════════════
// HALF-OPEN INTERVAL CONVENTION
// ════════════════════════════════════════════════════════════════════
//
// Reservations are stored as `[startsAt, endsAt)`. Adjacent slots
// (e.g. 10:00–11:00 and 11:00–12:00) DO NOT collide. The overlap
// check is therefore:
//
//     existing.startsAt < requested.endsAt
//   AND existing.endsAt   > requested.startsAt
//
// Get this wrong and you either (a) leak overlapping bookings or
// (b) reject legitimate adjacent bookings. Test both edge cases when
// touching this file.
//
// ════════════════════════════════════════════════════════════════════
// ATOMICITY (architectural rule #3)
// ════════════════════════════════════════════════════════════════════
//
// `bookReservation` must run in a single Postgres transaction with
// SERIALIZABLE isolation. We retry up to 3 times on Postgres serialization
// failures (Prisma error P2034). At 5–12 users this never actually retries.

import { prisma } from "@/lib/db";
import { applyHdvMutation, InsufficientBalanceError } from "@/lib/hdv";
import { isWithinAvailability } from "@/lib/availability";

// Booking constraint defaults — see PRD §3.2.3 (PRD doesn't specify
// these, so we lock in sensible V1 defaults that the operator can
// adjust here without touching every server action).
export const RESERVATION_LIMITS = {
  MIN_DURATION_MIN: 30,
  MAX_DURATION_MIN: 8 * 60,
  /** Reservation start times must align to multiples of this many minutes. */
  SLOT_GRANULARITY_MIN: 30,
} as const;

export class OverlapError extends Error {
  constructor() {
    super("Cette plage chevauche une réservation existante.");
    this.name = "OverlapError";
  }
}

export class ReservationLockedError extends Error {
  constructor() {
    super("Réservation verrouillée : un vol y est déjà rattaché.");
    this.name = "ReservationLockedError";
  }
}

export class LateCancellationError extends Error {
  constructor() {
    super(
      "Annulation impossible à moins de 24 h du début. Contactez l'administrateur.",
    );
    this.name = "LateCancellationError";
  }
}

export class InvalidWindowError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidWindowError";
  }
}

const MAX_RETRIES = 3;

export type BookReservationInput = {
  userId: string;
  startsAtUtc: Date;
  endsAtUtc: Date;
};

export type BookReservationResult = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  durationMin: number;
  newBalanceMin: number;
};

/**
 * Atomically book a reservation. Throws on any precondition failure.
 *
 * Steps inside the serializable transaction:
 *   1. Validate window shape (duration, granularity, sanity)
 *   2. Validate the window falls inside availability
 *   3. Reject if any CONFIRMED reservation overlaps
 *   4. INSERT Reservation
 *   5. applyHdvMutation(RESERVATION_DEBIT, -durationMin)
 */
export async function bookReservation(
  input: BookReservationInput,
): Promise<BookReservationResult> {
  const durationMin = Math.round(
    (input.endsAtUtc.getTime() - input.startsAtUtc.getTime()) / 60_000,
  );

  if (
    durationMin < RESERVATION_LIMITS.MIN_DURATION_MIN ||
    durationMin > RESERVATION_LIMITS.MAX_DURATION_MIN
  ) {
    throw new InvalidWindowError(
      `Durée hors limites (entre ${RESERVATION_LIMITS.MIN_DURATION_MIN} min et ${RESERVATION_LIMITS.MAX_DURATION_MIN} min).`,
    );
  }
  if (durationMin % RESERVATION_LIMITS.SLOT_GRANULARITY_MIN !== 0) {
    throw new InvalidWindowError(
      `Durée non alignée sur ${RESERVATION_LIMITS.SLOT_GRANULARITY_MIN} minutes.`,
    );
  }

  // Availability uses the singleton client (no writes), safe outside the tx.
  const availOk = await isWithinAvailability(input.startsAtUtc, input.endsAtUtc);
  if (!availOk.ok) {
    throw new InvalidWindowError(availOk.reason);
  }

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          // Overlap check across ALL pilots (single aircraft).
          const conflict = await tx.reservation.findFirst({
            where: {
              status: "CONFIRMED",
              startsAt: { lt: input.endsAtUtc },
              endsAt: { gt: input.startsAtUtc },
            },
            select: { id: true },
          });
          if (conflict) throw new OverlapError();

          const created = await tx.reservation.create({
            data: {
              userId: input.userId,
              startsAt: input.startsAtUtc,
              endsAt: input.endsAtUtc,
              durationMin,
              hdvDeductedMin: durationMin,
              status: "CONFIRMED",
            },
            select: { id: true, startsAt: true, endsAt: true, durationMin: true },
          });

          const result = await applyHdvMutation(tx, {
            userId: input.userId,
            type: "RESERVATION_DEBIT",
            amountMin: -durationMin,
            reservationId: created.id,
            performedById: input.userId,
          });

          return {
            id: created.id,
            startsAt: created.startsAt,
            endsAt: created.endsAt,
            durationMin: created.durationMin,
            newBalanceMin: result.newBalanceMin,
          };
        },
        { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 },
      );
    } catch (err) {
      lastErr = err;
      // Re-throw business errors immediately — only retry on serialization failure.
      if (
        err instanceof OverlapError ||
        err instanceof InsufficientBalanceError ||
        err instanceof InvalidWindowError
      ) {
        throw err;
      }
      // Prisma serialization failure → retry
      const code = (err as { code?: string })?.code;
      if (code !== "P2034") throw err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("bookReservation: unknown failure after retries");
}

export type CancelReservationInput = {
  reservationId: string;
  /** The user requesting the cancellation. */
  actorId: string;
  /** Whether the actor is an admin (admin bypasses the 24h rule). */
  isAdmin: boolean;
};

export type CancelReservationResult = {
  refundedMin: number;
  newBalanceMin: number;
};

/**
 * Cancel a reservation and refund the original HDV deduction.
 *
 * Pilots may only cancel their own reservations, and only ≥24h before
 * start (PRD §3.2.4 / rule #7). Admins may cancel any reservation at
 * any time.
 *
 * A reservation that already has at least one Flight cannot be cancelled
 * — the flight is the source of truth that the reservation actually
 * happened, and is an immutable logbook record.
 */
export async function cancelReservation(
  input: CancelReservationInput,
): Promise<CancelReservationResult> {
  return await prisma.$transaction(
    async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: input.reservationId },
        include: { flights: { select: { id: true } } },
      });
      if (!reservation) {
        throw new Error("Réservation introuvable");
      }
      if (reservation.status !== "CONFIRMED") {
        throw new Error("Réservation déjà annulée");
      }
      if (!input.isAdmin && reservation.userId !== input.actorId) {
        throw new Error("Accès refusé");
      }
      if (reservation.flights.length > 0) {
        throw new ReservationLockedError();
      }

      if (!input.isAdmin) {
        const cutoff = new Date(reservation.startsAt.getTime() - 24 * 60 * 60 * 1000);
        if (new Date() >= cutoff) {
          throw new LateCancellationError();
        }
      }

      const newStatus = input.isAdmin ? "CANCELLED_BY_ADMIN" : "CANCELLED_BY_PILOT";

      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: newStatus,
          cancelledAt: new Date(),
          cancelledById: input.actorId,
        },
      });

      const result = await applyHdvMutation(tx, {
        userId: reservation.userId,
        type: "CANCELLATION_REFUND",
        amountMin: reservation.hdvDeductedMin, // positive — refund
        reservationId: reservation.id,
        performedById: input.actorId,
        // Refunds always succeed even if the user has been over-debited
        // by some other path (defensive).
        allowNegative: true,
      });

      return {
        refundedMin: reservation.hdvDeductedMin,
        newBalanceMin: result.newBalanceMin,
      };
    },
    { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 },
  );
}
