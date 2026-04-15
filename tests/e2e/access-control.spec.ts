// Proxy + role-based routing. Covers the coarse filter in src/proxy.ts
// with the edge-safe matcher. Defense-in-depth server-side checks run
// in the integration tests; here we assert the UX redirect.

import { test, expect, loginAs } from "./fixtures";

test.describe("Access control", () => {
  test("anonymous user is redirected from /dashboard to /login", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("anonymous user is redirected from /admin to /login", async ({
    page,
  }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("pilot is redirected from /admin/* to /dashboard", async ({ page }) => {
    await loginAs(page, "pilot1");
    await page.waitForURL(/\/dashboard/);
    await page.goto("/admin/pilots");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("/api/upload/presign returns 401 without a session", async ({
    request,
  }) => {
    const res = await request.post("/api/upload/presign", {
      data: { contentType: "image/jpeg", contentLength: 1024 },
    });
    expect(res.status()).toBe(401);
  });
});
