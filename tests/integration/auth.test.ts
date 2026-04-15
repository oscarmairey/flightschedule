// Authentication — replica of the Credentials provider's authorize()
// path. We don't import @/auth directly because next-auth's transitive
// dependency on `next/server` trips vitest's module resolver in Node
// test mode. Instead, this test exercises the SAME user-lookup +
// bcrypt compare logic that authorize() runs, against the real test
// Postgres. The E2E suite validates the full NextAuth wiring.

import { describe, it, expect } from "vitest";
import { hash, compare } from "bcryptjs";
import { getTestPrisma } from "../setup/db";
import { makeUser, DEFAULT_PASSWORD } from "../setup/factories";

async function authorize(credentials: {
  email?: string;
  password?: string;
}): Promise<{
  id: string;
  email: string;
  name: string;
  role: string;
  mustResetPw: boolean;
} | null> {
  const email = credentials.email?.trim().toLowerCase();
  const password = credentials.password;
  if (!email || !password) return null;
  const prisma = getTestPrisma();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return null;
  const ok = await compare(password, user.passwordHash);
  if (!ok) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustResetPw: user.mustResetPw,
  };
}

describe("Credentials authorize()", () => {
  it("accepts the correct password for an active user", async () => {
    const email = `accept-${Date.now()}@test.local`;
    await makeUser({ email });
    const res = await authorize({ email, password: DEFAULT_PASSWORD });
    expect(res).not.toBeNull();
    expect(res!.email).toBe(email);
    expect(res!.role).toBe("PILOT");
  });

  it("rejects the wrong password", async () => {
    const email = `wrong-${Date.now()}@test.local`;
    await makeUser({ email });
    const res = await authorize({ email, password: "not-the-password" });
    expect(res).toBeNull();
  });

  it("rejects a missing user", async () => {
    const res = await authorize({
      email: `missing-${Date.now()}@test.local`,
      password: "whatever",
    });
    expect(res).toBeNull();
  });

  it("rejects deactivated users", async () => {
    const email = `deactivated-${Date.now()}@test.local`;
    await makeUser({ email, isActive: false });
    const res = await authorize({ email, password: DEFAULT_PASSWORD });
    expect(res).toBeNull();
  });

  it("mustResetPw flows through to the returned user shape", async () => {
    const email = `reset-${Date.now()}@test.local`;
    // Generate a fresh bcrypt hash so we control the password here.
    const passwordHash = await hash("Fresh-Password-1", 4);
    await makeUser({ email, passwordHash, mustResetPw: true });
    const res = await authorize({
      email,
      password: "Fresh-Password-1",
    });
    expect(res).not.toBeNull();
    expect(res!.mustResetPw).toBe(true);
  });
});
