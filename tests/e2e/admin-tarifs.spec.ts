import { test, expect, loginAs, resetDb } from "./fixtures";

test.describe("Admin — tarifs (packages)", () => {
  test.beforeEach(() => resetDb());

  test("admin sees the seeded packages", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/tarifs");
    await expect(page.locator("body")).toContainText("Pack Découverte 3h");
    await expect(page.locator("body")).toContainText("Pack Initiation 5h");
    await expect(page.locator("body")).toContainText("Pack Avancé 10h");
  });

  test("pilot dashboard shows the same packages", async ({ page }) => {
    await loginAs(page, "pilot1");
    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText("Pack Découverte 3h");
    await expect(page.locator("body")).toContainText("Pack Avancé 10h");
    // 120000 HT + 20% = 144000 ct = 1440 € TTC → "1 440" with FR NBSP
    await expect(page.locator("body")).toContainText(/1.?440/);
  });

  test("admin updates the bank account", async ({ page }) => {
    await loginAs(page, "admin");
    // /admin/tarifs has two tabs. The bank form is under ?section=banque.
    await page.goto("/admin/tarifs?section=banque");

    await page.fill("#bank-holderName", "Aéroclub Renouvelé");
    await page.fill("#bank-iban", "FR7612345678901234567890123");
    await page.fill("#bank-bic", "BNPAFRPPXXX");
    await page.fill("#bank-bankName", "BNP Paribas");
    await page
      .getByRole("button", { name: /Enregistrer|Mettre à jour/ })
      .click();

    // The server action redirects with ?bank=1 on success, which is what
    // makes the page re-render under the banque tab with the updated
    // values.
    await page.waitForURL(/bank=1|section=banque/, { timeout: 15_000 });
    await expect(page.locator("#bank-holderName")).toHaveValue(
      "Aéroclub Renouvelé",
    );
  });
});
