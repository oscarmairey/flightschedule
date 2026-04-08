// FlightSchedule — submit a flight entry. V2.
//
// Architectural rules in play:
//   #3b — Flight submission atomicity. The flight insert + FLIGHT_DEBIT
//         transaction + (auto-created or expanded) reservation all run
//         inside one serializable Postgres transaction.
//   #4  — A reservation may hold any number of flights. For "on the go"
//         flights without a prior booking, the server auto-creates the
//         reservation in the same transaction (autoCreatedFromFlight=true).
//   #6  — Server validates each photo key belongs to the current user.
//         V2: photos are OPTIONAL.
//   #9  — Flights are immutable on insert. The bloc OFF / bloc ON engine
//         times are required and drive `actualDurationMin`. The flight
//         is the V2 unit of HDV consumption.

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { isPhotoKeyOwnedBy, headObject, PHOTO_LIMITS } from "@/lib/r2";
import { parseEngineTimes, EngineTimesError } from "@/lib/duration";
import { parisLocalDateString } from "@/lib/format";
import { applyHdvMutation } from "@/lib/hdv";
import { isWithinAvailability } from "@/lib/availability";
import { IcaoSchema, UuidSchema } from "@/lib/validation";

const HHMMRequired = z.string().regex(/^\d{1,2}:\d{2}$/, "Format HH:MM attendu");

// `reservationSelection` is either the literal "onthego" or a UUID.
const ReservationSelectionSchema = z.union([
  z.literal("onthego"),
  UuidSchema,
]);

const SubmitFlightSchema = z.object({
  reservationSelection: ReservationSelectionSchema,
  depAirport: IcaoSchema,
  arrAirport: IcaoSchema,
  // Paris-local YYYY-MM-DD — the date the flight took place. The bloc OFF
  // engine time is paired with this date to compute the UTC instants.
  // This field is only used when reservationSelection === "onthego";
  // for an existing reservation, the date is taken from the reservation.
  flightDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  engineStart: HHMMRequired,
  engineStop: HHMMRequired,
  landings: z.coerce.number().int().min(1).max(99),
  remarks: z.string().trim().max(2000).optional(),
});

