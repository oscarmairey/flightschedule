// FlightSchedule — Resend email client.
//
// Used for:
//   - Sending temp passwords to newly created pilots (Phase 2)
//   - Sending temp passwords on admin-initiated password reset (Phase 2)
//
// V1 is admin-initiated only (D2). No /forgot-password flow, no signed
// reset tokens. The admin clicks a button, the system generates a new
// random temp password, hashes it for the DB, and emails the plaintext
// to the pilot. The pilot is forced to /setup-password on next sign-in.
//
// SECURITY:
//   - Never log the plaintext password
//   - Never persist the plaintext password (only the bcrypt hash)
//   - The temp password lives only in (a) the email body and (b) the
//     bcrypt hash in the DB

import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "FlightSchedule <noreply@notifications.flightschedule.org>";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend) return _resend;
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set");
  }
  _resend = new Resend(RESEND_API_KEY);
  return _resend;
}

export type EmailResult = { id: string } | { error: string };

/**
 * Send a temp-password welcome email to a freshly created pilot.
 */
export async function sendTempPasswordEmail(
  to: string,
  name: string,
  tempPassword: string,
): Promise<EmailResult> {
  const subject = "FlightSchedule – Bienvenue, voici vos identifiants";
  const html = `
    <p>Bonjour ${escapeHtml(name)},</p>
    <p>Un compte FlightSchedule vient d'être créé pour vous. Voici vos identifiants temporaires :</p>
    <ul>
      <li><strong>Email :</strong> ${escapeHtml(to)}</li>
      <li><strong>Mot de passe temporaire :</strong> <code>${escapeHtml(tempPassword)}</code></li>
    </ul>
    <p>Connectez-vous sur <a href="https://flightschedule.org/login">flightschedule.org</a>.
    Vous serez invité·e à définir votre propre mot de passe à la première connexion.</p>
    <p>Bons vols,<br/>L'équipe FlightSchedule</p>
  `;

  return await sendInternal({ to, subject, html });
}

/**
 * Send a password-reset email after an admin clicked "Réinitialiser le mot
 * de passe" on a pilot's detail page. Same content as the welcome email
 * but with a "réinitialisé" tone instead of "bienvenue".
 */
export async function sendPasswordResetEmail(
  to: string,
  name: string,
  tempPassword: string,
): Promise<EmailResult> {
  const subject = "FlightSchedule – Réinitialisation de votre mot de passe";
  const html = `
    <p>Bonjour ${escapeHtml(name)},</p>
    <p>Votre mot de passe FlightSchedule a été réinitialisé par l'administrateur. Voici vos nouveaux identifiants temporaires :</p>
    <ul>
      <li><strong>Email :</strong> ${escapeHtml(to)}</li>
      <li><strong>Mot de passe temporaire :</strong> <code>${escapeHtml(tempPassword)}</code></li>
    </ul>
    <p>Connectez-vous sur <a href="https://flightschedule.org/login">flightschedule.org</a>.
    Vous serez invité·e à choisir un nouveau mot de passe à la prochaine connexion.</p>
    <p>Bons vols,<br/>L'équipe FlightSchedule</p>
  `;

  return await sendInternal({ to, subject, html });
}

async function sendInternal(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<EmailResult> {
  // Test sandbox: never reach Resend. The E2E suite hammers
  // `createPilot` / `resetPilotPassword` and we don't want any of those
  // to sit 30 s waiting on api.resend.com. Any RESEND_API_KEY starting
  // with `re_test` is our fixture — short-circuit to a noop id.
  if ((process.env.RESEND_API_KEY ?? "").startsWith("re_test")) {
    return { id: "test-noop" };
  }
  try {
    const resend = getResend();
    const res = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    if (res.error) {
      console.error("[email] Resend error:", res.error);
      return { error: res.error.message };
    }
    return { id: res.data?.id ?? "" };
  } catch (err) {
    console.error("[email] send failed:", err);
    return { error: err instanceof Error ? err.message : "unknown" };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
