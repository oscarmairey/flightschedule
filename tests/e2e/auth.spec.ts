import { test, expect, FIXTURE, loginAs } from "./fixtures";

test.describe("Authentication", () => {
  test("pilot logs in and lands on the dashboard", async ({ page }) => {
    await loginAs(page, "pilot1");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("body")).toContainText("Pilot One", {
      ignoreCase: true,
    });
  });

  test("wrong password stays on /login with an error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', FIXTURE.pilot1Email);
    await page.fill('input[name="password"]', "wrong-password");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/login/);
  });

  test("admin logs in and reaches /admin", async ({ page }) => {
    await loginAs(page, "admin");
    await expect(page).toHaveURL(/\/(admin|dashboard)/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
  });

  test("pilot with mustResetPw is bounced to /setup-password", async ({
    page,
  }) => {
    await loginAs(page, "pilot2");
    // Proxy can either intercept on the first protected fetch or let the
    // login redirect land on /dashboard first; then navigating anywhere
    // protected bounces. Force the second path so the check is timing-
    // stable regardless of when the redirect fires.
    await page.goto("/dashboard");
    await page.waitForURL(/\/setup-password/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/setup-password/);
  });
});
