// FlightSchedule — server-side session helpers.
//
// Defense-in-depth on top of `proxy.ts`. The proxy is a coarse filter
// that blocks unauthenticated/wrong-role requests, but EVERY page and
// route handler must also re-check the session server-side, because:
//
//   1. The proxy could be misconfigured (matcher gap, exclusion bug).
//   2. Server actions don't run through the proxy.
//   3. New routes added later might forget to update the proxy.
//
// Rule of thumb: the first line of any protected page or action is
// `const session = await requireSession()` (or `requireAdmin()`).
// Never trust `auth()` returning falsy without redirecting.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Role } from "@/generated/prisma/enums";

export type AppSession = {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    mustResetPw: boolean;
    /** ISO string, or null if the pilot still needs /welcome. */
    onboardingCompletedAt: string | null;
  };
};

/**
 * Returns the current session or redirects to /login.
 *
 * Also enforces the mustResetPw redirect — if the user has a temp
 * password, this kicks them to /setup-password. The proxy already does
 * this, but pages can be reached via server actions that bypass the
 * proxy, so we re-check here.
 */
export async function requireSession(): Promise<AppSession> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (session.user.mustResetPw) {
    redirect("/setup-password");
  }
  return {
    user: {
      id: session.user.id,
      name: session.user.name ?? "",
      email: session.user.email ?? "",
      role: session.user.role,
      mustResetPw: session.user.mustResetPw,
      onboardingCompletedAt: session.user.onboardingCompletedAt,
    },
  };
}

/**
 * Like requireSession but additionally enforces ADMIN role. Pilots get
 * redirected to /dashboard. Use in any /admin/* page or any action that
 * mutates data on behalf of another user.
 */
export async function requireAdmin(): Promise<AppSession> {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  return session;
}

/**
 * Soft variant for pages that conditionally render based on auth state
 * (e.g., the / redirect page). Returns null instead of redirecting.
 */
export async function getOptionalSession(): Promise<AppSession | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    user: {
      id: session.user.id,
      name: session.user.name ?? "",
      email: session.user.email ?? "",
      role: session.user.role,
      mustResetPw: session.user.mustResetPw,
      onboardingCompletedAt: session.user.onboardingCompletedAt,
    },
  };
}
