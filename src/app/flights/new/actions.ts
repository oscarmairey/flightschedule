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
//
// Action shape (React 19 / Next 16): `submitFlight` is consumed by
// `useActionState` in `<NewFlightForm>` and follows the
// `(prevState, formData) => nextState` signature. On validation or
// business-rule errors, it returns `{ ok: false, error, values }` so
// the client can re-render the form with the user's typed input intact
// and a French error banner. On success, it falls through to the
// classic `redirect("/flights?added=1")` flash pattern.

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

/** Snapshot of every scalar field the user typed, replayed back into
 *  the form on the error path so nothing is lost. Photos are not in
 *  here — they live in <PhotoUpload>'s own client state and survive a
 *  re-render of the parent form. */
export type SubmitFlightValues = {
  depAirport: string;
  arrAirport: string;
  flightDate: string;
  engineStart: string;
  engineStop: string;
  tachyStart: string;
  tachyStop: string;
  landings: string;
  remarks: string;
};

export type SubmitFlightState =
  | { ok: false; error: string; values: SubmitFlightValues }
  | null;

function snapshot(formData: FormData): SubmitFlightValues {
  const get = (k: string): string => {
    const v = formData.get(k);
    return typeof v === "string" ? v : "";
  };
  return {
    depAirport: get("depAirport"),
    arrAirport: get("arrAirport"),
    flightDate: get("flightDate"),
    engineStart: get("engineStart"),
    engineStop: get("engineStop"),
    tachyStart: get("tachyStart"),
    tachyStop: get("tachyStop"),
    landings: get("landings"),
    remarks: get("remarks"),
  };
}

function fail(values: SubmitFlightValues, error: string): SubmitFlightState {
  return { ok: false, error, values };
}

export async function submitFlight(
  _prev: SubmitFlightState,
  formData: FormData,
): Promise<SubmitFlightState> {
  const session = await requireSession();
  const values = snapshot(formData);

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
    return fail(values, "Données invalides. Vérifiez les champs marqués.");
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
      return fail(values, err.message);
    }
    throw err;
  }

  // Rule: a flight cannot be registered in the future. Uses a small
  // tolerance (60 s) so a user who hits "Enregistrer" a split second
  // before the bloc ON minute elapses isn't rejected.
  const nowUtc = new Date();
  if (endsAtUtc.getTime() > nowUtc.getTime() + 60_000) {
    return fail(values, "Un vol ne peut pas être enregistré dans le futur.");
  }

  // Parse optional tach readings. Present iff BOTH start and stop are
  // supplied; either-both-or-neither so we never store a half-populated
  // reading.
  let tachyStartHundredths: number | null = null;
  let tachyStopHundredths: number | null = null;
  const rawTachStart = parsed.data.tachyStart;
  const rawTachStop = parsed.data.tachyStop;
  if (rawTachStart || rawTachStop) {
    if (!rawTachStart || !rawTachStop) {
      return fail(
        values,
        "Renseignez TACHY départ ET arrivée, ou laissez les deux vides.",
      );
    }
    const ts = parseTachyToHundredths(rawTachStart);
    const te = parseTachyToHundredths(rawTachStop);
    if (ts === null || te === null) {
      return fail(values, "Format TACHY invalide (attendu XXXX.XX).");
    }
    if (te < ts) {
      return fail(values, "TACHY arrivée doit être supérieur à TACHY départ.");
    }
    tachyStartHundredths = ts;
    tachyStopHundredths = te;
  }

  // Photo keys (rule #6) — V2: optional, but still validated when present.
  const rawKeys = formData.getAll("photoKeys").filter((v) => typeof v === "string") as string[];
  if (rawKeys.length > PHOTO_LIMITS.MAX_PHOTOS_PER_FLIGHT) {
    return fail(values, "Maximum 5 photos par vol.");
  }
  for (const key of rawKeys) {
    if (!isPhotoKeyOwnedBy(key, session.user.id)) {
      console.warn(
        `[flights/new] Pilot ${session.user.id} submitted alien photo key ${key}`,
      );
      return fail(
        values,
        "Photo invalide ou n'appartenant pas à votre compte.",
      );
    }
  }
  if (rawKeys.length > 0) {
    try {
      await Promise.all(rawKeys.map((k) => headObject(k)));
    } catch (err) {
      console.error("[flights/new] photo HEAD failed:", err);
      return fail(
        values,
        "Une photo n'a pas été trouvée sur le serveur. Réessayez.",
      );
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
      return fail(values, "Un vol existe déjà sur ce créneau horaire.");
    }
  }

  // Resolve the active type up-front so we can surface a clean French
  // error message on the rare "no Transaction history at all" case
  // before we open the serializable transaction below.
  const activeTypeId = await resolveActiveFlightHourType(
    prisma,
    session.user.id,
  );
  if (!activeTypeId) {
    return fail(
      values,
      "Aucun forfait actif — contactez l'administrateur avant de saisir un vol.",
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
  revalidatePath("/admin/carnet-de-route");
  redirect("/flights?added=1");
}
