// FlightSchedule — admin pilot management server actions.
//
// Every action: requireAdmin() FIRST, Zod-validate input, wrap mutations
// in prisma.$transaction when they touch HDV. The HDV chokepoint
// (applyHdvMutation) is the only allowed path to User.hdvBalanceMin.

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { applyHdvMutation } from "@/lib/hdv";
import { sendTempPasswordEmail, sendPasswordResetEmail } from "@/lib/email";
import { EmailSchema, NonEmptyTextSchema, UuidSchema } from "@/lib/validation";
import { parseHHMM } from "@/lib/duration";

const CreatePilotSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(100),
  email: EmailSchema,
});

/**
 * Generate a 12-character base64url temp password. The plaintext is
 * shown ONCE in the welcome email and never persisted anywhere except
 * as a bcrypt hash in User.passwordHash.
 */
function generateTempPassword(): string {
  return randomBytes(9).toString("base64url");
}

export async function createPilot(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = CreatePilotSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    redirect("/admin/pilots/new?error=invalid");
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (existing) {
    redirect("/admin/pilots/new?error=duplicate");
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hash(tempPassword, 12);

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: "PILOT",
      isActive: true,
      mustResetPw: true,
      hdvBalanceMin: 0,
    },
    select: { id: true, email: true, name: true },
  });

  const result = await sendTempPasswordEmail(user.email, user.name, tempPassword);
  if ("error" in result) {
    console.error(`[admin/pilots] Failed to send welcome email to ${user.email}:`, result.error);
    // Don't roll back the user — the admin can resend by clicking
    // "Réinitialiser le mot de passe" on the detail page.
  }

  // Audit (best-effort log only — we don't have an AuditLog table in V1)
  console.log(
    `[admin/pilots] ${admin.user.email} created pilot ${user.email} (${user.id})`,
  );

  revalidatePath("/admin/pilots");
  redirect(`/admin/pilots/${user.id}?welcome=1`);
}

const AdjustHdvSchema = z.object({
  pilotId: UuidSchema,
  amountStr: z.string().min(1, "Durée obligatoire"),
  sign: z.enum(["credit", "debit"]),
  reason: NonEmptyTextSchema,
});

