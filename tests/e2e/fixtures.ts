// FlightSchedule — shared Playwright fixtures.

import { test as base, expect, type Page } from "@playwright/test";
import { FIXTURE } from "./global-setup";

export async function loginAs(
  page: Page,
  role: "admin" | "pilot1" | "pilot2",
): Promise<void> {
  const email =
    role === "admin"
      ? FIXTURE.adminEmail
      : role === "pilot1"
        ? FIXTURE.pilot1Email
        : FIXTURE.pilot2Email;
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', FIXTURE.pilot1Password);
  // Wait for the auth round-trip AND the subsequent redirect to land on
  // a post-login page (anything NOT /login). Without this, a fast spec
  // calls page.goto(next) before the session cookie arrives and gets
  // bounced back to /login.
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 15_000,
    }),
    page.click('button[type="submit"]'),
  ]);
}

export const test = base;
export { expect, FIXTURE };
