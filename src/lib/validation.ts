// FlySchedule — shared Zod validation schemas.
//
// PRD §7.3 mandates server-side validation on every mutation. Client-side
// validation is for UX only — the server NEVER trusts client input.
//
// Convention: each schema is exported as a named constant. Compose them
// in feature-specific schemas (e.g., `BookReservationSchema = z.object({
// startsAt: z.coerce.date(), durationMin: DurationMinutesSchema, ... })`).
//
// Error messages are written in French because Zod errors are sometimes
// surfaced directly to the user.

import { z } from "zod";

export const EmailSchema = z
  .string()
  .min(1, "Email obligatoire")
  .email("Email invalide")
  .max(255)
  .transform((s) => s.trim().toLowerCase());

/**
 * Password policy: at least 10 chars, must contain at least one
 * uppercase letter, one lowercase letter, and one digit. Used by both
 * /setup-password and the admin temp-password generator.
 */
export const PasswordSchema = z
  .string()
  .min(10, "Le mot de passe doit contenir au moins 10 caractères")
  .max(128)
  .refine((p) => /[A-Z]/.test(p), {
    message: "Au moins une majuscule",
  })
  .refine((p) => /[a-z]/.test(p), {
    message: "Au moins une minuscule",
  })
  .refine((p) => /\d/.test(p), {
    message: "Au moins un chiffre",
  });

/**
 * "1h30", "1:30", "0:45", or bare minutes like "90". The string form
 * is parsed elsewhere via `parseHHMM` (src/lib/duration.ts) — this
 * schema only validates shape.
 */
export const HHMMSchema = z
  .string()
  .min(1, "Durée obligatoire")
  .regex(/^(\d{1,3}h\d{0,2}|\d{1,3}:\d{1,2}|\d{1,4})$/, "Durée invalide");

/**
 * Duration in raw minutes (already parsed). Used by server actions
 * that receive a parsed integer rather than a string.
 */
export const DurationMinutesSchema = z
  .number()
  .int("La durée doit être un entier")
  .min(1, "Durée minimale 1 minute");

/**
 * ICAO airport code: exactly four uppercase ASCII letters.
 */
export const IcaoSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}$/, "Code OACI invalide (4 lettres)");

export const UuidSchema = z.string().uuid("Identifiant invalide");

/**
 * Non-empty French text — used for admin reasons, remarks, etc.
 * Minimum 3 characters to prevent ":(" or "x" reasons.
 */
export const NonEmptyTextSchema = z
  .string()
  .trim()
  .min(3, "Texte trop court")
  .max(1000, "Texte trop long");
