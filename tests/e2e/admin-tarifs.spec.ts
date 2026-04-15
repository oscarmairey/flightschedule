import { test, expect, loginAs } from "./fixtures";

test.describe("Admin — tarifs (packages)", () => {
  test("loads the package CRUD page", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/tarifs");
    await expect(page).toHaveURL(/\/admin\/tarifs/);
  });
});
