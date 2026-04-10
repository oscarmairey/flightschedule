// FlightSchedule — Auth.js v5 full configuration (Node runtime)
//
// This file uses the Prisma client and bcryptjs, both of which need Node.js
// APIs. It must NOT be imported from `proxy.ts` (which runs on the edge
// runtime). Edge code uses `@/auth.config` instead.

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// `unstable_update` is the Auth.js v5 way to refresh the JWT/session payload
// from a server action without forcing a sign-out + sign-in. We use it on
// /setup-password so the next request lands on /dashboard instead of being
// bounced back by the proxy's mustResetPw redirect.
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      authorize: async (credentials, request) => {
        const email = (credentials?.email as string | undefined)
          ?.trim()
          .toLowerCase();
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        // Rate limit by email — 10 attempts per 15 minutes.
        const emailRl = rateLimit(`login:${email}`, {
          limit: 10,
          windowMs: 15 * 60_000,
        });
        if (!emailRl.ok) return null;

        // Rate limit by IP — 30 attempts per minute. Generous because
        // pilots at the airfield may share a single Wi-Fi IP.
        const ip = request ? getClientIp(request as Request) : "unknown";
        const ipRl = rateLimit(`login:ip:${ip}`, {
          limit: 30,
          windowMs: 60_000,
        });
        if (!ipRl.ok) return null;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.isActive) return null;

        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;

        // Update last login (fire-and-forget — don't block sign-in if it fails)
        prisma.user
          .update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          })
          .catch(() => {
            // swallow — login should succeed even if we can't write the timestamp
          });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          mustResetPw: user.mustResetPw,
        };
      },
    }),
  ],
});
