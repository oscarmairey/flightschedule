// FlightSchedule — Vitest workspace.
//
// Registers the two projects (unit and integration) so
// `vitest run` alone executes both, and `--project=<name>` filters.

import { defineWorkspace } from "vitest/config";
import path from "node:path";

const alias = { "@": path.resolve(__dirname, "src") };

export default defineWorkspace([
  {
    test: {
      name: "unit",
      environment: "node",
      include: ["tests/unit/**/*.test.ts"],
      setupFiles: ["tests/setup/unit.ts"],
    },
    resolve: { alias },
  },
  {
    test: {
      name: "integration",
      environment: "node",
      include: ["tests/integration/**/*.test.ts"],
      setupFiles: ["tests/setup/integration.ts"],
      fileParallelism: false,
      pool: "forks",
      poolOptions: {
        forks: {
          singleFork: true,
          isolate: false,
        },
      },
      hookTimeout: 30_000,
      testTimeout: 30_000,
    },
    resolve: { alias },
  },
]);
