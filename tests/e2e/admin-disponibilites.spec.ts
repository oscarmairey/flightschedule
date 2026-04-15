import { test, expect, loginAs, resetDb } from "./fixtures";

test.describe("Admin — disponibilités (availability) management", () => {
  test.beforeEach(() => resetDb());

  test("admin creates a recurring weekly exception", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/disponibilites");

    // Recurring form — fields have id="rec-*" to disambiguate from the
    // specific-date form (both share `name="startStr"` / `name="endStr"`).
    await page.selectOption("#dayOfWeek", "6"); // Saturday
    await page.fill("#rec-start", "08:00");
    await page.fill("#rec-end", "12:00");
    await page.fill("#rec-reason", "Cours théorique samedi matin");
    await page.getByRole("button", { name: /^Ajouter$/ }).click();

    await expect(page.locator("body")).toContainText(
      "Cours théorique samedi matin",
    );
  });

  test("admin creates a specific-date exception", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/disponibilites");

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    await page.fill("#ov-date", futureDate);
    await page.fill("#ov-start", "08:00");
    await page.fill("#ov-end", "18:00");
    await page.fill("#ov-reason", "Maintenance 100h moteur");
    await page.getByRole("button", { name: /Ajouter une exception/ }).click();

    await expect(page.locator("body")).toContainText("Maintenance 100h moteur");
  });

  test("admin creates an open period covering the next month", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/disponibilites");

    const startDate = new Date().toISOString().slice(0, 10);
    const endDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    await page.fill('input[name="startDate"]', startDate);
    await page.fill('input[name="endDate"]', endDate);
    await page.fill('input[name="reason"]', "Saison printemps 2026");
    await page.getByRole("button", { name: /Ajouter une période/ }).click();

    await expect(page.locator("body")).toContainText("Saison printemps 2026");
  });
});
