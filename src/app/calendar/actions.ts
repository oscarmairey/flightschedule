// FlightSchedule — calendar / reservation server actions.
//
// V2: bookings are pure scheduling blocks with no HDV impact. The form
// now posts a date+time start and date+time end (4 fields) which the
// server converts to UTC instants via the shared `parisLocalToUtc` helper.

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
  AutoCreatedReservationError,
} from "@/lib/reservations";
import { parisLocalToUtc } from "@/lib/format";
import { UuidSchema } from "@/lib/validation";

const BookSchema = z.object({
  // YYYY-MM-DD in Europe/Paris (HTML5 `<input type="date">` value format)
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // HH:MM 24h
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endTime: z.string().regex(/^\d{1,2}:\d{2}$/),
});

export async function createReservation(formData: FormData) {
  const session = await requireSession();
  const parsed = BookSchema.safeParse({
    startDate: formData.get("startDate"),
    startTime: formData.get("startTime"),
    endDate: formData.get("endDate"),
    endTime: formData.get("endTime"),
  });
  if (!parsed.success) {
    redirect("/calendar?error=invalid");
  }

  const [sh, sm] = parsed.data.startTime.split(":").map(Number);
  const [eh, em] = parsed.data.endTime.split(":").map(Number);
  const startsAtUtc = parisLocalToUtc(parsed.data.startDate, sh, sm);
  let endsAtUtc = parisLocalToUtc(parsed.data.endDate, eh, em);
  // Treat end "00:00" with same date as start as end-of-day (24:00).
  // Lets the calendar 24h grid express slots like 21:00–24:00.
  if (endsAtUtc <= startsAtUtc && eh === 0 && em === 0) {
    endsAtUtc = new Date(endsAtUtc.getTime() + 24 * 60 * 60 * 1000);
  }

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
    if (err instanceof InvalidWindowError) {
      redirect(`/calendar?error=window&msg=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  redirect(`/calendar?date=${parsed.data.startDate}&booked=1`);
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
    if (err instanceof AutoCreatedReservationError) {
      redirect("/calendar?error=auto_created");
    }
    throw err;
  }

  revalidatePath("/calendar");
  revalidatePath("/admin/disponibilites");
  revalidatePath("/dashboard");
  redirect("/calendar?cancelled=1");
}

export async function adminCancelReservation(formData: FormData) {
  const admin = await requireAdmin();
  const idResult = UuidSchema.safeParse(formData.get("reservationId"));
  if (!idResult.success) redirect("/admin/disponibilites");

  try {
    await cancelReservation({
      reservationId: idResult.data,
      actorId: admin.user.id,
      isAdmin: true,
    });
  } catch (err) {
    if (err instanceof ReservationLockedError) {
      redirect("/admin/disponibilites?error=locked");
    }
    if (err instanceof AutoCreatedReservationError) {
      redirect("/admin/disponibilites?error=auto_created");
    }
    throw err;
  }

  revalidatePath("/calendar");
  revalidatePath("/admin/disponibilites");
  redirect("/admin/disponibilites?cancelled=1");
}
