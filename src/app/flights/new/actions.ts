// CAVOK — submit a flight entry.
//
// Architectural rules in play:
//   #2 — applyHdvMutation chokepoint for any reconciliation
//   #4 — Reservation ↔ Flight is 1:1 mandatory
//   #6 — server validates each photo key belongs to current user
//   #9 — flights start as PENDING; only admin can validate

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { applyHdvMutation } from "@/lib/hdv";
import { isPhotoKeyOwnedBy, headObject, PHOTO_LIMITS } from "@/lib/r2";
import { parseHHMM } from "@/lib/duration";
import { IcaoSchema, UuidSchema } from "@/lib/validation";

const HHMMTime = z
  .string()
  .regex(/^\d{1,2}:\d{2}$/, "Format HH:MM attendu")
  .optional()
  .or(z.literal(""));

const SubmitFlightSchema = z.object({
  reservationId: UuidSchema,
  depAirport: IcaoSchema,
  arrAirport: IcaoSchema,
  durationStr: z.string().min(1, "Durée obligatoire"),
  engineStart: HHMMTime,
  engineStop: HHMMTime,
  landings: z.coerce.number().int().min(1).max(99),
  remarks: z.string().trim().max(2000).optional(),
});

export async function submitFlight(formData: FormData) {
  const session = await requireSession();

  const parsed = SubmitFlightSchema.safeParse({
    reservationId: formData.get("reservationId"),
    depAirport: formData.get("depAirport"),
    arrAirport: formData.get("arrAirport"),
    durationStr: formData.get("durationStr"),
    engineStart: formData.get("engineStart") || "",
    engineStop: formData.get("engineStop") || "",
    landings: formData.get("landings"),
    remarks: formData.get("remarks") || undefined,
  });
  if (!parsed.success) {
    redirect("/flights/new?error=invalid");
  }

  const actualDurationMin = parseHHMM(parsed.data.durationStr);
  if (actualDurationMin === null || actualDurationMin <= 0) {
    redirect("/flights/new?error=bad_duration");
  }

  // Photo keys (rule #6 ownership validation)
  const rawKeys = formData.getAll("photoKeys").filter((v) => typeof v === "string") as string[];
  if (rawKeys.length === 0) {
    redirect("/flights/new?error=no_photos");
  }
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
  // HEAD-check each key actually exists in R2 (defensive)
  try {
    await Promise.all(rawKeys.map((k) => headObject(k)));
  } catch (err) {
    console.error("[flights/new] photo HEAD failed:", err);
    redirect("/flights/new?error=photo_missing");
  }

  // Validate the reservation belongs to the user, is confirmed, and has no flight
  const reservation = await prisma.reservation.findUnique({
    where: { id: parsed.data.reservationId },
    include: { flight: { select: { id: true } } },
  });
  if (
    !reservation ||
    reservation.userId !== session.user.id ||
    reservation.status !== "CONFIRMED"
  ) {
    redirect("/flights/new?error=bad_reservation");
  }
  if (reservation.flight) {
    redirect("/flights/new?error=already_logged");
  }

  // Reconciliation: positive delta = credit (flew less than reserved),
  // negative delta = debit (flew more than reserved).
  const reconciliationDeltaMin = reservation.durationMin - actualDurationMin;

  // Use the reservation's UTC date for the Flight.date field (date-only).
  const flightDate = new Date(
    `${reservation.startsAt.toISOString().slice(0, 10)}T00:00:00.000Z`,
  );

  await prisma.$transaction(async (tx) => {
    const created = await tx.flight.create({
      data: {
        userId: session.user.id,
        reservationId: reservation.id,
        date: flightDate,
        depAirport: parsed.data.depAirport,
        arrAirport: parsed.data.arrAirport,
        actualDurationMin,
        reservedDurationMin: reservation.durationMin,
        reconciliationDeltaMin,
        engineStart: parsed.data.engineStart || null,
        engineStop: parsed.data.engineStop || null,
        landings: parsed.data.landings,
        remarks: parsed.data.remarks || null,
        photos: rawKeys,
        status: "PENDING",
      },
      select: { id: true },
    });

    if (reconciliationDeltaMin !== 0) {
      await applyHdvMutation(tx, {
        userId: session.user.id,
        type: "FLIGHT_RECONCILIATION",
        amountMin: reconciliationDeltaMin,
        flightId: created.id,
        reservationId: reservation.id,
        performedById: session.user.id,
        // A reconciliation debit (overrun) can theoretically push the
        // balance below zero — allow it; the admin will reconcile.
        allowNegative: true,
      });
    }
  });

  revalidatePath("/flights");
  revalidatePath("/dashboard");
  revalidatePath("/admin/flights");
  redirect("/flights?submitted=1");
}