export async function adjustHdv(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = AdjustHdvSchema.safeParse({
    pilotId: formData.get("pilotId"),
    amountStr: formData.get("amount"),
    sign: formData.get("sign"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const pilotId = formData.get("pilotId");
    redirect(`/admin/pilots/${pilotId}?error=invalid`);
  }

  const minutes = parseHHMM(parsed.data.amountStr);
  if (minutes === null || minutes <= 0) {
    redirect(`/admin/pilots/${parsed.data.pilotId}?error=bad_amount`);
  }

  const signed = parsed.data.sign === "credit" ? minutes : -minutes;

  await prisma.$transaction(async (tx) => {
    const pilot = await tx.user.findUnique({
      where: { id: parsed.data.pilotId },
      select: { id: true },
    });
    if (!pilot) {
      throw new Error(`Pilot ${parsed.data.pilotId} not found`);
    }
    await applyHdvMutation(tx, {
      userId: parsed.data.pilotId,
      type: "ADMIN_ADJUSTMENT",
      amountMin: signed,
      reference: parsed.data.reason,
      performedById: admin.user.id,
      // Allow negative balance on admin debits — the operator knows
      // what they're doing and may need to correct over-credited accounts.
      allowNegative: true,
    });
  });

  console.log(
    `[admin/pilots] ${admin.user.email} adjusted ${parsed.data.pilotId} by ${signed} min (reason: ${parsed.data.reason})`,
  );

  revalidatePath(`/admin/pilots/${parsed.data.pilotId}`);
  revalidatePath("/admin/pilots");
  redirect(`/admin/pilots/${parsed.data.pilotId}?adjusted=1`);
}

const PilotIdOnlySchema = z.object({ pilotId: UuidSchema });

export async function resetPilotPassword(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = PilotIdOnlySchema.safeParse({ pilotId: formData.get("pilotId") });
  if (!parsed.success) redirect("/admin/pilots");

  const pilot = await prisma.user.findUnique({
    where: { id: parsed.data.pilotId },
    select: { id: true, email: true, name: true },
  });
  if (!pilot) redirect("/admin/pilots");

  const tempPassword = generateTempPassword();
  const passwordHash = await hash(tempPassword, 12);

  await prisma.user.update({
    where: { id: pilot.id },
    data: { passwordHash, mustResetPw: true },
  });

  const result = await sendPasswordResetEmail(pilot.email, pilot.name, tempPassword);
  if ("error" in result) {
    console.error(`[admin/pilots] Failed to send reset email to ${pilot.email}:`, result.error);
  }

  console.log(`[admin/pilots] ${admin.user.email} reset password for ${pilot.email}`);

  revalidatePath(`/admin/pilots/${pilot.id}`);
  redirect(`/admin/pilots/${pilot.id}?pwreset=1`);
}

export async function promotePilotToAdmin(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = PilotIdOnlySchema.safeParse({ pilotId: formData.get("pilotId") });
  if (!parsed.success) redirect("/admin/pilots");

  if (parsed.data.pilotId === admin.user.id) {
    redirect(`/admin/pilots/${parsed.data.pilotId}?error=invalid`);
  }

  const pilot = await prisma.user.findUnique({
    where: { id: parsed.data.pilotId },
    select: { id: true, email: true, role: true },
  });
  if (!pilot) redirect("/admin/pilots");

  if (pilot.role === "ADMIN") {
    redirect(`/admin/pilots/${pilot.id}?error=invalid`);
  }

  await prisma.user.update({
    where: { id: pilot.id },
    data: { role: "ADMIN" },
  });

  console.log(
    `[admin/pilots] ${admin.user.email} promoted ${pilot.email} to admin`,
  );

  revalidatePath("/admin/pilots");
  revalidatePath(`/admin/pilots/${pilot.id}`);
  redirect(`/admin/pilots/${pilot.id}?promoted=1`);
}

const ChangeEmailSchema = z.object({
  pilotId: UuidSchema,
  email: EmailSchema,
});

export async function changePilotEmail(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = ChangeEmailSchema.safeParse({
    pilotId: formData.get("pilotId"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    const id = formData.get("pilotId");
    if (typeof id === "string") redirect(`/admin/pilots/${id}?error=bad_email`);
    redirect("/admin/pilots");
  }

  const pilot = await prisma.user.findUnique({
    where: { id: parsed.data.pilotId },
    select: { id: true, email: true },
  });
  if (!pilot) redirect("/admin/pilots");

  // No-op if the email is unchanged — avoid the unique-collision check
  // round-trip and the audit log noise.
  if (pilot.email === parsed.data.email) {
    redirect(`/admin/pilots/${pilot.id}`);
  }

  // Uniqueness pre-check. The DB unique index on User.email is the
  // ultimate guard, but the pre-check lets us redirect with a precise
  // error code instead of crashing the server action.
  const collision = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (collision && collision.id !== pilot.id) {
    redirect(`/admin/pilots/${pilot.id}?error=email_taken`);
  }

  await prisma.user.update({
    where: { id: pilot.id },
    data: { email: parsed.data.email },
  });

  console.log(
    `[admin/pilots] ${admin.user.email} changed email for pilot ${pilot.id} : ${pilot.email} → ${parsed.data.email}`,
  );

  revalidatePath(`/admin/pilots/${pilot.id}`);
  revalidatePath("/admin/pilots");
  redirect(`/admin/pilots/${pilot.id}?emailchanged=1`);
}

export async function togglePilotActive(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = PilotIdOnlySchema.safeParse({ pilotId: formData.get("pilotId") });
  if (!parsed.success) redirect("/admin/pilots");

  // Don't let an admin deactivate themselves — easy way to lock out
  // the bootstrap admin.
  if (parsed.data.pilotId === admin.user.id) {
    redirect("/admin/pilots?error=self_deactivate");
  }

  const pilot = await prisma.user.findUnique({
    where: { id: parsed.data.pilotId },
    select: { id: true, isActive: true, email: true },
  });
  if (!pilot) redirect("/admin/pilots");

  await prisma.user.update({
    where: { id: pilot.id },
    data: { isActive: !pilot.isActive },
  });

  console.log(
    `[admin/pilots] ${admin.user.email} ${pilot.isActive ? "deactivated" : "reactivated"} ${pilot.email}`,
  );

  revalidatePath("/admin/pilots");
  revalidatePath(`/admin/pilots/${pilot.id}`);
  redirect(`/admin/pilots/${pilot.id}?toggled=1`);
}
