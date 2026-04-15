import { test, expect, FIXTURE, loginAs, resetDb } from "./fixtures";

test.describe("Authentication", () => {
  test.beforeEach(() => resetDb());

  test("pilot logs in and lands on the dashboard", async ({ page }) => {
    await loginAs(page, "pilot1");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("body")).toContainText("Pilot One");
  });

  test("wrong password stays on /login with an error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', FIXTURE.pilot1Email);
    await page.fill('input[name="password"]', "wrong-password");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(/invalide|erron|incorrect/i);
  });

  test("admin logs in and reaches /admin", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
  });

  test("pilot with mustResetPw is bounced to /setup-password", async ({ page }) => {
    await loginAs(page, "pilot2");
    // Try navigating to a protected page; proxy should bounce us to
    // /setup-password. Use toHaveURL with retry since loginAs may have
    // already landed us there.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/setup-password/);
  });

  test("completing /setup-password clears the flag and unlocks /dashboard", async ({
    page,
    browser,
  }) => {
    await loginAs(page, "pilot2");
    // After signin, the URL bar may read "/dashboard" while the page
    // RSC-renders /setup-password (proxy bounce without a full
    // navigation in Next 16). An explicit goto() forces a proper
    // navigation so the URL bar lands at /setup-password.
    await page.goto("/setup-password");
    await expect(page).toHaveURL(/\/setup-password/);

    const newPw = "Fresh-Password-9";
    await page.fill('input[name="newPassword"]', newPw);
    await page.fill('input[name="confirmPassword"]', newPw);
    await page.getByRole("button", { name: /Définir le mot de passe/ }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/dashboard/);

    // The new password must be the one that authenticates pilot2 going
    // forward. Use a fresh browser context to avoid cookie carry-over.
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await loginAs(p, { email: FIXTURE.pilot2Email, password: newPw });
    await expect(p).toHaveURL(/\/dashboard/);
    await ctx.close();
  });

  test("mismatched confirmation re-renders /setup-password with an error", async ({
    page,
  }) => {
    await loginAs(page, "pilot2");
    await page.goto("/setup-password");
    await expect(page).toHaveURL(/\/setup-password/);
    await page.fill('input[name="newPassword"]', "Fresh-Password-9");
    await page.fill('input[name="confirmPassword"]', "Fresh-Password-X");
    await page.getByRole("button", { name: /Définir le mot de passe/ }).click();
    await page.waitForURL(/setup-password.*mismatch/, { timeout: 15_000 });
    await expect(page).toHaveURL(/setup-password.*mismatch/);
  });
});
