// FlightSchedule — admin disponibilités server actions. V2.
//
// Replaces /admin/availability/actions.ts. Drop the AvailabilityType field
// (everything is implicitly an unavailability exception now). The cancel-
// reservation action is re-exported from /calendar/actions for consistency.

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { UuidSchema } from "@/lib/validation";
import { listConfirmedReservationsInWindow } from "@/lib/availability";

const TimeRangeSchema = z.object({
  startStr: z.string().regex(/^\d{1,2}:\d{2}$/, "Heure invalide (HH:MM)"),
  endStr: z.string().regex(/^\d{1,2}:\d{2}$/, "Heure invalide (HH:MM)"),
});

function parseHM(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 24 || min < 0 || min >= 60) return null;
  return h * 60 + min;
}

const CreateRecurringSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  reason: z.string().trim().max(500).optional(),
});

export async function createRecurringException(formData: FormData) {
  const admin = await requireAdmin();

  const tr = TimeRangeSchema.safeParse({
    startStr: formData.get("startStr"),
    endStr: formData.get("endStr"),
  });
  const meta = CreateRecurringSchema.safeParse({
    dayOfWeek: formData.get("dayOfWeek"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!tr.success || !meta.success) {
    redirect("/admin/disponibilites?error=invalid");
  }

  const startMinutes = parseHM(tr.data.startStr);
  const endMinutes = parseHM(tr.data.endStr);
  if (
    startMinutes === null ||
    endMinutes === null ||
    endMinutes <= startMinutes
  ) {
    redirect("/admin/disponibilites?error=bad_range");
  }

  await prisma.availabilityBlock.create({
    data: {
      dayOfWeek: meta.data.dayOfWeek,
      specificDate: null,
      startMinutes,
      endMinutes,
      reason: meta.data.reason || null,
      createdById: admin.user.id,
    },
  });

  revalidatePath("/admin/disponibilites");
  revalidatePath("/calendar");
  redirect("/admin/disponibilites?created=1");
}

const CreateOverrideSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  reason: z.string().trim().max(500).optional(),
});

export async function createOverrideException(formData: FormData) {
  const admin = await requireAdmin();

  const tr = TimeRangeSchema.safeParse({
    startStr: formData.get("startStr"),
    endStr: formData.get("endStr"),
  });
  const meta = CreateOverrideSchema.safeParse({
    date: formData.get("date"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!tr.success || !meta.success) {
    redirect("/admin/disponibilites?error=invalid");
  }

  const startMinutes = parseHM(tr.data.startStr);
  const endMinutes = parseHM(tr.data.endStr);
  if (
    startMinutes === null ||
    endMinutes === null ||
    endMinutes <= startMinutes
  ) {
    redirect("/admin/disponibilites?error=bad_range");
  }

  const specificDate = new Date(`${meta.data.date}T00:00:00.000Z`);

  // Block creation if it would orphan existing confirmed reservations.
  // Coarse check: any reservation on that date. The admin will see them
  // and can manually cancel before re-trying.
  const dayStart = new Date(`${meta.data.date}T00:00:00+02:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const conflicts = await listConfirmedReservationsInWindow({
    startsAtUtc: dayStart,
    endsAtUtc: dayEnd,
  });
  if (conflicts.length > 0) {
    redirect(
      `/admin/disponibilites?error=conflicts&count=${conflicts.length}&date=${meta.data.date}`,
    );
  }

  await prisma.availabilityBlock.create({
    data: {
      dayOfWeek: null,
      specificDate,
      startMinutes,
      endMinutes,
      reason: meta.data.reason || null,
      createdById: admin.user.id,
    },
  });

  revalidatePath("/admin/disponibilites");
  revalidatePath("/calendar");
  redirect("/admin/disponibilites?created=1");
}

export async function deleteException(formData: FormData) {
  await requireAdmin();
  const idResult = UuidSchema.safeParse(formData.get("id"));
  if (!idResult.success) redirect("/admin/disponibilites");

  const block = await prisma.availabilityBlock.findUnique({
    where: { id: idResult.data },
  });
  if (!block) redirect("/admin/disponibilites");

  await prisma.availabilityBlock.delete({ where: { id: idResult.data } });

  revalidatePath("/admin/disponibilites");
  revalidatePath("/calendar");
  redirect("/admin/disponibilites?deleted=1");
}

// ─── OpenPeriod CRUD ─────────────────────────────────────────
//
// OpenPeriods define date ranges (inclusive) when the aircraft is
// reservable. Outside any OpenPeriod, bookings are rejected. Special
// case: if no OpenPeriods exist, the booking layer treats the aircraft
// as always open (preserves V2.0 behavior).

const CreateOpenPeriodSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de début invalide"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de fin invalide"),
  reason: z.string().trim().max(500).optional(),
});

export async function createOpenPeriod(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = CreateOpenPeriodSchema.safeParse({
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    redirect("/admin/disponibilites?error=invalid");
  }

  const startDate = new Date(`${parsed.data.startDate}T00:00:00.000Z`);
  const endDate = new Date(`${parsed.data.endDate}T00:00:00.000Z`);
  if (endDate < startDate) {
    redirect("/admin/disponibilites?error=bad_range");
  }

  await prisma.openPeriod.create({
    data: {
      startDate,
      endDate,
      reason: parsed.data.reason || null,
      createdById: admin.user.id,
    },
  });

  revalidatePath("/admin/disponibilites");
  revalidatePath("/calendar");
  redirect("/admin/disponibilites?open_period_created=1");
}

export async function deleteOpenPeriod(formData: FormData) {
  await requireAdmin();
  const idResult = UuidSchema.safeParse(formData.get("id"));
  if (!idResult.success) redirect("/admin/disponibilites");

  // Block deletion that would orphan future confirmed reservations.
  const period = await prisma.openPeriod.findUnique({
    where: { id: idResult.data },
  });
  if (!period) redirect("/admin/disponibilites");

  const dayStart = new Date(period.startDate);
  const dayEnd = new Date(
    period.endDate.getTime() + 24 * 60 * 60 * 1000,
  );
  const conflicts = await listConfirmedReservationsInWindow({
    startsAtUtc: dayStart,
    endsAtUtc: dayEnd,
  });
  if (conflicts.length > 0) {
    redirect(
      `/admin/disponibilites?error=conflicts&count=${conflicts.length}`,
    );
  }

  await prisma.openPeriod.delete({ where: { id: idResult.data } });

  revalidatePath("/admin/disponibilites");
  revalidatePath("/calendar");
  redirect("/admin/disponibilites?deleted=1");
}
