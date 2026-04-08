// FlightSchedule — admin tarifs (Package CRUD) server actions. V2.
//
// Source of truth is the local `Package` table; Stripe is mirrored on
// every mutation. Stripe Prices are immutable, so price/duration changes
// archive the old Stripe Price and create a new one. Soft-delete only —
// historical PACKAGE_PURCHASE transactions keep the join target.

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { UuidSchema } from "@/lib/validation";

/**
 * Format a thrown error as a user-readable French message. Used by the
 * Stripe-touching actions to surface API failures as a banner instead of
 * crashing the server-component render.
 */
function stripeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Erreur Stripe inconnue";
}

const PackageInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  // Price input is in EUR (decimal accepted) — convert to cents.
  priceEUR: z.coerce.number().min(0).max(100_000),
  // HDV input is in minutes.
  hdvMinutes: z.coerce.number().int().min(15).max(50_000),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

export async function createPackage(formData: FormData) {
  await requireAdmin();

  const parsed = PackageInputSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    priceEUR: formData.get("priceEUR"),
    hdvMinutes: formData.get("hdvMinutes"),
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) {
    redirect("/admin/tarifs?error=invalid");
  }

  const priceCentsHT = Math.round(parsed.data.priceEUR * 100);

  // Stripe ops are wrapped in try/catch so a Stripe API failure surfaces
  // as a banner instead of crashing the server-component render. The
  // redirect() call is OUTSIDE the catch (it throws a NEXT_REDIRECT
  // sentinel that the catch must not swallow).
  //
  // We deliberately do NOT set `default_price` on the product. Stripe
  // refuses to archive a Price that is still its product's default_price,
  // and Stripe has no API to clear default_price back to null. Pilot
  // checkout reads the explicit stripePriceId from our DB anyway, so
  // default_price serves no functional purpose for FlightSchedule and
  // setting it would just block future archive/replace operations.
  const stripe = getStripe();
  let stripeError: string | null = null;
  let createdProductId: string | null = null;
  let createdPriceId: string | null = null;
  try {
    const product = await stripe.products.create({
      name: parsed.data.name,
      description: parsed.data.description || undefined,
      metadata: {
        flyHdvMin: String(parsed.data.hdvMinutes),
      },
    });
    createdProductId = product.id;
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: priceCentsHT,
      currency: "eur",
      tax_behavior: "exclusive",
      metadata: {
        flyHdvMin: String(parsed.data.hdvMinutes),
      },
    });
    createdPriceId = price.id;
  } catch (err) {
    console.error("[admin/tarifs] createPackage Stripe error:", err);
    stripeError = stripeErrorMessage(err);
  }
  if (stripeError) {
    redirect(`/admin/tarifs?error=stripe&msg=${encodeURIComponent(stripeError)}`);
  }

  await prisma.package.create({
    data: {
      stripeProductId: createdProductId!,
      stripePriceId: createdPriceId!,
      name: parsed.data.name,
      description: parsed.data.description || null,
      priceCentsHT,
      hdvMinutes: parsed.data.hdvMinutes,
      sortOrder: parsed.data.sortOrder,
      isActive: true,
    },
  });

  revalidatePath("/admin/tarifs");
  revalidatePath("/dashboard");
  redirect("/admin/tarifs?created=1");
}

