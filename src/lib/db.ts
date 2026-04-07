// FlySchedule — singleton Prisma client.
//
// Prisma 7 requires a driver adapter or accelerateUrl. We use
// @prisma/adapter-pg with the DATABASE_URL connection string.
//
// LAZY CONSTRUCTION:
//   The client is wrapped in a Proxy that defers `new PrismaClient(...)`
//   until the first property access. This is load-bearing for the
//   Next.js production build: the build's "collect page data" phase
//   imports every route file (including /api/webhooks/stripe), which
//   transitively imports this module. If we constructed the client at
//   module load, the build would fail with "DATABASE_URL is not set"
//   because env vars belong to the runtime container, not the builder.
//
// SINGLETON:
//   In dev (and during HMR-like reloads), the same JS process can
//   re-evaluate this file repeatedly. Stash the constructed client on
//   globalThis so we don't leak connections. In production this is a
//   no-op since each Node process imports the file exactly once.

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Module-level singleton. In a long-lived Node process this is set
// exactly once and reused for every subsequent property access on the
// exported Proxy. The globalThis cache is a separate HMR-survival
// guard for dev mode (where the file gets re-evaluated on hot reload).
let moduleClient: PrismaClient | null = null;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function makeClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

function getOrCreateClient(): PrismaClient {
  // Fast path: same process, already constructed.
  if (moduleClient) return moduleClient;
  // HMR path (dev): a previous module evaluation left a client on
  // globalThis. Adopt it instead of constructing a new one (which
  // would leak connections on every save).
  if (globalForPrisma.prisma) {
    moduleClient = globalForPrisma.prisma;
    return moduleClient;
  }
  // First call in this process: construct, cache module-level AND
  // (only in dev) on globalThis for HMR survival.
  moduleClient = makeClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = moduleClient;
  }
  return moduleClient;
}

// Lazy proxy: importing `prisma` does NOT construct the client. The
// real client is created on the first property access (e.g.
// `prisma.user.findMany()`). This keeps `next build` happy without
// needing DATABASE_URL at build time.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getOrCreateClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
