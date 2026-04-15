import { test, expect, loginAs, resetDb } from "./fixtures";

test.describe("Admin — virements (bank transfers)", () => {
  test.beforeEach(() => resetDb());

  test("admin sees the pending transfer", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/virements");
    await expect(page.locator("body")).toContainText("FS-TEST01");
    await expect(page.locator("body")).toContainText("Pilot One");
    await expect(page.locator("body")).toContainText("Pack Initiation 5h");
  });

  test("admin validates — pilot balance credits by the package minutes", async ({
    page,
    browser,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/virements");

    await Promise.all([
      page.waitForURL(/\/admin\/virements/, { timeout: 15_000 }),
      page.getByRole("button", { name: /Valider et créditer/ }).click(),
    ]);

    // Pilot1 started with 600 min = 10h00. After a 300-min credit: 900 min = 15h00.
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await loginAs(p, "pilot1");
    await p.goto("/dashboard");
    await expect(p.locator("body")).toContainText("15h00");
    await ctx.close();
  });

  test("admin rejects with a note — pilot still at original balance", async ({
    page,
    browser,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/virements");

    await page.fill('input[name="rejectionNote"]', "Aucun virement reçu");
    await Promise.all([
      page.waitForURL(/\/admin\/virements/, { timeout: 15_000 }),
      page.getByRole("button", { name: /^Refuser$/ }).click(),
    ]);

    // Pilot balance unchanged
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await loginAs(p, "pilot1");
    await p.goto("/dashboard");
    await expect(p.locator("body")).toContainText("10h00");
    // Rejection note surfaces on the pilot's history
    await expect(p.locator("body")).toContainText(/Aucun virement reçu/);
    await ctx.close();
  });
});
