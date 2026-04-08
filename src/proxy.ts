// FlightSchedule route protection — Next.js 16 `proxy.ts` convention
// (formerly known as `middleware.ts`).
//
// Runs on the EDGE runtime: must NOT import the Prisma client or anything
// that pulls in Node.js APIs (`node:path`, `node:fs`, etc). That's why this
// file uses `@/auth.config` (edge-safe) and instantiates a local NextAuth
// here, rather than importing the full `@/auth` (which uses Prisma).
//
// Two layers of access control:
//   1. /admin/*       → requires session AND role === ADMIN
//   2. /dashboard, /flights, /calendar, /checkout → requires session
//
// Defense-in-depth: pages and route handlers MUST also re-check session
// server-side. This proxy is a coarse filter, not the security boundary
// on its own.

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = new Set<string>(["/login", "/setup-password"]);

const PILOT_PROTECTED_PREFIXES = [
  "/dashboard",
  "/flights",
  "/calendar",
  "/checkout",
];

const ADMIN_PROTECTED_PREFIXES = ["/admin"];

export default auth((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;
  const session = req.auth;

  const isAdminPath = ADMIN_PROTECTED_PREFIXES.some((p) => path.startsWith(p));
  const isPilotPath = PILOT_PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  // Always allow public paths
  if (PUBLIC_PATHS.has(path)) {
    return NextResponse.next();
  }

  // Unauthenticated user trying to access a protected page → /login
  if ((isAdminPath || isPilotPath) && !session?.user) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(loginUrl);
  }

  // Pilot trying to access /admin/* → /dashboard
  if (isAdminPath && session?.user?.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  // User who must reset password → force them to /setup-password
  // (except when they're already on it or signing out)
  if (
    session?.user?.mustResetPw &&
    path !== "/setup-password" &&
    !path.startsWith("/api/auth")
  ) {
    return NextResponse.redirect(new URL("/setup-password", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Skip proxy for static assets, _next internals, auth endpoints,
  // and webhook endpoints (Stripe must reach the route handler raw —
  // a 302 here breaks signature verification).
  matcher: [
    "/((?!api/auth|api/webhooks|_next/static|_next/image|favicon.ico|.*\\.).*)",
  ],
};
