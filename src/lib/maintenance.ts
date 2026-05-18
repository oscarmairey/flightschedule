// FlightSchedule — airframe maintenance helpers.
//
// Single shared aircraft in V1/V2. Maintenance events are aircraft-wide,
// not per-pilot. "HDV depuis" is the sum of `Flight.actualDurationMin`
// for every flight flown strictly after the latest event date — when no
// event of a given type has been logged yet, it equals the grand total
// of all flights on record.

import { prisma } from "@/lib/db";
import type { MaintenanceOperationType } from "@/generated/prisma/enums";

export type MaintenanceTypeSummary = {
  type: MaintenanceOperationType;
  latestDate: Date | null;
  hdvSinceMin: number;
};

const TYPES: MaintenanceOperationType[] = ["ANNUAL_VISIT", "WORKSHOP_VISIT"];

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceOperationType, string> = {
  ANNUAL_VISIT: "Visite annuelle",
  WORKSHOP_VISIT: "Visite atelier",
};

/**
 * Look up the latest date for each maintenance type, then sum the flight
 * minutes flown after that date. Two cheap queries per type — runs on
 * the global flight table which is small (a few hundred rows/year).
 */
export async function getMaintenanceSummaries(): Promise<MaintenanceTypeSummary[]> {
  const latestByType = await prisma.maintenanceOperation.groupBy({
    by: ["type"],
    _max: { date: true },
  });
  const latestMap = new Map<MaintenanceOperationType, Date | null>();
  for (const row of latestByType) {
    latestMap.set(row.type, row._max.date ?? null);
  }

  const results: MaintenanceTypeSummary[] = [];
  for (const type of TYPES) {
    const latestDate = latestMap.get(type) ?? null;
    const agg = await prisma.flight.aggregate({
      _sum: { actualDurationMin: true },
      where: latestDate ? { date: { gt: latestDate } } : {},
    });
    results.push({
      type,
      latestDate,
      hdvSinceMin: agg._sum.actualDurationMin ?? 0,
    });
  }
  return results;
}
