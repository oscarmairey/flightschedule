import { test, expect, loginAs, resetDb } from "./fixtures";

test.describe("Dashboard — pilot view", () => {
  test.beforeEach(() => resetDb());

  test("balance renders as HH:MM from the seed (10h00)", async ({ page }) => {
    await loginAs(page, "pilot1");
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText("10h00");
  });

  test("packages + prices render with VAT-inclusive amounts", async ({
    page,
  }) => {
    await loginAs(page, "pilot1");
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText("Pack Découverte 3h");
    await expect(page.locator("body")).toContainText("Pack Initiation 5h");
    await expect(page.locator("body")).toContainText("Pack Avancé 10h");
    // 120000 ct HT × 1.20 = 144000 ct = 1440 € TTC
    await expect(page.locator("body")).toContainText(/1.?440/);
  });

  test("dashboard is reachable after navigation away and back", async ({
    page,
  }) => {
    await loginAs(page, "pilot1");
    await page.goto("/flights");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("transaction history lists the seeded FLIGHT_DEBIT", async ({
    page,
  }) => {
    await loginAs(page, "pilot1");
    await page.goto("/dashboard");
    // Seeded FLIGHT_DEBIT is -90 min → displays as "-1h30"
    await expect(page.locator("body")).toContainText("-1h30");
  });
});
