// The admin flight-edit server action is fully covered in the
// integration suite. Here we assert that only admins can reach the
// edit page — non-admins get bounced by the proxy.

import { test, expect, loginAs } from "./fixtures";

test.describe("Admin — flight edit access", () => {
  test("pilot cannot reach /admin/flights/:id/edit", async ({ page }) => {
    await loginAs(page, "pilot1");
    await page.goto(
      "/admin/flights/00000000-0000-0000-0000-000000000000/edit",
    );
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
