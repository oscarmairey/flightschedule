// FlightSchedule — Playwright configuration.
//
// Runs comprehensive E2E against a production build booted on port 3100
// against the isolated test Postgres (docker-compose.test.yml). The dev
// server is NOT used — we test the same `next build && next start` bundle
// we ship.
//
// Desktop + mobile projects run every spec twice so the mobile-first
// contract (CLAUDE.md — touch targets ≥ 44 px, numeric keyboards) is
// enforced in CI. Local runs can filter with `playwright test --project=chromium`.

import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

// Load .env.test so webServer + globalSetup share the same DATABASE_URL
// and NEXTAUTH_* config as the Vitest integration project.
const envFile = path.resolve(__dirname, ".env.test");
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile });
}

// Port 3100 is owned by oscarmairey.com on this VPS (see CLAUDE.md).
// Use a higher, unused range so the Playwright-managed `next start` can
// own the port uncontested.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 6100);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // iPhone 14 via Playwright uses WebKit, which requires system libs
      // that need sudo to install on this VPS. Pixel 5 uses Chromium
      // with mobile viewport + touch emulation — covers the same
      // mobile-first Tailwind breakpoint story without the sudo hurdle.
      name: "mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
  globalSetup: require.resolve("./tests/e2e/global-setup.ts"),
  webServer: {
    // Integration DB has already been migrated by `pnpm test:db:reset`
    // before Playwright is invoked (see scripts). `next start` reads
    // .env.test via the script's env loader.
    command: `pnpm exec next start -p ${PORT}`,
    url: BASE_URL,
    // Never reuse — other ports on this VPS host unrelated production
    // apps. A false positive health check would point Playwright at
    // the wrong DB.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      ...Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => typeof v === "string"),
      ),
    },
  },
});
