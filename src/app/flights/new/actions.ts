// FlightSchedule — submit a flight entry. V2.2.
//
// Architectural rules in play:
//   #3b — Flight submission atomicity. The flight insert + FLIGHT_DEBIT
//         transaction run inside one serializable Postgres transaction.
//   #6  — Server validates each photo key belongs to the current user.
//         V2: photos are OPTIONAL.
//   #9  — Flights are immutable on insert. The bloc OFF / bloc ON engine
//         times are required and drive `actualDurationMin`. The flight
//         is the V2 unit of HDV consumption.
//
// V2.2: flights are standalone log entries — no reservation link.
// The reservation selector, auto-creation, and expansion logic were
// removed when the Flight→Reservation FK was dropped.

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
import { IcaoSchema } from "@/lib/validation";

const HHMMRequired = z.string().regex(/^\d{1,2}:\d{2}$/, "Format HH:MM attendu");

const SubmitFlightSchema = z.object({
  depAirport: IcaoSchema,
  arrAirport: IcaoSchema,
  flightDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  engineStart: HHMMRequired,
  engineStop: HHMMRequired,
  landings: z.coerce.number().int().min(1).max(99),
  remarks: z.string().trim().max(2000).optional(),
});

export async function submitFlight(formData: FormData) {
  const session = await requireSession();

  const parsed = SubmitFlightSchema.safeParse({
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

  // Compute UTC instants and duration from the bloc OFF / bloc ON times.
  let startsAtUtc: Date;
  let actualDurationMin: number;
  try {
    const result = parseEngineTimes(
      parsed.data.flightDate,
      parsed.data.engineStart,
      parsed.data.engineStop,
    );
    startsAtUtc = result.startsAtUtc;
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

  // Flight.date is the Paris-local date of the bloc OFF moment.
  const flightDateUtcMidnight = new Date(
    `${parisLocalDateString(startsAtUtc)}T00:00:00.000Z`,
  );

  await prisma.$transaction(
    async (tx) => {
      const flight = await tx.flight.create({
        data: {
          userId: session.user.id,
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

  revalidatePath("/flights");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  redirect(`/flights/new?added=1`);
}
