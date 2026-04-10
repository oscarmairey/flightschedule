// FlightSchedule — /admin/virements server actions.
//
// Two server actions: `validateBankTransfer` and `rejectBankTransfer`.
//
// validate: the admin has seen the incoming wire in the association's
// bank account, matches the reference code to a PENDING BankTransfer row
// here, and clicks "Valider". We then:
//   1. Re-read the BankTransfer inside a Serializable transaction to
//      confirm it's still PENDING (defends against double-click races).
//   2. Call `applyHdvMutation` with `type: BANK_TRANSFER` — this creates
//      the ledger row and updates the denormalised balance atomically.
//   3. Flip the BankTransfer row to VALIDATED and link it to the newly-
//      created Transaction via `transactionId`. The unique index on
//      that column makes double-crediting impossible even under a race.
//
// reject: admin saw no wire, or received wrong amount, or the pilot is
// spamming PENDING rows. Marks the BankTransfer row REJECTED with an
// optional note. No HDV change (there was nothing to credit in the
// first place — the pilot's wire intent never materialised into a real
// balance change).

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { applyHdvMutation } from "@/lib/hdv";
import { UuidSchema } from "@/lib/validation";

const RejectSchema = z.object({
  id: UuidSchema,
  rejectionNote: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export async function validateBankTransfer(formData: FormData) {
  const session = await requireAdmin();

  const idResult = UuidSchema.safeParse(formData.get("id"));
  if (!idResult.success) {
    redirect("/admin/virements?error=invalid");
  }
  const bankTransferId = idResult.data;

  await prisma.$transaction(
    async (tx) => {
      const bt = await tx.bankTransfer.findUnique({
        where: { id: bankTransferId },
        select: {
          id: true,
          userId: true,
          hdvMinutes: true,
          priceCentsTTC: true,
          reference: true,
          status: true,
        },
      });
      if (!bt) {
        throw new Error("BankTransfer not found");
      }
      if (bt.status !== "PENDING") {
        // Already processed — nothing to do. This is the idempotent skip
        // path that covers a double-click from the admin UI.
        return;
      }

      const { transactionId } = await applyHdvMutation(tx, {
        userId: bt.userId,
        type: "BANK_TRANSFER",
        amountMin: bt.hdvMinutes,
        reference: bt.reference,
        priceCents: bt.priceCentsTTC,
        performedById: session.user.id,
      });

      await tx.bankTransfer.update({
        where: { id: bt.id },
        data: {
          status: "VALIDATED",
          reviewedById: session.user.id,
          reviewedAt: new Date(),
          transactionId,
        },
      });
    },
    { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 },
  );

  revalidatePath("/admin/virements");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect("/admin/virements?validated=1");
}

export async function rejectBankTransfer(formData: FormData) {
  const session = await requireAdmin();

  const parsed = RejectSchema.safeParse({
    id: formData.get("id"),
    rejectionNote: formData.get("rejectionNote") ?? undefined,
  });
  if (!parsed.success) {
    redirect("/admin/virements?error=invalid");
  }

  const existing = await prisma.bankTransfer.findUnique({
    where: { id: parsed.data.id },
    select: { status: true },
  });
  if (!existing) {
    redirect("/admin/virements?error=invalid");
  }
  if (existing.status !== "PENDING") {
    // Idempotent skip — already processed.
    redirect("/admin/virements?rejected=1");
  }

  await prisma.bankTransfer.update({
    where: { id: parsed.data.id },
    data: {
      status: "REJECTED",
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      rejectionNote: parsed.data.rejectionNote ?? null,
    },
  });

  revalidatePath("/admin/virements");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect("/admin/virements?rejected=1");
}
