// FlightSchedule — airframe maintenance helpers.
//
// Single shared aircraft in V1/V2. Maintenance events are aircraft-wide,
// not per-pilot. "HDV depuis" is the sum of `Flight.actualDurationMin` for
// every flight flown strictly after the latest event — when no event of a
// given type has been logged yet, it equals the grand total of all flights
// on record.
//
// A maintenance event carries an optional time-of-day (`timeMin`, Paris-
// local minutes since midnight) so a visit can sit BETWEEN two flights on
// the same calendar day. The "HDV depuis" calc then counts:
//   - every flight on a strictly later date, plus
//   - same-day flights whose bloc OFF (engineStart) is after `timeMin`.
// When `timeMin` is null (legacy rows) same-day flights are excluded — the
// original strict `date >` behaviour.

import { prisma } from "@/lib/db";
import { parseHHMM } from "@/lib/duration";
import type { MaintenanceOperationType } from "@/generated/prisma/enums";

export type MaintenanceTypeSummary = {
  type: MaintenanceOperationType;
  latestDate: Date | null;
  latestTimeMin: number | null;
  hdvSinceMin: number;
};

const TYPES: MaintenanceOperationType[] = ["ANNUAL_VISIT", "WORKSHOP_VISIT"];

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceOperationType, string> = {
  ANNUAL_VISIT: "Visite annuelle",
  WORKSHOP_VISIT: "Visite atelier",
};

/**
 * Look up the latest event for each maintenance type, then sum the flight
 * minutes flown after it. The global flight table is small (a few hundred
 * rows/year) so the same-day refinement is done in JS.
 */
export async function getMaintenanceSummaries(): Promise<MaintenanceTypeSummary[]> {
  const results: MaintenanceTypeSummary[] = [];

  for (const type of TYPES) {
    // Latest event of this type — break ties on the same day by time, so a
    // later same-day visit wins. NULLS LAST keeps a timed visit ahead of a
    // legacy whole-day one logged on the same date.
    const latest = await prisma.maintenanceOperation.findFirst({
      where: { type },
      orderBy: [{ date: "desc" }, { timeMin: { sort: "desc", nulls: "last" } }],
      select: { date: true, timeMin: true },
    });

    if (!latest) {
      const agg = await prisma.flight.aggregate({
        _sum: { actualDurationMin: true },
      });
      results.push({
        type,
        latestDate: null,
        latestTimeMin: null,
        hdvSinceMin: agg._sum.actualDurationMin ?? 0,
      });
      continue;
    }

    // Flights on a strictly later calendar date always count.
    const laterAgg = await prisma.flight.aggregate({
      _sum: { actualDurationMin: true },
      where: { date: { gt: latest.date } },
    });
    let hdvSinceMin = laterAgg._sum.actualDurationMin ?? 0;

    // Same-day flights count only when the visit has a time AND the flight's
    // bloc OFF is strictly after it.
    if (latest.timeMin !== null) {
      const sameDay = await prisma.flight.findMany({
        where: { date: latest.date },
        select: { engineStart: true, actualDurationMin: true },
      });
      for (const f of sameDay) {
        const offMin = parseHHMM(f.engineStart);
        if (offMin !== null && offMin > latest.timeMin) {
          hdvSinceMin += f.actualDurationMin;
        }
      }
    }

    results.push({
      type,
      latestDate: latest.date,
      latestTimeMin: latest.timeMin,
      hdvSinceMin,
    });
  }

  return results;
}
