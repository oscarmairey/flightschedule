import { test, expect, loginAs } from "./fixtures";

test.describe("Admin — pilots", () => {
  test("admin sees seeded pilots in the list", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/pilots");
    await expect(page).toHaveURL(/\/admin\/pilots/);
    await expect(page.locator("body")).toContainText("Pilot One");
    await expect(page.locator("body")).toContainText("Pilot Two");
  });
});
