// FlightSchedule — Vitest base configuration.
//
// Two project configs, selectable via --project=unit or --project=integration:
//   - tests/vitest.unit.config.ts
//   - tests/vitest.integration.config.ts
//
// The Vitest workspace file (vitest.workspace.ts) registers both. Running
// `vitest run` alone executes both suites.

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/lib/**/*.ts",
        "src/app/**/actions.ts",
        "src/app/api/**/route.ts",
      ],
      exclude: [
        "src/generated/**",
        "src/lib/email.ts",
        "src/lib/stripe-client.ts",
      ],
    },
  },
});
