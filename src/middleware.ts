// CAVOK route protection middleware
//
// Two layers of access control:
//   1. /admin/*       → requires session AND role === ADMIN
//   2. /dashboard, /flights, /calendar, /account → requires session
//
// The /api/auth/* endpoints, /login, and static assets are always public.
//
// Defense-in-depth: pages and route handlers MUST also re-check session
// server-side. This middleware is a coarse filter, not the security
// boundary on its own.

import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = new Set<string>(["/login", "/setup-password"]);

const PILOT_PROTECTED_PREFIXES = [
  "/dashboard",
  "/flights",
  "/calendar",
  "/account",
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
  // Skip middleware for static assets, _next internals, and auth endpoints.
  // Auth.js needs to handle its own routes without middleware interference.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
