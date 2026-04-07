// CAVOK — duration helpers.
//
// Architectural rule #1: all durations are stored as integer minutes. The
// display layer is responsible for converting to/from HH:MM. Never use
// floats. Never use decimal hours. Never store strings in the database.

export const MIN_PER_HOUR = 60;

/**
 * Parse a user-supplied duration string into minutes.
 *
 * Accepts: "1h30", "1:30", "1h", "0:30", "90" (interpreted as bare minutes
 * only when there's no separator). Rejects negatives — callers that need
 * a negative amount (debits) should negate the result themselves.
 *
 * Returns null on invalid input. Callers should treat null as a validation
 * failure and surface a French error message to the user.
 */
export function parseHHMM(input: string): number | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toLowerCase();
  if (trimmed === "") return null;

  // "1h30", "1h", "1h0"
  const hMatch = trimmed.match(/^(\d{1,3})h(\d{0,2})$/);
  if (hMatch) {
    const h = Number(hMatch[1]);
    const m = hMatch[2] === "" ? 0 : Number(hMatch[2]);
    if (m >= 60) return null;
    return h * MIN_PER_HOUR + m;
  }

  // "1:30"
  const colonMatch = trimmed.match(/^(\d{1,3}):(\d{1,2})$/);
  if (colonMatch) {
    const h = Number(colonMatch[1]);
    const m = Number(colonMatch[2]);
    if (m >= 60) return null;
    return h * MIN_PER_HOUR + m;
  }

  // Pure integer → bare minutes (e.g. "90" → 90)
  if (/^\d{1,4}$/.test(trimmed)) {
    return Number(trimmed);
  }

  return null;
}

/**
 * Format minutes as a French-style duration label like "1h30" or "0h00".
 * Always two-digit minutes. For negative inputs, prefixes a minus sign.
 */
export function formatHHMM(minutes: number): string {
  if (!Number.isFinite(minutes)) return "—";
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minutes));
  const h = Math.floor(abs / MIN_PER_HOUR);
  const m = abs % MIN_PER_HOUR;
  return `${sign}${h}h${m.toString().padStart(2, "0")}`;
}

/**
 * Format minutes with an explicit signed prefix ("+1h30" / "-0h45").
 * Used in transaction history rows.
 */
export function formatHHMMSigned(minutes: number): string {
  if (!Number.isFinite(minutes)) return "—";
  if (minutes >= 0) return `+${formatHHMM(minutes)}`;
  return formatHHMM(minutes);
}

/**
 * Balance color tier per PRD §3.4.1:
 *   green > 5h, amber 2–5h, red < 2h.
 *
 * The thresholds in minutes:
 *   red    : balance < 120
 *   amber  : 120 ≤ balance ≤ 300
 *   green  : balance > 300
 */
export type BalanceTier = "green" | "amber" | "red";

export const BALANCE_THRESHOLDS = {
  RED_MAX_MIN: 120, // strictly less than this is red
  GREEN_MIN_MIN: 300, // strictly greater than this is green
} as const;

export function balanceTier(minutes: number): BalanceTier {
  if (minutes < BALANCE_THRESHOLDS.RED_MAX_MIN) return "red";
  if (minutes > BALANCE_THRESHOLDS.GREEN_MIN_MIN) return "green";
  return "amber";
}

/**
 * Tailwind class fragments for the three balance tiers. Used by Badge,
 * the dashboard balance card, and the admin pilots list. Keep all
 * tier-related styling in this single source of truth.
 */
export const BALANCE_TIER_CLASSES: Record<BalanceTier, string> = {
  green: "bg-emerald-100 text-emerald-900 border-emerald-300",
  amber: "bg-amber-100 text-amber-900 border-amber-300",
  red: "bg-red-100 text-red-900 border-red-300",
};
