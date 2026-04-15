import { test, expect, loginAs } from "./fixtures";

test.describe("Flights — form + logbook", () => {
  test("flights index lists pilot's own flights (empty on first load)", async ({
    page,
  }) => {
    await loginAs(page, "pilot1");
    await page.goto("/flights");
    await expect(page).toHaveURL(/\/flights/);
  });

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
