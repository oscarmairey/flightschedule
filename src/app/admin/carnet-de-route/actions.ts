// FlightSchedule — admin maintenance log server actions.
//
// Backs the maintenance-operation form on /admin/carnet-de-route. Admin
// records each annual visit or workshop visit with its calendar date;
// the page surfaces the latest of each type plus the HDV accumulated
// since. See `lib/maintenance.ts` for the read path.

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { UuidSchema } from "@/lib/validation";

const CreateSchema = z.object({
  type: z.enum(["ANNUAL_VISIT", "WORKSHOP_VISIT"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  // Time-of-day from an <input type="time"> — "HH:MM", 24h. Required so a
  // visit can be placed between same-day flights (HDV-depuis calc).
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide"),
  notes: z.string().trim().max(500).optional(),
});

export async function createMaintenanceOperation(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = CreateSchema.safeParse({
    type: formData.get("type"),
    date: formData.get("date"),
    time: formData.get("time"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    redirect("/admin/carnet-de-route?error=invalid");
  }

  const [hh, mm] = parsed.data.time.split(":");
  const timeMin = Number(hh) * 60 + Number(mm);

  // Reject far-future dates — maintenance is logged AFTER it happens.
  // The `Flight.date > maintenance.date` comparison would otherwise
  // silently zero out HDV-since for any flight before today.
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  const ymdToday = today.toISOString().slice(0, 10);
  if (parsed.data.date > ymdToday) {
    redirect("/admin/carnet-de-route?error=future_date");
  }

  await prisma.maintenanceOperation.create({
    data: {
      type: parsed.data.type,
      // DATE column — passing a UTC midnight Date works with PrismaPg.
      date: new Date(`${parsed.data.date}T00:00:00.000Z`),
      timeMin,
      notes: parsed.data.notes ?? null,
      createdById: admin.user.id,
    },
  });

  revalidatePath("/admin/carnet-de-route");
  redirect("/admin/carnet-de-route?maintenance_created=1");
}

const DeleteSchema = z.object({ id: UuidSchema });

export async function deleteMaintenanceOperation(formData: FormData) {
  await requireAdmin();

  const parsed = DeleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    redirect("/admin/carnet-de-route?error=invalid");
  }

  await prisma.maintenanceOperation.delete({ where: { id: parsed.data.id } });

  revalidatePath("/admin/carnet-de-route");
  redirect("/admin/carnet-de-route?maintenance_deleted=1");
}
