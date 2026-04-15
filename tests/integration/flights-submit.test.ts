// Rule #3b — Flight submission atomicity.
//
// We exercise the public server action `submitFlight` so the test goes
// through the real parse → overlap check → applyHdvMutation pipeline.
// `requireSession` is mocked per-test to stand in for the authenticated
// pilot. The server action calls redirect() on validation errors; we
// catch the NEXT_REDIRECT control-flow throw and assert the redirect URL.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestPrisma } from "../setup/db";
import { makeUser, getUserNetBalance } from "../setup/factories";
import { markUploaded } from "../setup/mocks";
import { makePhotoKey } from "@/lib/r2";

// Default session stub — each test sets `currentUserId` before calling
// submitFlight.
let currentUserId: string = "";
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    user: {
      id: currentUserId,
      email: `${currentUserId}@test.local`,
      role: "PILOT",
      mustResetPw: false,
    },
  })),
  requireAdmin: vi.fn(async () => ({ user: { id: currentUserId, role: "ADMIN" } })),
}));

// Prevent Next's redirect() from leaking control flow into Vitest.
// `NEXT_REDIRECT` is the internal signal; we re-throw it as an error we
// can assert on.
type RedirectSignal = { url: string };
function captureRedirect(err: unknown): RedirectSignal | null {
  if (!err || typeof err !== "object") return null;
  const digest = (err as { digest?: string }).digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT")) {
    return null;
  }
  const parts = digest.split(";");
  return { url: parts[2] ?? "" };
}

async function runExpectingRedirect(fn: () => Promise<unknown>): Promise<RedirectSignal> {
  try {
    await fn();
  } catch (err) {
    const redirect = captureRedirect(err);
    if (redirect) return redirect;
    throw err;
  }
  throw new Error("Expected a redirect to be thrown");
}

async function submitFormData(data: Record<string, string | string[]>) {
  const { submitFlight } = await import("@/app/flights/new/actions");
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) for (const entry of v) fd.append(k, entry);
    else fd.set(k, v);
  }
  return submitFlight(fd);
}

