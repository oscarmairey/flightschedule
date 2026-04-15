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
import { rateLimitPeek, rateLimitHit, getClientIp } from "@/lib/rate-limit";

// Login-specific limits. Only FAILED attempts count against the bucket,
// so a pilot can happily keep signing in as often as they need — and
// the limiter still blocks credential stuffing after 10 bad passwords
// per email / 30 per IP.
const EMAIL_FAIL_LIMIT = 10;
const EMAIL_WINDOW_MS = 15 * 60_000;
const IP_FAIL_LIMIT = 30;
const IP_WINDOW_MS = 60_000;

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

        const emailKey = `login:${email}`;
        const ip = request ? getClientIp(request as Request) : "unknown";
        const ipKey = `login:ip:${ip}`;

        // PEEK ONLY — consulting the buckets without consuming. If the
        // caller is already over budget (10 bad passwords in 15 min for
        // this email, or 30 in 60s for this IP), reject before touching
        // the DB or running bcrypt. Successful logins NEVER consume a
        // token, so a pilot retyping their correct password 50× never
        // locks themselves out.
        if (!rateLimitPeek(emailKey, EMAIL_FAIL_LIMIT)) return null;
        if (!rateLimitPeek(ipKey, IP_FAIL_LIMIT)) return null;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.isActive) {
          // Unknown email / deactivated user → still a failure from the
          // credential-stuffer's perspective. Count it.
          rateLimitHit(emailKey, { windowMs: EMAIL_WINDOW_MS });
          rateLimitHit(ipKey, { windowMs: IP_WINDOW_MS });
          return null;
        }

        const ok = await compare(password, user.passwordHash);
        if (!ok) {
          rateLimitHit(emailKey, { windowMs: EMAIL_WINDOW_MS });
          rateLimitHit(ipKey, { windowMs: IP_WINDOW_MS });
          return null;
        }

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