export async function submitFlight(formData: FormData) {
  const session = await requireSession();

  const parsed = SubmitFlightSchema.safeParse({
    reservationSelection: formData.get("reservationSelection") || "onthego",
    depAirport: formData.get("depAirport"),
    arrAirport: formData.get("arrAirport"),
    flightDate: formData.get("flightDate"),
    engineStart: formData.get("engineStart"),
    engineStop: formData.get("engineStop"),
    landings: formData.get("landings"),
    remarks: formData.get("remarks") || undefined,
  });
  if (!parsed.success) {
    redirect("/flights/new?error=invalid");
  }

  const mode: "existing" | "onthego" =
    parsed.data.reservationSelection === "onthego" ? "onthego" : "existing";
  const selectedReservationId =
    mode === "existing" ? parsed.data.reservationSelection : null;

  // For existing reservations, use the reservation's Paris-local date
  // (not the form's flightDate) so the engine times line up with the
  // reservation timeline.
  let parisDateForFlight = parsed.data.flightDate;
  if (mode === "existing" && selectedReservationId) {
    const r = await prisma.reservation.findUnique({
      where: { id: selectedReservationId },
      select: { startsAt: true },
    });
    if (r) {
      parisDateForFlight = parisLocalDateString(r.startsAt);
    }
  }

  // Compute UTC instants and duration from the bloc OFF / bloc ON times.
  let startsAtUtc: Date;
  let endsAtUtc: Date;
  let actualDurationMin: number;
  try {
    const result = parseEngineTimes(
      parisDateForFlight,
      parsed.data.engineStart,
      parsed.data.engineStop,
    );
    startsAtUtc = result.startsAtUtc;
    endsAtUtc = result.endsAtUtc;
    actualDurationMin = result.durationMin;
  } catch (err) {
    if (err instanceof EngineTimesError) {
      redirect(`/flights/new?error=engine&msg=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  // Photo keys (rule #6) — V2: optional, but still validated when present.
  const rawKeys = formData.getAll("photoKeys").filter((v) => typeof v === "string") as string[];
  if (rawKeys.length > PHOTO_LIMITS.MAX_PHOTOS_PER_FLIGHT) {
    redirect("/flights/new?error=too_many_photos");
  }
  for (const key of rawKeys) {
    if (!isPhotoKeyOwnedBy(key, session.user.id)) {
      console.warn(
        `[flights/new] Pilot ${session.user.id} submitted alien photo key ${key}`,
      );
      redirect("/flights/new?error=bad_photo_key");
    }
  }
  if (rawKeys.length > 0) {
    try {
      await Promise.all(rawKeys.map((k) => headObject(k)));
    } catch (err) {
      console.error("[flights/new] photo HEAD failed:", err);
      redirect("/flights/new?error=photo_missing");
    }
  }

  // Flight.date is the Paris-local date of the bloc OFF moment. With
  // cross-midnight flights, the bloc-OFF day stays — that matches how
  // pilots think of "the day I flew".
  const flightDateUtcMidnight = new Date(
    `${parisLocalDateString(startsAtUtc)}T00:00:00.000Z`,
  );

  try {
    await prisma.$transaction(
      async (tx) => {
        let reservationId: string;

        if (mode === "existing" && selectedReservationId) {
          // Look up + validate ownership/status
          const r = await tx.reservation.findUnique({
            where: { id: selectedReservationId },
            select: {
              id: true,
              userId: true,
              status: true,
              startsAt: true,
              endsAt: true,
            },
          });
          if (!r || r.userId !== session.user.id || r.status !== "CONFIRMED") {
            throw new BadReservationError();
          }

          // If the engine times exceed the reservation, try to expand the
          // reservation to envelope them. If expansion would collide with
          // another pilot or an unavailability block, fall back to attaching
          // without expanding (timestamps stay slightly misaligned).
          const newStart = startsAtUtc < r.startsAt ? startsAtUtc : r.startsAt;
          const newEnd = endsAtUtc > r.endsAt ? endsAtUtc : r.endsAt;
          if (
            newStart.getTime() !== r.startsAt.getTime() ||
            newEnd.getTime() !== r.endsAt.getTime()
          ) {
            const collision = await tx.reservation.findFirst({
              where: {
                id: { not: r.id },
                status: "CONFIRMED",
                startsAt: { lt: newEnd },
                endsAt: { gt: newStart },
              },
              select: { id: true },
            });
            const availOk =
              !collision && (await isWithinAvailability(newStart, newEnd));
            if (!collision && availOk && availOk.ok) {
              await tx.reservation.update({
                where: { id: r.id },
                data: {
                  startsAt: newStart,
                  endsAt: newEnd,
                  durationMin: Math.round(
                    (newEnd.getTime() - newStart.getTime()) / 60_000,
                  ),
                },
              });
            } else {
              console.warn(
                `[flights/new] reservation ${r.id} expansion blocked (collision or unavailability) — attaching flight without expansion`,
              );
            }
          }
          reservationId = r.id;
        } else {
          // mode === "onthego": try to find an existing same-user reservation
          // that already contains the engine window.
          const containing = await tx.reservation.findFirst({
            where: {
              userId: session.user.id,
              status: "CONFIRMED",
              startsAt: { lte: startsAtUtc },
              endsAt: { gte: endsAtUtc },
            },
            select: { id: true },
          });
          if (containing) {
            reservationId = containing.id;
          } else {
            // Cross-pilot overlap = data integrity violation. Reject hard.
            const crossPilot = await tx.reservation.findFirst({
              where: {
                userId: { not: session.user.id },
                status: "CONFIRMED",
                startsAt: { lt: endsAtUtc },
                endsAt: { gt: startsAtUtc },
              },
              select: { id: true, userId: true },
            });
            if (crossPilot) {
              console.error(
                `[flights/new][ALERT] cross-pilot overlap: pilot=${session.user.id} engine=[${startsAtUtc.toISOString()},${endsAtUtc.toISOString()}) collides with reservation=${crossPilot.id} owner=${crossPilot.userId}`,
              );
              throw new CrossPilotOverlapError();
            }
            // Auto-create. No availability check — the flight has already
            // happened; an unavailability block would mean the admin set
            // it after the fact.
            const created = await tx.reservation.create({
              data: {
                userId: session.user.id,
                startsAt: startsAtUtc,
                endsAt: endsAtUtc,
                durationMin: actualDurationMin,
                status: "CONFIRMED",
                autoCreatedFromFlight: true,
              },
              select: { id: true },
            });
            reservationId = created.id;
          }
        }

        const flight = await tx.flight.create({
          data: {
            userId: session.user.id,
            reservationId,
            date: flightDateUtcMidnight,
            depAirport: parsed.data.depAirport,
            arrAirport: parsed.data.arrAirport,
            actualDurationMin,
            engineStart: parsed.data.engineStart,
            engineStop: parsed.data.engineStop,
            landings: parsed.data.landings,
            remarks: parsed.data.remarks || null,
            photos: rawKeys,
          },
          select: { id: true },
        });

        await applyHdvMutation(tx, {
          userId: session.user.id,
          type: "FLIGHT_DEBIT",
          amountMin: -actualDurationMin,
          flightId: flight.id,
          performedById: session.user.id,
          allowNegative: true,
        });
      },
      { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 },
    );
  } catch (err) {
    if (err instanceof BadReservationError) {
      redirect("/flights/new?error=bad_reservation");
    }
    if (err instanceof CrossPilotOverlapError) {
      redirect("/flights/new?error=cross_pilot");
    }
    throw err;
  }

  revalidatePath("/flights");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  redirect(`/flights/new?added=1`);
}

class BadReservationError extends Error {
  constructor() {
    super("Réservation invalide");
    this.name = "BadReservationError";
  }
}

class CrossPilotOverlapError extends Error {
  constructor() {
    super(
      "Conflit avec une réservation d'un autre pilote — contactez l'administrateur.",
    );
    this.name = "CrossPilotOverlapError";
  }
}
