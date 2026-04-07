// FlySchedule — submit a flight entry.
//
// Architectural rules in play:
//   #4 — Reservation ↔ Flight is 1:N (one reservation can hold many flights)
//   #6 — server validates each photo key belongs to current user
//   #9 — flights are immutable logbook records; no validation, no
//        reconciliation, no HDV impact. The reservation already debited
//        the slot at booking time and that is the entire HDV story.

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
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

  // Validate the reservation belongs to the user and is confirmed.
  // Note: a reservation can hold any number of flights — no "already logged"
  // check, this is the multi-leg flow.
  const reservation = await prisma.reservation.findUnique({
    where: { id: parsed.data.reservationId },
    select: { id: true, userId: true, status: true, startsAt: true },
  });
  if (
    !reservation ||
    reservation.userId !== session.user.id ||
    reservation.status !== "CONFIRMED"
  ) {
    redirect("/flights/new?error=bad_reservation");
  }

  // Use the reservation's UTC date for the Flight.date field (date-only).
  const flightDate = new Date(
    `${reservation.startsAt.toISOString().slice(0, 10)}T00:00:00.000Z`,
  );

  // Plain insert — no transaction needed (no HDV mutation, single row).
  await prisma.flight.create({
    data: {
      userId: session.user.id,
      reservationId: reservation.id,
      date: flightDate,
      depAirport: parsed.data.depAirport,
      arrAirport: parsed.data.arrAirport,
      actualDurationMin,
      engineStart: parsed.data.engineStart || null,
      engineStop: parsed.data.engineStop || null,
      landings: parsed.data.landings,
      remarks: parsed.data.remarks || null,
      photos: rawKeys,
    },
  });

  revalidatePath("/flights");
  revalidatePath("/dashboard");
  // Redirect back to /flights/new with the same reservation pre-selected
  // and an `added=1` flag so the page can show "ajouter un autre" UX.
  redirect(`/flights/new?reservation=${reservation.id}&added=1`);
}
