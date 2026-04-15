import { test, expect, loginAs, resetDb } from "./fixtures";

function yesterdayYmd(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

test.describe("Flights — full submit journey", () => {
  test.beforeEach(() => resetDb());

  test("logbook lists the seeded flight", async ({ page }) => {
    await loginAs(page, "pilot1");
    await page.goto("/flights");
    await expect(page).toHaveURL(/\/flights/);
    // The seeded flight is LFPN → LFPO from 2 days ago
    await expect(page.locator("body")).toContainText("LFPN");
    await expect(page.locator("body")).toContainText("LFPO");
  });

  test("submit flight debits the balance and appears in the logbook", async ({
    page,
  }) => {
    await loginAs(page, "pilot1");
    // pilot1 seeded with hdvBalanceMin=600 (10h00). After a 90-min
    // flight the dashboard must show 8h30 (600-90=510 min).
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText("10h00");

    await page.goto("/flights/new");
    await page.fill('input[name="flightDate"]', yesterdayYmd());
    await page.fill('input[name="depAirport"]', "LFPN");
    await page.fill('input[name="arrAirport"]', "LFPG");
    await page.fill('input[name="engineStart"]', "14:00");
    await page.fill('input[name="engineStop"]', "15:30");
    await page.fill('input[name="landings"]', "2");
    await Promise.all([
      page.waitForURL(/\/flights\/new\?added=1/, { timeout: 15_000 }),
      page.getByRole("button", { name: /Enregistrer le vol/ }).click(),
    ]);

    // Balance debited: 600 - 90 = 510 = 8h30
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText("8h30");

    // Logbook shows the new flight (LFPN → LFPG distinguishes it from
    // the seeded LFPN → LFPO)
    await page.goto("/flights");
    await expect(page.locator("body")).toContainText("LFPG");
    await expect(page.locator("body")).toContainText("1h30");
  });

  // Note: future-flight + invalid-ICAO rejection paths are covered by
  // tests/integration/flights-submit.test.ts. Next 16's server-action
  // redirect doesn't reliably push the ?error=* query string to the
  // Playwright URL bar, so we stop asserting on URL here and rely on
  // the integration layer for the negative-path DB state.

  test("/flights/new renders the submission form", async ({ page }) => {
    await loginAs(page, "pilot1");
    await page.goto("/flights/new");
    await expect(page).toHaveURL(/\/flights\/new/);
    await expect(page.locator('input[name="depAirport"]')).toBeVisible();
    await expect(page.locator('input[name="arrAirport"]')).toBeVisible();
    await expect(page.locator('input[name="engineStart"]')).toBeVisible();
    await expect(page.locator('input[name="engineStop"]')).toBeVisible();
  });
});
