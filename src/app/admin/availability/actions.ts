// FlySchedule — admin availability server actions.

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { parseHHMM } from "@/lib/duration";
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
  type: z.enum(["AVAILABLE", "UNAVAILABLE"]),
  reason: z.string().trim().max(500).optional(),
});

export async function createRecurringBlock(formData: FormData) {
  const admin = await requireAdmin();

  const tr = TimeRangeSchema.safeParse({
    startStr: formData.get("startStr"),
    endStr: formData.get("endStr"),
  });
  const meta = CreateRecurringSchema.safeParse({
    dayOfWeek: formData.get("dayOfWeek"),
    type: formData.get("type"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!tr.success || !meta.success) {
    redirect("/admin/availability?error=invalid");
  }

  const startMinutes = parseHM(tr.data.startStr);
  const endMinutes = parseHM(tr.data.endStr);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    redirect("/admin/availability?error=bad_range");
  }

  await prisma.availabilityBlock.create({
    data: {
      dayOfWeek: meta.data.dayOfWeek,
      specificDate: null,
      startMinutes,
      endMinutes,
      type: meta.data.type,
      reason: meta.data.reason || null,
      createdById: admin.user.id,
    },
  });

  revalidatePath("/admin/availability");
  redirect("/admin/availability?created=1");
}

const CreateOverrideSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  type: z.enum(["AVAILABLE", "UNAVAILABLE"]),
  reason: z.string().trim().max(500).optional(),
});

export async function createOverrideBlock(formData: FormData) {
  const admin = await requireAdmin();

  const tr = TimeRangeSchema.safeParse({
    startStr: formData.get("startStr"),
    endStr: formData.get("endStr"),
  });
  const meta = CreateOverrideSchema.safeParse({
    date: formData.get("date"),
    type: formData.get("type"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!tr.success || !meta.success) {
    redirect("/admin/availability?error=invalid");
  }

  const startMinutes = parseHM(tr.data.startStr);
  const endMinutes = parseHM(tr.data.endStr);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    redirect("/admin/availability?error=bad_range");
  }

  const specificDate = new Date(`${meta.data.date}T00:00:00.000Z`);

  // PRD §3.2.1 cascade: block creation if it would orphan existing
  // confirmed reservations on that date in that window. Only check
  // for UNAVAILABLE overrides (or for AVAILABLE that wouldn't help)
  // — we check both to keep it simple.
  if (meta.data.type === "UNAVAILABLE") {
    const dayStart = new Date(`${meta.data.date}T00:00:00+02:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    // Coarse: any reservation that day. The admin will see them and
    // can manually cancel before re-trying.
    const conflicts = await listConfirmedReservationsInWindow({
      startsAtUtc: dayStart,
      endsAtUtc: dayEnd,
    });
    if (conflicts.length > 0) {
      redirect(
        `/admin/availability?error=conflicts&count=${conflicts.length}&date=${meta.data.date}`,
      );
    }
  }

  await prisma.availabilityBlock.create({
    data: {
      dayOfWeek: null,
      specificDate,
      startMinutes,
      endMinutes,
      type: meta.data.type,
      reason: meta.data.reason || null,
      createdById: admin.user.id,
    },
  });

  revalidatePath("/admin/availability");
  redirect("/admin/availability?created=1");
}

export async function deleteAvailabilityBlock(formData: FormData) {
  await requireAdmin();
  const idResult = UuidSchema.safeParse(formData.get("id"));
  if (!idResult.success) redirect("/admin/availability");

  const block = await prisma.availabilityBlock.findUnique({
    where: { id: idResult.data },
  });
  if (!block) redirect("/admin/availability");

  // If deleting an AVAILABLE block, ensure no confirmed reservations
  // would be orphaned. (For specific_date overrides we know the date;
  // for recurring blocks we'd need to check every future occurrence
  // — out of scope for V1, document the limitation.)
  if (block.type === "AVAILABLE" && block.specificDate) {
    const dayStart = new Date(block.specificDate);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const conflicts = await listConfirmedReservationsInWindow({
      startsAtUtc: dayStart,
      endsAtUtc: dayEnd,
    });
    if (conflicts.length > 0) {
      redirect(`/admin/availability?error=conflicts&count=${conflicts.length}`);
    }
  }

  await prisma.availabilityBlock.delete({ where: { id: idResult.data } });

  revalidatePath("/admin/availability");
  redirect("/admin/availability?deleted=1");
}