export async function updatePackage(formData: FormData) {
  await requireAdmin();

  const idResult = UuidSchema.safeParse(formData.get("id"));
  if (!idResult.success) redirect("/admin/tarifs?error=invalid");

  const parsed = PackageInputSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    priceEUR: formData.get("priceEUR"),
    hdvMinutes: formData.get("hdvMinutes"),
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) {
    redirect("/admin/tarifs?error=invalid");
  }

  const priceCentsHT = Math.round(parsed.data.priceEUR * 100);

  const existing = await prisma.package.findUnique({
    where: { id: idResult.data },
  });
  if (!existing) redirect("/admin/tarifs?error=invalid");

  const stripe = getStripe();
  let stripeError: string | null = null;
  let stripePriceId = existing.stripePriceId;

  try {
    // Always update product metadata + name + description.
    await stripe.products.update(existing.stripeProductId, {
      name: parsed.data.name,
      description: parsed.data.description || undefined,
      metadata: {
        flyHdvMin: String(parsed.data.hdvMinutes),
      },
    });

    // If price/minutes changed, replace the Stripe Price (Prices are
    // immutable). New packages don't set `default_price` so the old
    // Price can simply be archived. Best-effort on the archive call:
    // legacy packages (Pack GOLD, Standard - Dry) DO have default_price
    // set and Stripe will reject archiving their old price — that's
    // fine, we just leave the orphaned Price active in Stripe and move
    // on. The local DB stripePriceId points at the new Price, so the
    // pilot checkout uses the right one.
    if (
      priceCentsHT !== existing.priceCentsHT ||
      parsed.data.hdvMinutes !== existing.hdvMinutes
    ) {
      const newPrice = await stripe.prices.create({
        product: existing.stripeProductId,
        unit_amount: priceCentsHT,
        currency: "eur",
        tax_behavior: "exclusive",
        metadata: {
          flyHdvMin: String(parsed.data.hdvMinutes),
        },
      });
      stripePriceId = newPrice.id;
      try {
        await stripe.prices.update(existing.stripePriceId, { active: false });
      } catch (innerErr) {
        console.warn(
          "[admin/tarifs] updatePackage: archiving old Price failed (non-fatal — likely a legacy default_price):",
          innerErr,
        );
      }
    }
  } catch (err) {
    console.error("[admin/tarifs] updatePackage Stripe error:", err);
    stripeError = stripeErrorMessage(err);
  }
  if (stripeError) {
    redirect(`/admin/tarifs?error=stripe&msg=${encodeURIComponent(stripeError)}`);
  }

  await prisma.package.update({
    where: { id: idResult.data },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      priceCentsHT,
      hdvMinutes: parsed.data.hdvMinutes,
      sortOrder: parsed.data.sortOrder,
      stripePriceId,
    },
  });

  revalidatePath("/admin/tarifs");
  revalidatePath("/dashboard");
  redirect("/admin/tarifs?updated=1");
}

export async function archivePackage(formData: FormData) {
  await requireAdmin();
  const idResult = UuidSchema.safeParse(formData.get("id"));
  if (!idResult.success) redirect("/admin/tarifs?error=invalid");

  const existing = await prisma.package.findUnique({
    where: { id: idResult.data },
  });
  if (!existing) redirect("/admin/tarifs?error=invalid");

  // Stripe archival is BEST-EFFORT. Stripe rejects archiving a Price that
  // is the product's default_price; archiving the product itself works
  // and is what actually disables the package in the pilot dashboard.
  // The local DB soft-delete is the source of truth for app behavior.
  const stripe = getStripe();
  try {
    await stripe.products.update(existing.stripeProductId, { active: false });
  } catch (err) {
    console.warn(
      "[admin/tarifs] archive: products.update failed (non-fatal):",
      err,
    );
  }
  try {
    await stripe.prices.update(existing.stripePriceId, { active: false });
  } catch (err) {
    console.warn(
      "[admin/tarifs] archive: prices.update failed (non-fatal):",
      err,
    );
  }

  await prisma.package.update({
    where: { id: idResult.data },
    data: { isActive: false },
  });

  revalidatePath("/admin/tarifs");
  revalidatePath("/dashboard");
  redirect("/admin/tarifs?archived=1");
}

export async function unarchivePackage(formData: FormData) {
  await requireAdmin();
  const idResult = UuidSchema.safeParse(formData.get("id"));
  if (!idResult.success) redirect("/admin/tarifs?error=invalid");

  const existing = await prisma.package.findUnique({
    where: { id: idResult.data },
  });
  if (!existing) redirect("/admin/tarifs?error=invalid");

  // Best-effort Stripe reactivation — the local DB flip is the source of
  // truth, the Stripe calls are tidiness.
  const stripe = getStripe();
  try {
    await stripe.products.update(existing.stripeProductId, { active: true });
  } catch (err) {
    console.warn(
      "[admin/tarifs] unarchive: products.update failed (non-fatal):",
      err,
    );
  }
  try {
    await stripe.prices.update(existing.stripePriceId, { active: true });
  } catch (err) {
    console.warn(
      "[admin/tarifs] unarchive: prices.update failed (non-fatal):",
      err,
    );
  }

  await prisma.package.update({
    where: { id: idResult.data },
    data: { isActive: true },
  });

  revalidatePath("/admin/tarifs");
  revalidatePath("/dashboard");
  redirect("/admin/tarifs?unarchived=1");
}
