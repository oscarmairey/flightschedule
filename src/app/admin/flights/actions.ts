// CAVOK — admin flight queue server actions.
//
// Per D4: only Validate and Edit. No Reject path.
//
// Validate: lock the flight (status → VALIDATED, validatedAt = now).
//   Per architectural rule #9, this is irreversible from the UI. If the
//   admin needs to fix a validated flight, they must use a manual
//   ADMIN_ADJUSTMENT Transaction from /admin/pilots/[id].
//
// Edit: change actualDurationMin (and admin notes), which triggers a
//   reversing FLIGHT_RECONCILIATION (negative of the existing delta)
//   and a fresh FLIGHT_RECONCILIATION based on the new actual. The
//   flight stays PENDING — admin must validate explicitly afterward.

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { applyHdvMutation } from "@/lib/hdv";
import { parseHHMM } from "@/lib/duration";
import { UuidSchema, NonEmptyTextSchema } from "@/lib/validation";

const ValidateSchema = z.object({ flightId: UuidSchema });

export async function validateFlight(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = ValidateSchema.safeParse({ flightId: formData.get("flightId") });
  if (!parsed.success) redirect("/admin/flights");

  const flight = await prisma.flight.findUnique({
    where: { id: parsed.data.flightId },
    select: { id: true, status: true, userId: true },
  });
  if (!flight) redirect("/admin/flights");
  if (flight.status !== "PENDING") {
    redirect("/admin/flights?error=not_pending");
  }

  await prisma.flight.update({
    where: { id: flight.id },
    data: { status: "VALIDATED", validatedAt: new Date() },
  });

  console.log(`[admin/flights] ${admin.user.email} validated flight ${flight.id}`);

  revalidatePath("/admin/flights");
  revalidatePath("/admin");
  redirect("/admin/flights?validated=1");
}

const EditSchema = z.object({
  flightId: UuidSchema,
  durationStr: z.string().min(1, "Durée obligatoire"),
  adminNotes: NonEmptyTextSchema,
});

export async function editFlight(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = EditSchema.safeParse({
    flightId: formData.get("flightId"),
    durationStr: formData.get("durationStr"),
    adminNotes: formData.get("adminNotes"),
  });
  if (!parsed.success) {
    redirect("/admin/flights?error=invalid");
  }

  const newActual = parseHHMM(parsed.data.durationStr);
  if (newActual === null || newActual <= 0) {
    redirect("/admin/flights?error=bad_duration");
  }

  await prisma.$transaction(async (tx) => {
    const flight = await tx.flight.findUnique({
      where: { id: parsed.data.flightId },
    });
    if (!flight) throw new Error("Vol introuvable");
    if (flight.status !== "PENDING") {
      throw new Error("Vol non éditable (déjà validé)");
    }

    const oldDelta = flight.reconciliationDeltaMin;
    const newDelta = flight.reservedDurationMin - newActual;

    // Reverse the previous reconciliation if there was one
    if (oldDelta !== 0) {
      await applyHdvMutation(tx, {
        userId: flight.userId,
        type: "FLIGHT_RECONCILIATION",
        amountMin: -oldDelta,
        flightId: flight.id,
        reservationId: flight.reservationId,
        performedById: admin.user.id,
        reference: `REVERSAL pour édition admin (${parsed.data.adminNotes})`,
        allowNegative: true,
      });
    }

    // Apply the new reconciliation if non-zero
    if (newDelta !== 0) {
      await applyHdvMutation(tx, {
        userId: flight.userId,
        type: "FLIGHT_RECONCILIATION",
        amountMin: newDelta,
        flightId: flight.id,
        reservationId: flight.reservationId,
        performedById: admin.user.id,
        reference: `Réconciliation après édition admin`,
        allowNegative: true,
      });
    }

    await tx.flight.update({
      where: { id: flight.id },
      data: {
        actualDurationMin: newActual,
        reconciliationDeltaMin: newDelta,
        adminNotes: parsed.data.adminNotes,
      },
    });
  });

  console.log(
    `[admin/flights] ${admin.user.email} edited flight ${parsed.data.flightId} → ${newActual} min (notes: ${parsed.data.adminNotes})`,
  );

  revalidatePath("/admin/flights");
  revalidatePath("/admin");
  redirect("/admin/flights?edited=1");
}
