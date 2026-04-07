// CAVOK — calendar / reservation server actions.

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, requireAdmin } from "@/lib/session";
import {
  bookReservation,
  cancelReservation,
  OverlapError,
  InvalidWindowError,
  LateCancellationError,
  ReservationLockedError,
} from "@/lib/reservations";
import { InsufficientBalanceError } from "@/lib/hdv";
import { UuidSchema } from "@/lib/validation";

const BookSchema = z.object({
  // YYYY-MM-DD in Europe/Paris
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // HH:MM 24h, must align to :00 or :30
  startStr: z.string().regex(/^\d{1,2}:(00|30)$/),
  durationMin: z.coerce.number().int().min(30).max(8 * 60),
});

/**
 * Convert a Paris-local YYYY-MM-DD + HH:MM into a UTC Date.
 *
 * Strategy: create a Date in UTC for the same wall-clock components,
 * then ask Intl what offset Paris was at that instant, and shift back.
 * Handles DST correctly for any date in the future.
 */
function parisLocalToUtc(dateStr: string, hh: number, mm: number): Date {
  // First guess: treat the wall clock as UTC. This is wrong but close.
  const guess = new Date(`${dateStr}T${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}:00.000Z`);
  // Now compute Paris offset at that instant.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    timeZoneName: "shortOffset",
  });
  const parts = fmt.formatToParts(guess);
  const tzPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  // tzPart looks like "GMT+1" or "GMT+2"
  const offsetMatch = tzPart.match(/GMT([+-]\d+)/);
  const offsetHours = offsetMatch ? Number(offsetMatch[1]) : 1;
  // Subtract the offset to get the UTC instant whose Paris wall-clock
  // matches the requested time.
  return new Date(guess.getTime() - offsetHours * 60 * 60 * 1000);
}

export async function createReservation(formData: FormData) {
  const session = await requireSession();
  const parsed = BookSchema.safeParse({
    date: formData.get("date"),
    startStr: formData.get("startStr"),
    durationMin: formData.get("durationMin"),
  });
  if (!parsed.success) {
    redirect("/calendar?error=invalid");
  }

  const [hh, mm] = parsed.data.startStr.split(":").map(Number);
  const startsAtUtc = parisLocalToUtc(parsed.data.date, hh, mm);
  const endsAtUtc = new Date(startsAtUtc.getTime() + parsed.data.durationMin * 60_000);

  try {
    await bookReservation({
      userId: session.user.id,
      startsAtUtc,
      endsAtUtc,
    });
  } catch (err) {
    if (err instanceof OverlapError) {
      redirect("/calendar?error=overlap");
    }
    if (err instanceof InsufficientBalanceError) {
      redirect("/calendar?error=balance");
    }
    if (err instanceof InvalidWindowError) {
      redirect(`/calendar?error=window&msg=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  redirect(`/calendar?date=${parsed.data.date}&booked=1`);
}

export async function cancelReservationAction(formData: FormData) {
  const session = await requireSession();
  const idResult = UuidSchema.safeParse(formData.get("reservationId"));
  if (!idResult.success) redirect("/calendar");

  try {
    await cancelReservation({
      reservationId: idResult.data,
      actorId: session.user.id,
      isAdmin: session.user.role === "ADMIN",
    });
  } catch (err) {
    if (err instanceof LateCancellationError) {
      redirect("/calendar?error=late_cancel");
    }
    if (err instanceof ReservationLockedError) {
      redirect("/calendar?error=locked");
    }
    throw err;
  }

  revalidatePath("/calendar");
  revalidatePath("/admin/calendar");
  revalidatePath("/dashboard");
  redirect("/calendar?cancelled=1");
}

export async function adminCancelReservation(formData: FormData) {
  const admin = await requireAdmin();
  const idResult = UuidSchema.safeParse(formData.get("reservationId"));
  if (!idResult.success) redirect("/admin/calendar");

  try {
    await cancelReservation({
      reservationId: idResult.data,
      actorId: admin.user.id,
      isAdmin: true,
    });
  } catch (err) {
    if (err instanceof ReservationLockedError) {
      redirect("/admin/calendar?error=locked");
    }
    throw err;
  }

  revalidatePath("/calendar");
  revalidatePath("/admin/calendar");
  redirect("/admin/calendar?cancelled=1");
}
