// FlightSchedule — test environment loader + safety guard.
//
// Loads .env.test and then REFUSES to continue if DATABASE_URL doesn't
// point at the isolated sandbox (port 5443, db name `cavok_test`). This
// is load-bearing: the integration tests truncate the entire database in
// beforeEach, and mispointing them at dev or prod would erase real data.

import { config as loadEnv } from "dotenv";
import path from "node:path";
import fs from "node:fs";

const ENV_FILE = path.resolve(process.cwd(), ".env.test");
if (fs.existsSync(ENV_FILE)) {
  loadEnv({ path: ENV_FILE, override: true });
}

const url = process.env.DATABASE_URL ?? "";

if (!url) {
  throw new Error(
    "tests/setup/env.ts: DATABASE_URL is not set. Did you copy .env.test.example to .env.test?",
  );
}

const SAFE_PATTERN = /:5443\/cavok_test(\?|$)/;
if (!SAFE_PATTERN.test(url)) {
  throw new Error(
    `tests/setup/env.ts: refusing to run — DATABASE_URL "${url}" does not match the expected sandbox pattern ":5443/cavok_test". Truncation between tests would destroy data in a non-test database.`,
  );
}

export const TEST_DATABASE_URL = url;
