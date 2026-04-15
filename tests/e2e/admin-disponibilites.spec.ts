import { test, expect, loginAs } from "./fixtures";

test.describe("Admin — disponibilités", () => {
  test("loads the merged calendar + indisponibilités page", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/disponibilites");
    await expect(page).toHaveURL(/\/admin\/disponibilites/);
  });
});
