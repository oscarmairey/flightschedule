// Maintenance "HDV depuis" calc — getMaintenanceSummaries.
//
// A visit carries an optional time-of-day (timeMin) so it can sit BETWEEN
// two flights on the same calendar day. The HDV-since total must then
// count flights on strictly-later dates PLUS same-day flights whose bloc
// OFF is after the visit time. A legacy visit (timeMin null) excludes all
// same-day flights (the original strict `date >` behaviour).

import { describe, it, expect } from "vitest";
import { getTestPrisma } from "../setup/db";
import { makeUser } from "../setup/factories";
import { getMaintenanceSummaries } from "@/lib/maintenance";

const VISIT_DAY = new Date("2026-04-10T00:00:00.000Z");
const EARLIER_DAY = new Date("2026-04-09T00:00:00.000Z");
const LATER_DAY = new Date("2026-04-11T00:00:00.000Z");

async function annualSummary() {
  const summaries = await getMaintenanceSummaries();
  const annual = summaries.find((s) => s.type === "ANNUAL_VISIT");
  if (!annual) throw new Error("ANNUAL_VISIT summary missing");
  return annual;
}

describe("getMaintenanceSummaries — visit time sandwiches same-day flights", () => {
  it("counts same-day flights after the visit time, excludes the one before", async () => {
    const prisma = getTestPrisma();
    const pilot = await makeUser();

    // Same-day flights straddling a 12:00 visit.
    await prisma.flight.create({
      data: {
        userId: pilot.id,
        date: VISIT_DAY,
        depAirport: "LFPN",
        arrAirport: "LFPN",
        engineStart: "10:00", // before the visit → excluded
        engineStop: "11:00",
        actualDurationMin: 60,
        landings: 1,
        photos: [],
      },
    });
    await prisma.flight.create({
      data: {
        userId: pilot.id,
        date: VISIT_DAY,
        depAirport: "LFPN",
        arrAirport: "LFPN",
        engineStart: "14:00", // after the visit → counted
        engineStop: "15:30",
        actualDurationMin: 90,
        landings: 1,
        photos: [],
      },
    });
    // Strictly-later date → always counted.
    await prisma.flight.create({
      data: {
        userId: pilot.id,
        date: LATER_DAY,
        depAirport: "LFPN",
        arrAirport: "LFPN",
        engineStart: "09:00",
        engineStop: "09:30",
        actualDurationMin: 30,
        landings: 1,
        photos: [],
      },
    });
    // Strictly-earlier date → never counted.
    await prisma.flight.create({
      data: {
        userId: pilot.id,
        date: EARLIER_DAY,
        depAirport: "LFPN",
        arrAirport: "LFPN",
        engineStart: "16:00",
        engineStop: "17:00",
        actualDurationMin: 60,
        landings: 1,
        photos: [],
      },
    });

    await prisma.maintenanceOperation.create({
      data: {
        type: "ANNUAL_VISIT",
        date: VISIT_DAY,
        timeMin: 12 * 60, // 12:00
        createdById: pilot.id,
      },
    });

    const annual = await annualSummary();
    expect(annual.latestTimeMin).toBe(720);
    // 90 (14:00 same-day) + 30 (later day). NOT 10:00 same-day, NOT earlier.
    expect(annual.hdvSinceMin).toBe(120);
  });

  it("legacy visit (timeMin null) excludes all same-day flights", async () => {
    const prisma = getTestPrisma();
    const pilot = await makeUser();

    await prisma.flight.create({
      data: {
        userId: pilot.id,
        date: VISIT_DAY,
        depAirport: "LFPN",
        arrAirport: "LFPN",
        engineStart: "14:00",
        engineStop: "15:30",
        actualDurationMin: 90,
        landings: 1,
        photos: [],
      },
    });
    await prisma.flight.create({
      data: {
        userId: pilot.id,
        date: LATER_DAY,
        depAirport: "LFPN",
        arrAirport: "LFPN",
        engineStart: "09:00",
        engineStop: "09:30",
        actualDurationMin: 30,
        landings: 1,
        photos: [],
      },
    });

    await prisma.maintenanceOperation.create({
      data: {
        type: "ANNUAL_VISIT",
        date: VISIT_DAY,
        timeMin: null,
        createdById: pilot.id,
      },
    });

    const annual = await annualSummary();
    expect(annual.latestTimeMin).toBeNull();
    // Only the strictly-later flight (30). Same-day 14:00 excluded.
    expect(annual.hdvSinceMin).toBe(30);
  });

  it("no visit logged → HDV-since is the grand total of all flights", async () => {
    const prisma = getTestPrisma();
    const pilot = await makeUser();
    await prisma.flight.create({
      data: {
        userId: pilot.id,
        date: VISIT_DAY,
        depAirport: "LFPN",
        arrAirport: "LFPN",
        engineStart: "10:00",
        engineStop: "11:00",
        actualDurationMin: 60,
        landings: 1,
        photos: [],
      },
    });

    const annual = await annualSummary();
    expect(annual.latestDate).toBeNull();
    expect(annual.hdvSinceMin).toBe(60);
  });
});
