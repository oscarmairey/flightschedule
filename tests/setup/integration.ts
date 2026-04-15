// FlightSchedule — Vitest integration-project setup.
//
// Loads the test environment, ensures migrations are applied once per
// process, truncates the DB before every test, and disconnects the
// Prisma client after the last file.

import "./env";
import { beforeAll, afterAll, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { getTestPrisma, resetDb, disconnectTestPrisma } from "./db";
import { resetR2Mock } from "./mocks";

// next/cache's revalidatePath/revalidateTag require an active Next
// request context; in server-action integration tests we're outside it.
// No-op them so the action can complete normally.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));

// R2 mock must be hoisted — vi.mock is only hoisted when the call site
// is lexically at the top of the module. Importing a helper that calls
// `vi.mock` internally skips hoisting.
vi.mock("@/lib/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/r2")>();
  const { getR2MockState } = await import("./mocks");
  const state = getR2MockState();
  return {
    ...actual,
    presignPutUrl: (key: string, ct: string, cl: number) =>
      state.presignPutUrlImpl(key, ct, cl),
    presignGetUrl: (key: string) => state.presignGetUrlImpl(key),
    headObject: (key: string) => state.headObjectImpl(key),
  };
});

// One-shot migration application (uses prisma migrate deploy so we run
// committed migrations, not the dev-mode generator).
let migrated = false;
function ensureMigrated(): void {
  if (migrated) return;
  try {
    execSync("pnpm exec prisma migrate deploy", {
      stdio: "pipe",
      env: { ...process.env },
    });
    migrated = true;
  } catch (err) {
    const message =
      err instanceof Error && "stderr" in err
        ? ((err as { stderr?: Buffer }).stderr?.toString() ?? err.message)
        : String(err);
    throw new Error(`Failed to apply migrations to test DB: ${message}`);
  }
}

beforeAll(async () => {
  ensureMigrated();
  // Warm the client so the first test doesn't pay the connection cost.
  await getTestPrisma().$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
  resetR2Mock();
});

afterAll(async () => {
  await disconnectTestPrisma();
});
