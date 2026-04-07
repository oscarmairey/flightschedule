// CAVOK Glass Cockpit — Prisma seed script
//
// Idempotent: safe to run multiple times. Uses upsert so re-running won't
// duplicate the bootstrap admin.
//
// Run with: pnpm db:seed
//
// What it does:
//   1. Creates (or updates) the bootstrap admin from .env credentials
//   2. The admin starts with mustResetPw = false because the bootstrap
//      password was set by the operator, not auto-generated.
//
// What it does NOT do:
//   - Seed pilots — those are created via the admin UI
//   - Seed availability blocks — admin configures via /admin/availability
//   - Seed reservations / flights / transactions — happens organically
//
// IMPORTANT: passwords here go directly into User.passwordHash via bcrypt.
//            Never log raw passwords. Never commit real passwords to .env.example.

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL must be set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function seed() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const name = process.env.ADMIN_BOOTSTRAP_NAME;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!email || !name || !password) {
    throw new Error(
      "ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_NAME and ADMIN_BOOTSTRAP_PASSWORD must all be set in .env",
    );
  }

  const passwordHash = await hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
    create: {
      email,
      name,
      passwordHash,
      role: "ADMIN",
      isActive: true,
      mustResetPw: false,
      hdvBalanceMin: 0,
    },
  });

  console.log(`Bootstrap admin upserted: ${admin.email} (id=${admin.id})`);
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
