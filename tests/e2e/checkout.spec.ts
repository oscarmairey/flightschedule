// Stripe Checkout is exercised fully in the integration webhook tests.
// Here we only assert the /checkout/{success,cancel} pages render when
// a pilot is signed in — actual payment flow requires a live Stripe
// account and is out of scope for the pinned-to-local test run.

import { test, expect, loginAs } from "./fixtures";

test.describe("Checkout landing pages", () => {
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
