import { formatHHMM } from "@/lib/duration";

const MIN_PER_DAY = 24 * 60;

type DecimalLike = { toString(): string };

export function getReservationDayCount(durationMin: number): number | null {
  if (!Number.isFinite(durationMin) || durationMin <= MIN_PER_DAY) return null;
  return Math.ceil(durationMin / MIN_PER_DAY);
}

export function formatReservationDuration(durationMin: number): string {
  const days = getReservationDayCount(durationMin);
  if (!days) return formatHHMM(durationMin);
  return `${days} ${days > 1 ? "jours" : "jour"}`;
}

export function formatEstimatedFlightHours(
  value: number | DecimalLike | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `${numeric.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} h`;
}
