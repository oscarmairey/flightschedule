import { test, expect, loginAs } from "./fixtures";

test.describe("Calendar", () => {
  test("calendar page loads for an authenticated pilot", async ({ page }) => {
    await loginAs(page, "pilot1");
    await page.goto("/calendar");
    await expect(page).toHaveURL(/\/calendar/);
    // Calendar should expose week-navigation controls — assert the
    // heading is present rather than pinning to any specific week text.
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });
});
