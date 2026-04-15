// FlightSchedule — Playwright global setup.
//
// Applies migrations to the test DB, wipes all tables, and seeds a known
// admin + two pilots so specs can log in deterministically. The actual
// seed runs via `tsx` in a child process to sidestep Playwright's CJS TS
// loader which can't evaluate the ESM-only Prisma client in-band.

import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

const ROOT = path.resolve(__dirname, "../..");
const ENV_FILE = path.resolve(ROOT, ".env.test");

export default async function globalSetup(): Promise<void> {
  if (fs.existsSync(ENV_FILE)) {
    dotenv.config({ path: ENV_FILE, override: true });
  }

  const url = process.env.DATABASE_URL ?? "";
  if (!/:5443\/cavok_test(\?|$)/.test(url)) {
    throw new Error(
      `Playwright global-setup: DATABASE_URL "${url}" does not look like the sandbox.`,
    );
  }

  // 1. Apply migrations (idempotent).
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "inherit",
    cwd: ROOT,
    env: process.env,
  });

  // 2. Truncate + seed known fixtures via tsx child process.
  execSync("pnpm exec tsx tests/e2e/seed-fixtures.ts", {
    stdio: "inherit",
    cwd: ROOT,
    env: process.env,
  });
}

export const FIXTURE = {
  adminEmail: "admin@test.local",
  adminPassword: "Pilot-Test-1234",
  pilot1Email: "pilot1@test.local",
  pilot1Password: "Pilot-Test-1234",
  pilot2Email: "pilot2@test.local",
  pilot2Password: "Pilot-Test-1234",
} as const;
