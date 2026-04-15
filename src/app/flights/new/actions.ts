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
import {
  parseEngineTimes,
  EngineTimesError,
  parseTachyToHundredths,
} from "@/lib/duration";
import { parisLocalDateString } from "@/lib/format";
import { applyHdvMutation } from "@/lib/hdv";
import { resolveActiveFlightHourType } from "@/lib/flightHourTypes";
import { IcaoSchema } from "@/lib/validation";

const HHMMRequired = z.string().regex(/^\d{1,2}:\d{2}$/, "Format HH:MM attendu");
const TachyOptional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const SubmitFlightSchema = z.object({
  depAirport: IcaoSchema,
  arrAirport: IcaoSchema,
  flightDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  engineStart: HHMMRequired,
  engineStop: HHMMRequired,
  tachyStart: TachyOptional,
  tachyStop: TachyOptional,
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
    tachyStart: formData.get("tachyStart") ?? undefined,
    tachyStop: formData.get("tachyStop") ?? undefined,
    landings: formData.get("landings"),
    remarks: formData.get("remarks") || undefined,
  });
  if (!parsed.success) {
    redirect("/flights?error=invalid");
  }

  // Compute UTC instants and duration from the bloc OFF / bloc ON times.
  let startsAtUtc: Date;
  let endsAtUtc: Date;
  let actualDurationMin: number;
  try {
    const result = parseEngineTimes(
      parsed.data.flightDate,
      parsed.data.engineStart,
      parsed.data.engineStop,
    );
    startsAtUtc = result.startsAtUtc;
    endsAtUtc = result.endsAtUtc;
    actualDurationMin = result.durationMin;
  } catch (err) {
    if (err instanceof EngineTimesError) {
      redirect(`/flights?error=engine&msg=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  // Rule: a flight cannot be registered in the future. Uses a small
  // tolerance (60 s) so a user who hits "Enregistrer" a split second
  // before the bloc ON minute elapses isn't rejected.
  const nowUtc = new Date();
  if (endsAtUtc.getTime() > nowUtc.getTime() + 60_000) {
    redirect(
      `/flights?error=engine&msg=${encodeURIComponent(
        "Un vol ne peut pas être enregistré dans le futur.",
      )}`,
    );
  }

  // Parse optional tach readings. Present iff BOTH start and stop are
  // supplied; either-both-or-neither so we never store a half-populated
  // reading. On invalid format, redirect with a French error.
  let tachyStartHundredths: number | null = null;
  let tachyStopHundredths: number | null = null;
  const rawTachStart = parsed.data.tachyStart;
  const rawTachStop = parsed.data.tachyStop;
  if (rawTachStart || rawTachStop) {
    if (!rawTachStart || !rawTachStop) {
      redirect(
        `/flights?error=engine&msg=${encodeURIComponent(
          "Renseignez TACHY départ ET arrivée, ou laissez les deux vides.",
        )}`,
      );
    }
    const ts = parseTachyToHundredths(rawTachStart);
    const te = parseTachyToHundredths(rawTachStop);
    if (ts === null || te === null) {
      redirect(
        `/flights?error=engine&msg=${encodeURIComponent(
          "Format TACHY invalide (attendu XXXX.XX).",
        )}`,
      );
    }
    if (te < ts) {
      redirect(
        `/flights?error=engine&msg=${encodeURIComponent(
          "TACHY arrivée doit être supérieur à TACHY départ.",
        )}`,
      );
    }
    tachyStartHundredths = ts;
    tachyStopHundredths = te;
  }

  // Photo keys (rule #6) — V2: optional, but still validated when present.
  const rawKeys = formData.getAll("photoKeys").filter((v) => typeof v === "string") as string[];
  if (rawKeys.length > PHOTO_LIMITS.MAX_PHOTOS_PER_FLIGHT) {
    redirect("/flights?error=too_many_photos");
  }
  for (const key of rawKeys) {
    if (!isPhotoKeyOwnedBy(key, session.user.id)) {
      console.warn(
        `[flights/new] Pilot ${session.user.id} submitted alien photo key ${key}`,
      );
      redirect("/flights?error=bad_photo_key");
    }
  }
  if (rawKeys.length > 0) {
    try {
      await Promise.all(rawKeys.map((k) => headObject(k)));
    } catch (err) {
      console.error("[flights/new] photo HEAD failed:", err);
      redirect("/flights?error=photo_missing");
    }
  }

  // Flight.date is the Paris-local date of the bloc OFF moment.
  const flightDateUtcMidnight = new Date(
    `${parisLocalDateString(startsAtUtc)}T00:00:00.000Z`,
  );

  // Rule: a new flight cannot overlap any existing flight (same pilot
  // or another pilot). Flights are the source of truth for aircraft
  // occupancy — two simultaneous flights would be a data-integrity
  // violation. We look at a ± 1-day window around the candidate date
  // to catch cross-midnight entries, re-derive each neighbour's UTC
  // range from its stored engine times, and reject on any overlap.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const neighbourFlights = await prisma.flight.findMany({
    where: {
      date: {
        gte: new Date(flightDateUtcMidnight.getTime() - DAY_MS),
        lte: new Date(flightDateUtcMidnight.getTime() + DAY_MS),
      },
    },
    select: {
      id: true,
      date: true,
      engineStart: true,
      engineStop: true,
    },
  });
  for (const n of neighbourFlights) {
    let neighbourRange: { startsAtUtc: Date; endsAtUtc: Date };
    try {
      const ymd = parisLocalDateString(n.date);
      const r = parseEngineTimes(ymd, n.engineStart, n.engineStop);
      neighbourRange = { startsAtUtc: r.startsAtUtc, endsAtUtc: r.endsAtUtc };
    } catch {
      // Malformed historic row — skip rather than block the submission.
      continue;
    }
    const overlaps =
      startsAtUtc.getTime() < neighbourRange.endsAtUtc.getTime() &&
      endsAtUtc.getTime() > neighbourRange.startsAtUtc.getTime();
    if (overlaps) {
      redirect(
        `/flights?error=engine&msg=${encodeURIComponent(
          "Un vol existe déjà sur ce créneau horaire.",
        )}`,
      );
    }
  }

  // Resolve the active type up-front so we can surface a clean French
  // error redirect on the rare "no Transaction history at all" case
  // before we open the serializable transaction below.
  const activeTypeId = await resolveActiveFlightHourType(
    prisma,
    session.user.id,
  );
  if (!activeTypeId) {
    redirect(
      `/flights?error=no_active_type&msg=${encodeURIComponent(
        "Aucun forfait actif — contactez l'administrateur avant de saisir un vol.",
      )}`,
    );
  }

  await prisma.$transaction(
    async (tx) => {
      const flightHourTypeId = activeTypeId;

      const flight = await tx.flight.create({
        data: {
          userId: session.user.id,
          date: flightDateUtcMidnight,
          depAirport: parsed.data.depAirport,
          arrAirport: parsed.data.arrAirport,
          actualDurationMin,
          engineStart: parsed.data.engineStart,
          engineStop: parsed.data.engineStop,
          tachyStartHundredths,
          tachyStopHundredths,
          landings: parsed.data.landings,
          remarks: parsed.data.remarks || null,
          photos: rawKeys,
        },
        select: { id: true },
      });

      await applyHdvMutation(tx, {
        userId: session.user.id,
        flightHourTypeId,
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
  redirect("/flights?added=1");
}
