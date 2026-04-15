import { test, expect, loginAs } from "./fixtures";

test.describe("Dashboard", () => {
  test("pilot sees their balance rendered as HH:MM", async ({ page }) => {
    await loginAs(page, "pilot1");
    await expect(page).toHaveURL(/\/dashboard/);
    // pilot1 seeded with 600 min = 10h00
    await expect(page.locator("body")).toContainText("10h00");
  });

  test("dashboard is reachable after navigation away and back", async ({
    page,
  }) => {
    await loginAs(page, "pilot1");
    await page.goto("/flights");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
