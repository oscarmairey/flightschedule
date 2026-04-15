// Stripe Checkout is exercised fully in the integration webhook tests.
// Here we only assert the /checkout/{success,cancel} landing pages
// render when a pilot is signed in — actual payment flow requires a
// live Stripe account.

import { test, expect, loginAs, resetDb } from "./fixtures";

test.describe("Checkout landing pages", () => {
  test.beforeEach(() => resetDb());

  test("success page renders for a signed-in pilot", async ({ page }) => {
    await loginAs(page, "pilot1");
    await page.goto("/checkout/success");
    await expect(page).toHaveURL(/\/checkout\/success/);
  });

  test("cancel page renders for a signed-in pilot", async ({ page }) => {
    await loginAs(page, "pilot1");
    await page.goto("/checkout/cancel");
    await expect(page).toHaveURL(/\/checkout\/cancel/);
  });
});
