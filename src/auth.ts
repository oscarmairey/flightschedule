// CAVOK Glass Cockpit — Auth.js v5 configuration
//
// Closed user group: only the admin can create accounts. No registration
// endpoint exists. New pilots get a temp password from the admin and reset
// it on first login (User.mustResetPw flag).
//
// Strategy: JWT sessions (no database session table). The User table is
// queried at sign-in time and the relevant fields are baked into the JWT
// for the lifetime of the session.

import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";

// Augment the session type so `session.user.role` and friends are typed.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      mustResetPw: boolean;
    } & DefaultSession["user"];
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

const config: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      authorize: async (credentials) => {
        const email = (credentials?.email as string | undefined)
          ?.trim()
          .toLowerCase();
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

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
  callbacks: {
    async jwt({ token, user, trigger, session }): Promise<JWT> {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: Role }).role;
        token.mustResetPw = (user as { mustResetPw: boolean }).mustResetPw;
      }
      // When the client calls update(), refresh the mustResetPw flag from the
      // payload (used right after the first-login password reset).
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
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
