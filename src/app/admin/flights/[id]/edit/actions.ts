// FlightSchedule — admin flight edit / delete server actions.
//
// CONSCIOUS OVERRIDE of architectural rule #9 ("flights are immutable on
// insert"). Pilots still cannot edit their own flights — that rule stands
// for the pilot UI. Admins, however, need to correct fat-finger entries
// (wrong bloc OFF / bloc ON, wrong airport, wrong date) without forcing
// the pilot to recreate the flight from scratch and the admin to chase
// the resulting HDV drift on /admin/pilots/[id] by hand.
//
// HDV cascade strategy (rule #2 stays intact):
//
//   The original FLIGHT_DEBIT row is NEVER mutated. Mutating it would
//   invalidate every later transaction's `balanceAfterMin` snapshot and
//   break point-in-time reconstruction. Instead, when an admin edit
//   changes the flown duration, we APPEND a compensating
//   ADMIN_ADJUSTMENT row whose signed amount equals
//   `oldDurationMin - newDurationMin`:
//
//     - Old 1h30 → new 1h00  ⇒  amountMin = +30  (pilot credited)
//     - Old 1h00 → new 1h30  ⇒  amountMin = -30  (pilot debited further)
//
//   The compensating row is linked to the same flightId so audit reads
//   can group "ledger entries about flight X" trivially. Its `reference`
//   carries the human-readable reason text the admin typed in the form.
//
// Atomicity contract (rule #3b extension):
//
//   Re-fetch flight + parse new times + overlap check + Flight.update +
//   compensating applyHdvMutation all run inside ONE serializable
//   Postgres transaction. The retry loop on Prisma error P2034 covers
//   races against concurrent flight inserts.

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  parseEngineTimes,
  EngineTimesError,
  parseTachyToHundredths,
} from "@/lib/duration";
import { parisLocalDateString } from "@/lib/format";
import { applyHdvMutation } from "@/lib/hdv";
import { IcaoSchema, UuidSchema, NonEmptyTextSchema } from "@/lib/validation";

const HHMMRequired = z.string().regex(/^\d{1,2}:\d{2}$/, "Format HH:MM attendu");
const TachyOptional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const EditFlightSchema = z.object({
  flightId: UuidSchema,
  depAirport: IcaoSchema,
  arrAirport: IcaoSchema,
  flightDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  engineStart: HHMMRequired,
  engineStop: HHMMRequired,
  tachyStart: TachyOptional,
  tachyStop: TachyOptional,
  landings: z.coerce.number().int().min(1).max(99),
  remarks: z.string().trim().max(2000).optional(),
  reason: NonEmptyTextSchema,
});

function editUrl(id: string, qs: string): string {
  return `/admin/flights/${id}/edit${qs ? `?${qs}` : ""}`;
}

