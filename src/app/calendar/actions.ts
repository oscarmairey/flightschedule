// FlightSchedule — calendar / reservation server actions.
//
// V2: bookings are pure scheduling blocks with no HDV impact. The form
// now posts a date+time start and date+time end (4 fields) which the
// server converts to UTC instants via the shared `parisLocalToUtc` helper.

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
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

const ReservationCommentSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const EstimatedFlightHoursSchema = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === "") return undefined;
    const normalized = v.replace(",", ".");
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) {
      ctx.addIssue({
        code: "custom",
        message: "HDV estimée invalide.",
      });
      return z.NEVER;
    }
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 999.99) {
      ctx.addIssue({
        code: "custom",
        message: "HDV estimée invalide.",
      });
      return z.NEVER;
    }
    return numeric;
  });

const BookSchema = z.object({
  // YYYY-MM-DD in Europe/Paris (HTML5 `<input type="date">` value format)
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // HH:MM 24h
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endTime: z.string().regex(/^\d{1,2}:\d{2}$/),
  comment: ReservationCommentSchema,
  estimatedFlightHours: EstimatedFlightHoursSchema,
});

export async function createReservation(formData: FormData) {
  const session = await requireSession();

  // V2.4: check the sum of per-type balances. Any single wallet going
  // negative is enough to block a new reservation (same semantics as the
  // old single-column global balance).
  const balanceAgg = await prisma.userFlightHourBalance.aggregate({
    where: { userId: session.user.id },
    _sum: { balanceMin: true },
  });
  if ((balanceAgg._sum.balanceMin ?? 0) < 0) {
    redirect("/calendar?error=negative_balance");
  }

  const parsed = BookSchema.safeParse({
    startDate: formData.get("startDate"),
    startTime: formData.get("startTime"),
    endDate: formData.get("endDate"),
    endTime: formData.get("endTime"),
    comment: formData.get("comment") ?? undefined,
    estimatedFlightHours: formData.get("estimatedFlightHours") ?? undefined,
  });
  if (!parsed.success) {
    redirect("/calendar?error=invalid");
  }

  const [sh, sm] = parsed.data.startTime.split(":").map(Number);
  const [ehRaw, em] = parsed.data.endTime.split(":").map(Number);
  const startsAtUtc = parisLocalToUtc(parsed.data.startDate, sh, sm);
  if (startsAtUtc < new Date()) {
    redirect("/calendar?error=past");
  }
  // TimeBlockPicker sends "24:00" for midnight end-of-day. Normalize to
  // 00:00 on the next calendar day before converting to UTC.
  let endDate = parsed.data.endDate;
  let eh = ehRaw;
  if (eh === 24) {
    eh = 0;
    const next = new Date(`${endDate}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    endDate = next.toISOString().slice(0, 10);
  }
  const endsAtUtc = parisLocalToUtc(endDate, eh, em);

  try {
    await bookReservation({
      userId: session.user.id,
      startsAtUtc,
      endsAtUtc,
      comment: parsed.data.comment,
      estimatedFlightHours: parsed.data.estimatedFlightHours,
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
  redirect(`/calendar?week=${parsed.data.startDate}&date=${parsed.data.startDate}&booked=1#calendrier`);
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
