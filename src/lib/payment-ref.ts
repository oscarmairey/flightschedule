// FlightSchedule — bank-transfer reference code generator.
//
// Each pending bank-transfer Transaction is tagged with a short
// human-readable reference code (e.g. "FS-A1B2C3") that the pilot is
// asked to put in the bank wire memo. The admin uses the same code to
// match incoming wires to the pending row in /admin and click
// "Accepter" / "Refuser".
//
// The alphabet is Crockford-ish base32: 24 letters and 8 digits, with
// `0`, `1`, `I`, `O` removed so the code can be transcribed by hand
// without ambiguity. 6 characters → 32^6 ≈ 1 billion combinations,
// massively oversized for the volume here (~12 pilots, a few hundred
// wires/year). The server action retries on the rare DB unique
// collision before exposing the code to the user.

import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

/**
 * Generate a single payment reference code, e.g. "FS-A1B2C3".
 *
 * Uses `crypto.randomInt` (rejection-sampled, uniform) per character so
 * the code is unbiased and unguessable. The "FS-" prefix makes it
 * trivially identifiable in a bank statement.
 */
export function generatePaymentRef(): string {
  let body = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    body += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return `FS-${body}`;
}