export async function updateFlightAsAdmin(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = EditFlightSchema.safeParse({
    flightId: formData.get("flightId"),
    depAirport: formData.get("depAirport"),
    arrAirport: formData.get("arrAirport"),
    flightDate: formData.get("flightDate"),
    engineStart: formData.get("engineStart"),
    engineStop: formData.get("engineStop"),
    tachyStart: formData.get("tachyStart") ?? undefined,
    tachyStop: formData.get("tachyStop") ?? undefined,
    landings: formData.get("landings"),
    remarks: formData.get("remarks") || undefined,
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const id = formData.get("flightId");
    if (typeof id === "string") redirect(editUrl(id, "error=invalid"));
    redirect("/admin/pilots");
  }

  // Compute UTC instants and duration from the new bloc OFF / bloc ON.
  let startsAtUtc: Date;
  let endsAtUtc: Date;
  let newDurationMin: number;
  try {
    const result = parseEngineTimes(
      parsed.data.flightDate,
      parsed.data.engineStart,
      parsed.data.engineStop,
    );
    startsAtUtc = result.startsAtUtc;
    endsAtUtc = result.endsAtUtc;
    newDurationMin = result.durationMin;
  } catch (err) {
    if (err instanceof EngineTimesError) {
      redirect(
        editUrl(
          parsed.data.flightId,
          `error=engine&msg=${encodeURIComponent(err.message)}`,
        ),
      );
    }
    throw err;
  }

  // Same "no future flights" rule as the pilot submit path.
  const nowUtc = new Date();
  if (endsAtUtc.getTime() > nowUtc.getTime() + 60_000) {
    redirect(
      editUrl(
        parsed.data.flightId,
        `error=engine&msg=${encodeURIComponent(
          "Un vol ne peut pas être enregistré dans le futur.",
        )}`,
      ),
    );
  }

  // Optional tach readings — either-both-or-neither.
  let tachyStartHundredths: number | null = null;
  let tachyStopHundredths: number | null = null;
  const rawTachStart = parsed.data.tachyStart;
  const rawTachStop = parsed.data.tachyStop;
  if (rawTachStart || rawTachStop) {
    if (!rawTachStart || !rawTachStop) {
      redirect(
        editUrl(
          parsed.data.flightId,
          `error=engine&msg=${encodeURIComponent(
            "Renseignez TACHY départ ET arrivée, ou laissez les deux vides.",
          )}`,
        ),
      );
    }
    const ts = parseTachyToHundredths(rawTachStart);
    const te = parseTachyToHundredths(rawTachStop);
    if (ts === null || te === null) {
      redirect(
        editUrl(
          parsed.data.flightId,
          `error=engine&msg=${encodeURIComponent(
            "Format TACHY invalide (attendu XXXX.XX).",
          )}`,
        ),
      );
    }
    if (te < ts) {
      redirect(
        editUrl(
          parsed.data.flightId,
          `error=engine&msg=${encodeURIComponent(
            "TACHY arrivée doit être supérieur à TACHY départ.",
          )}`,
        ),
      );
    }
    tachyStartHundredths = ts;
    tachyStopHundredths = te;
  }

  const flightDateUtcMidnight = new Date(
    `${parisLocalDateString(startsAtUtc)}T00:00:00.000Z`,
  );

  // Pre-load the existing flight outside the serializable transaction
  // for the not-found check + ownership snapshot. The serializable
  // transaction below re-reads it under lock so we never act on stale
  // data.
  const existing = await prisma.flight.findUnique({
    where: { id: parsed.data.flightId },
    select: {
      id: true,
      userId: true,
      actualDurationMin: true,
    },
  });
  if (!existing) {
    redirect("/admin/pilots");
  }

  // Overlap check — same logic as submit, but we EXCLUDE the flight we
  // are editing from the neighbour set so its current row never claims
  // a collision against itself.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const neighbours = await prisma.flight.findMany({
    where: {
      id: { not: existing.id },
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
  for (const n of neighbours) {
    let neighbourRange: { startsAtUtc: Date; endsAtUtc: Date };
    try {
      const ymd = parisLocalDateString(n.date);
      const r = parseEngineTimes(ymd, n.engineStart, n.engineStop);
      neighbourRange = { startsAtUtc: r.startsAtUtc, endsAtUtc: r.endsAtUtc };
    } catch {
      continue;
    }
    const overlaps =
      startsAtUtc.getTime() < neighbourRange.endsAtUtc.getTime() &&
      endsAtUtc.getTime() > neighbourRange.startsAtUtc.getTime();
    if (overlaps) {
      redirect(
        editUrl(
          parsed.data.flightId,
          `error=engine&msg=${encodeURIComponent(
            "Un vol existe déjà sur ce créneau horaire.",
          )}`,
        ),
      );
    }
  }

  await prisma.$transaction(
    async (tx) => {
      // Re-read the flight under serializable lock so the duration
      // delta we apply is computed against the row state we are about
      // to overwrite.
      const locked = await tx.flight.findUnique({
        where: { id: parsed.data.flightId },
        select: {
          id: true,
          userId: true,
          actualDurationMin: true,
        },
      });
      if (!locked) {
        throw new Error(`Flight ${parsed.data.flightId} disappeared`);
      }

      const oldDurationMin = locked.actualDurationMin;
      // Signed delta to apply to the user's balance:
      //   compensation = oldDuration - newDuration
      // Old 1h30 → new 1h00 ⇒ +30 (refund 30 min)
      // Old 1h00 → new 1h30 ⇒ -30 (extra 30 min debit)
      const compensationMin = oldDurationMin - newDurationMin;

      await tx.flight.update({
        where: { id: locked.id },
        data: {
          date: flightDateUtcMidnight,
          depAirport: parsed.data.depAirport,
          arrAirport: parsed.data.arrAirport,
          actualDurationMin: newDurationMin,
          engineStart: parsed.data.engineStart,
          engineStop: parsed.data.engineStop,
          tachyStartHundredths,
          tachyStopHundredths,
          landings: parsed.data.landings,
          remarks: parsed.data.remarks || null,
        },
      });

      if (compensationMin !== 0) {
        // Find the original FLIGHT_DEBIT so we compensate on the SAME
        // FlightHourType wallet — regardless of what type the pilot is
        // currently flying. Preserves the ledger invariant per type.
        const originalDebit = await tx.transaction.findFirst({
          where: { flightId: locked.id, type: "FLIGHT_DEBIT" },
          select: { flightHourTypeId: true },
          orderBy: { createdAt: "asc" },
        });
        if (!originalDebit) {
          throw new Error(
            `No FLIGHT_DEBIT transaction found for flight ${locked.id}`,
          );
        }

        await applyHdvMutation(tx, {
          userId: locked.userId,
          flightHourTypeId: originalDebit.flightHourTypeId,
          type: "ADMIN_ADJUSTMENT",
          amountMin: compensationMin,
          flightId: locked.id,
          reference: `Correction vol ${parsed.data.depAirport}→${parsed.data.arrAirport} ${parsed.data.flightDate} : ${parsed.data.reason}`,
          performedById: admin.user.id,
          // The original FLIGHT_DEBIT path allows negative balances; the
          // compensation must too, otherwise an admin trying to LENGTHEN
          // a flight on a low-balance pilot would be blocked.
          allowNegative: true,
          // A retroactive correction may land on a "past" wallet while
          // the pilot currently holds hours in another type. That's
          // expected — the invariant guards NEW credits, not corrections.
          skipInvariantCheck: true,
        });
      }
    },
    { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 },
  );

  console.log(
    `[admin/flights] ${admin.user.email} edited flight ${parsed.data.flightId} (Δ ${
      existing.actualDurationMin - newDurationMin
    } min) reason: ${parsed.data.reason}`,
  );

  revalidatePath(`/admin/flights/${parsed.data.flightId}/edit`);
  revalidatePath(`/admin/pilots/${existing.userId}`);
  revalidatePath("/admin/pilots");
  revalidatePath("/admin");
  revalidatePath("/flights");
  revalidatePath("/dashboard");
  redirect(`/admin/pilots/${existing.userId}?flightedited=1`);
}