function yesterdayYmd(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

describe("submitFlight — rule #3b", () => {
  beforeEach(() => {
    currentUserId = "";
  });

  it("creates a Flight + FLIGHT_DEBIT transaction atomically", async () => {
    const prisma = getTestPrisma();
    const pilot = await makeUser({ hdvBalanceMin: 600 });
    currentUserId = pilot.id;

    const ymd = yesterdayYmd();
    const r = await runExpectingRedirect(() =>
      submitFormData({
        depAirport: "lfpn",
        arrAirport: "LFPO",
        flightDate: ymd,
        engineStart: "09:00",
        engineStop: "10:30",
        landings: "2",
      }),
    );
    expect(r.url).toMatch(/added=1/);

    const flight = await prisma.flight.findFirstOrThrow({
      where: { userId: pilot.id },
    });
    expect(flight.actualDurationMin).toBe(90);
    expect(flight.depAirport).toBe("LFPN");
    expect(flight.arrAirport).toBe("LFPO");
    expect(flight.landings).toBe(2);

    const tx = await prisma.transaction.findFirstOrThrow({
      where: { userId: pilot.id, type: "FLIGHT_DEBIT" },
    });
    expect(tx.amountMin).toBe(-90);
    expect(tx.flightId).toBe(flight.id);

    expect(await getUserNetBalance(pilot.id)).toBe(510);
  });

  it("rejects a flight in the future", async () => {
    const prisma = getTestPrisma();
    const pilot = await makeUser({ hdvBalanceMin: 600 });
    currentUserId = pilot.id;

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const r = await runExpectingRedirect(() =>
      submitFormData({
        depAirport: "LFPN",
        arrAirport: "LFPN",
        flightDate: tomorrow,
        engineStart: "10:00",
        engineStop: "11:00",
        landings: "1",
      }),
    );
    expect(r.url).toMatch(/error=engine/);
    expect(await prisma.flight.count()).toBe(0);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("rejects overlap with another pilot's flight on the same window", async () => {
    const prisma = getTestPrisma();
    const ymd = yesterdayYmd();

    // Pilot A submits 09:00–10:30 successfully.
    const pilotA = await makeUser({ hdvBalanceMin: 600 });
    currentUserId = pilotA.id;
    await runExpectingRedirect(() =>
      submitFormData({
        depAirport: "LFPN",
        arrAirport: "LFPN",
        flightDate: ymd,
        engineStart: "09:00",
        engineStop: "10:30",
        landings: "1",
      }),
    );

    // Pilot B tries 10:00–11:00 — overlaps.
    const pilotB = await makeUser({ hdvBalanceMin: 600 });
    currentUserId = pilotB.id;
    const r = await runExpectingRedirect(() =>
      submitFormData({
        depAirport: "LFPN",
        arrAirport: "LFPN",
        flightDate: ymd,
        engineStart: "10:00",
        engineStop: "11:00",
        landings: "1",
      }),
    );
    expect(r.url).toMatch(/error=engine/);
    expect(await prisma.flight.count()).toBe(1);
  });

  it("allows negative balance on submit (overdraft tolerance)", async () => {
    const prisma = getTestPrisma();
    const pilot = await makeUser({ hdvBalanceMin: 30 });
    currentUserId = pilot.id;

    await runExpectingRedirect(() =>
      submitFormData({
        depAirport: "LFPN",
        arrAirport: "LFPN",
        flightDate: yesterdayYmd(),
        engineStart: "09:00",
        engineStop: "10:30",
        landings: "1",
      }),
    );
    expect(await getUserNetBalance(pilot.id)).toBe(30 - 90);
  });

  it("rejects a smuggled photo key owned by another pilot", async () => {
    const prisma = getTestPrisma();
    const other = await makeUser();
    const pilot = await makeUser({ hdvBalanceMin: 600 });
    currentUserId = pilot.id;

    const alien = makePhotoKey(other.id);
    markUploaded(alien);

    const r = await runExpectingRedirect(() =>
      submitFormData({
        depAirport: "LFPN",
        arrAirport: "LFPN",
        flightDate: yesterdayYmd(),
        engineStart: "09:00",
        engineStop: "10:30",
        landings: "1",
        photoKeys: [alien],
      }),
    );
    expect(r.url).toMatch(/bad_photo_key/);
    expect(await prisma.flight.count()).toBe(0);
  });

  it("rejects a photo key that was never uploaded to R2", async () => {
    const prisma = getTestPrisma();
    const pilot = await makeUser({ hdvBalanceMin: 600 });
    currentUserId = pilot.id;

    const ownKey = makePhotoKey(pilot.id); // NOT marked uploaded

    const r = await runExpectingRedirect(() =>
      submitFormData({
        depAirport: "LFPN",
        arrAirport: "LFPN",
        flightDate: yesterdayYmd(),
        engineStart: "09:00",
        engineStop: "10:30",
        landings: "1",
        photoKeys: [ownKey],
      }),
    );
    expect(r.url).toMatch(/photo_missing/);
    expect(await prisma.flight.count()).toBe(0);
  });

  it("rejects more than MAX_PHOTOS_PER_FLIGHT photos", async () => {
    const prisma = getTestPrisma();
    const pilot = await makeUser({ hdvBalanceMin: 600 });
    currentUserId = pilot.id;

    const six = Array.from({ length: 6 }, () => {
      const key = makePhotoKey(pilot.id);
      markUploaded(key);
      return key;
    });

    const r = await runExpectingRedirect(() =>
      submitFormData({
        depAirport: "LFPN",
        arrAirport: "LFPN",
        flightDate: yesterdayYmd(),
        engineStart: "09:00",
        engineStop: "10:30",
        landings: "1",
        photoKeys: six,
      }),
    );
    expect(r.url).toMatch(/too_many_photos/);
    expect(await prisma.flight.count()).toBe(0);
  });

  it("enforces tach both-or-neither and ordering", async () => {
    const prisma = getTestPrisma();
    const pilot = await makeUser({ hdvBalanceMin: 600 });
    currentUserId = pilot.id;

    // Only start supplied — rejected.
    const r1 = await runExpectingRedirect(() =>
      submitFormData({
        depAirport: "LFPN",
        arrAirport: "LFPN",
        flightDate: yesterdayYmd(),
        engineStart: "09:00",
        engineStop: "10:30",
        landings: "1",
        tachyStart: "1234.56",
      }),
    );
    expect(r1.url).toMatch(/error=engine/);

    // Stop < start — rejected.
    const r2 = await runExpectingRedirect(() =>
      submitFormData({
        depAirport: "LFPN",
        arrAirport: "LFPN",
        flightDate: yesterdayYmd(),
        engineStart: "09:00",
        engineStop: "10:30",
        landings: "1",
        tachyStart: "2000.00",
        tachyStop: "1999.50",
      }),
    );
    expect(r2.url).toMatch(/error=engine/);
    expect(await prisma.flight.count()).toBe(0);
  });
});
