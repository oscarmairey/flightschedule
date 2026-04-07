// CAVOK — edge-safe Auth.js config
//
// This file is imported by `proxy.ts` (formerly `middleware.ts`) which runs
// on the edge runtime. The edge runtime does NOT support Node.js APIs like
// `node:path` or `node:fs`, so this file MUST NOT transitively import:
//   - `@/lib/db` (Prisma client uses pg adapter → node:path)
//   - bcryptjs
//   - any provider whose `authorize()` touches the database
//
// The full config (with the Credentials provider that calls Prisma) lives in
// `auth.ts`, which runs in the Node.js runtime.

import type { NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { Role } from "@/generated/prisma/enums";

// Type augmentations live here so both auth.ts and proxy.ts pick them up.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      mustResetPw: boolean;
    } & {
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    role: Role;
    mustResetPw: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    mustResetPw: boolean;
  }
}

export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  // Trust the Host header. We're behind Caddy + Cloudflare on the
  // production VPS — both terminate TLS and forward the canonical
  // hostname. Without this, Auth.js v5 in production mode rejects any
  // request whose Host doesn't match NEXTAUTH_URL with `UntrustedHost`.
  // The proxy chain is the security boundary, not the Host header.
  trustHost: true,
  // Providers added in auth.ts (Node runtime).
  providers: [],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: Role }).role;
        token.mustResetPw = (user as { mustResetPw: boolean }).mustResetPw;
      }
      if (
        trigger === "update" &&
        session &&
        typeof (session as { mustResetPw?: unknown }).mustResetPw === "boolean"
      ) {
        token.mustResetPw = (session as { mustResetPw: boolean }).mustResetPw;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.mustResetPw = token.mustResetPw;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
