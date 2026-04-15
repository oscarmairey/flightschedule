// Rule #9 via the admin UI — shorten a flight's duration, verify the
// compensating ADMIN_ADJUSTMENT appears on the pilot's dashboard and the
// balance moves by the right delta.

import { test, expect, loginAs, resetDb } from "./fixtures";

async function getSeededFlightId(
  page: import("@playwright/test").Page,
): Promise<string> {
  await page.goto("/admin/pilots/00000000-0000-4000-a000-000000000002");
  // The Flights section renders "Modifier" links to /admin/flights/{id}/edit.
  // Pick the first one.
  const href = await page
    .getByRole("link", { name: /Modifier/ })
    .first()
    .getAttribute("href");
  const match = href?.match(/\/admin\/flights\/([0-9a-f-]{36})\/edit/);
  if (!match) throw new Error(`No flight edit link found, got ${href}`);
  return match[1];
}

test.describe("Admin — edit a flight (rule #9 via the UI)", () => {
  test.beforeEach(() => resetDb());

  test("pilot cannot reach /admin/flights/:id/edit", async ({ page }) => {
    await loginAs(page, "pilot1");
    await page.goto(
      "/admin/flights/00000000-0000-0000-0000-000000000000/edit",
    );
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("shortening 1h30 → 1h00 refunds 30 min and shows a compensating row", async ({
    page,
    browser,
  }) => {
    await loginAs(page, "admin");
    const flightId = await getSeededFlightId(page);

    await page.goto(`/admin/flights/${flightId}/edit`);
    // Current values from seed: 10:00 → 11:30. Change stop to 11:00.
    await page.fill('input[name="engineStop"]', "11:00");
    await page.fill(
      'input[name="reason"]',
      "Correction bloc ON trop tardif (fat-finger)",
    );
    await Promise.all([
      page.waitForURL(/flightedited=1/, { timeout: 15_000 }),
      page
        .getByRole("button", { name: /Appliquer la correction/ })
        .click(),
    ]);

    // Pilot context — balance up by 30 min (600 → 630 = 10h30).
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await loginAs(p, "pilot1");
    await p.goto("/dashboard");
    await expect(p.locator("body")).toContainText("10h30");
    // The compensating ADMIN_ADJUSTMENT reference surfaces as the label
    // on the pilot's transaction history.
    await expect(p.locator("body")).toContainText(/Correction|Ajustement/i);
    await ctx.close();
  });
});
