// FlightSchedule — shared Playwright fixtures.

import { test as base, expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import path from "node:path";
import { FIXTURE } from "./global-setup";

const ROOT = path.resolve(__dirname, "../..");

export async function loginAs(
  page: Page,
  role: "admin" | "pilot1" | "pilot2" | { email: string; password: string },
): Promise<void> {
  let email: string;
  let password: string = FIXTURE.pilot1Password;
  if (typeof role === "string") {
    email =
      role === "admin"
        ? FIXTURE.adminEmail
        : role === "pilot1"
          ? FIXTURE.pilot1Email
          : FIXTURE.pilot2Email;
  } else {
    email = role.email;
    password = role.password;
  }
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
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

/**
 * Truncate + reseed the test DB between specs. Runs the same tsx script
 * Playwright's globalSetup uses, synchronously — takes ~500 ms.
 * Call from `test.beforeEach` in any spec that mutates DB state so
 * tests within (and across) files can't pollute each other.
 */
export function resetDb(): void {
  execSync("pnpm exec tsx tests/e2e/seed-fixtures.ts", {
    cwd: ROOT,
    stdio: "pipe",
    env: process.env,
  });
}

export const test = base;
export { expect, FIXTURE };
