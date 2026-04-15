// Proxy + role-based routing. Covers the coarse filter in src/proxy.ts
// with the edge-safe matcher. Defense-in-depth server-side checks run
// in the integration tests; here we assert the UX redirect.

import { test, expect, loginAs, resetDb } from "./fixtures";

test.describe("Access control", () => {
  test.beforeEach(() => resetDb());

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

  test("logout (via NextAuth signout) clears the session", async ({ page }) => {
    await loginAs(page, "pilot1");
    await page.waitForURL(/\/dashboard/);

    // Post to /api/auth/signout with CSRF token — NextAuth v5 beta accepts
    // a GET at that URL as well, but the cleanest from Playwright is to
    // wipe the cookies.
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
