import { test, expect, loginAs } from "./fixtures";

test.describe("Admin — virements (bank transfers)", () => {
  test("loads the bank-transfer review queue", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/virements");
    await expect(page).toHaveURL(/\/admin\/virements/);
  });
});
