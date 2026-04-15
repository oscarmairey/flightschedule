import { describe, expect, it } from "vitest";
import {
  formatEstimatedFlightHours,
  formatReservationDuration,
  getReservationDayCount,
} from "@/lib/reservationDisplay";

describe("reservationDisplay", () => {
  it("keeps hour formatting for reservations up to 24h", () => {
    expect(getReservationDayCount(180)).toBeNull();
    expect(getReservationDayCount(24 * 60)).toBeNull();
    expect(formatReservationDuration(180)).toBe("3h00");
    expect(formatReservationDuration(9 * 60)).toBe("9h00");
  });

  it("switches to calendar-day labels only after 24h", () => {
    expect(getReservationDayCount(24 * 60 + 1)).toBe(2);
    expect(getReservationDayCount(48 * 60 + 1)).toBe(3);
    expect(formatReservationDuration(27 * 60)).toBe("2 jours");
    expect(formatReservationDuration(50 * 60)).toBe("3 jours");
  });

  it("formats estimated flight hours with two decimals", () => {
    expect(formatEstimatedFlightHours(2.75)).toBe("2,75 h");
    expect(formatEstimatedFlightHours(null)).toBeNull();
  });
});
