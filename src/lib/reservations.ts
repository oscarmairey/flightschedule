// FlightSchedule — reservation booking and cancellation.
//
// ════════════════════════════════════════════════════════════════════
// V2 — RESERVATIONS ARE PURE SCHEDULING BLOCKS
// ════════════════════════════════════════════════════════════════════
//
// Bookings have no HDV impact. They exist only to prevent overlap and
// to respect availability exceptions. Cancellation is a status update —
// nothing to refund. The HDV ledger only moves at flight submission
// time (FLIGHT_DEBIT). See CLAUDE.md rules #3, #3b, #4, #7.
//
// ════════════════════════════════════════════════════════════════════
// HALF-OPEN INTERVAL CONVENTION
// ════════════════════════════════════════════════════════════════════
//
// Reservations are stored as `[startsAt, endsAt)`. Adjacent slots
// (e.g. 09:00–12:00 and 12:00–15:00) DO NOT collide. The overlap
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
// `bookReservation` runs in a single Postgres transaction with
// SERIALIZABLE isolation. We retry up to 3 times on Postgres serialization
// failures (Prisma error P2034). At 5–12 users this never actually retries.
// The transaction now contains: overlap check + INSERT Reservation. The
// availability check runs on the singleton client outside the tx.

import { prisma } from "@/lib/db";
import { isWithinAvailability } from "@/lib/availability";

// Booking constraint defaults — V2 uses 3-hour blocks per the calendar
// grid. Min = 1 block (3h), max = 30 days (multi-day reservations are
// supported for long trips), granularity = 3h.
export const RESERVATION_LIMITS = {
  MIN_DURATION_MIN: 3 * 60,
  MAX_DURATION_MIN: 30 * 24 * 60,
  /** Reservation start times must align to multiples of this many minutes. */
  SLOT_GRANULARITY_MIN: 3 * 60,
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
  comment?: string;
  estimatedFlightHours?: number;
};

export type BookReservationResult = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  durationMin: number;
  comment: string | null;
  estimatedFlightHours: number | null;
};

/**
 * Atomically book a reservation. Throws on any precondition failure.
 *
 * V2 — no HDV impact. Steps inside the serializable transaction:
 *   1. Validate window shape (duration, granularity, sanity)
 *   2. Validate the window falls outside any unavailability exception
 *   3. Reject if any CONFIRMED reservation overlaps
 *   4. INSERT Reservation
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
      `Durée hors limites (entre ${RESERVATION_LIMITS.MIN_DURATION_MIN / 60} h et ${RESERVATION_LIMITS.MAX_DURATION_MIN / 60 / 24} jours).`,
    );
  }
  if (durationMin % RESERVATION_LIMITS.SLOT_GRANULARITY_MIN !== 0) {
    throw new InvalidWindowError(
      `Durée non alignée sur des blocs de ${RESERVATION_LIMITS.SLOT_GRANULARITY_MIN / 60} h.`,
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
              comment: input.comment ?? null,
              estimatedFlightHours: input.estimatedFlightHours ?? null,
              status: "CONFIRMED",
            },
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              durationMin: true,
              comment: true,
              estimatedFlightHours: true,
            },
          });

          return {
            id: created.id,
            startsAt: created.startsAt,
            endsAt: created.endsAt,
            durationMin: created.durationMin,
            comment: created.comment,
            estimatedFlightHours:
              created.estimatedFlightHours === null
                ? null
                : Number(created.estimatedFlightHours),
          };
        },
        { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 },
      );
    } catch (err) {
      lastErr = err;
      // Re-throw business errors immediately — only retry on serialization failure.
      if (err instanceof OverlapError || err instanceof InvalidWindowError) {
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

export class AutoCreatedReservationError extends Error {
  constructor() {
    super(
      "Cette réservation a été créée automatiquement par un vol et ne peut pas être annulée. Le vol fait foi.",
    );
    this.name = "AutoCreatedReservationError";
  }
}

/**
 * Cancel a reservation. V2 — pure status update, no HDV impact.
 *
 * Pilots may only cancel their own reservations, and only ≥24h before
 * start (rule #7). Admins may cancel any reservation at any time.
 *
 * A reservation that already has at least one Flight cannot be cancelled
 * — the flight is the source of truth that the reservation actually
 * happened, and is an immutable logbook record.
 *
 * A reservation with `autoCreatedFromFlight = true` cannot be cancelled
 * by anyone (including admin). The underlying flight is the only thing
 * that owns its existence; cancelling would orphan the FK.
 *
 * The transaction wrapper is kept (single statement now) for future-
 * proofing against added side effects.
 */
export async function cancelReservation(
  input: CancelReservationInput,
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: input.reservationId },
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
      if (reservation.autoCreatedFromFlight) {
        throw new AutoCreatedReservationError();
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
    },
    { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 },
  );
}
