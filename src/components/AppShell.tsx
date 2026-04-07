// CAVOK — application shell.
//
// Renders the top bar (desktop nav + sign-out) and a sticky bottom nav
// for mobile. The shell is a server component that calls `auth()` once
// and conditionally adds admin items based on role.
//
// Usage: wrap any authenticated page's content with <AppShell>{children}</AppShell>.
// The login and setup-password pages do NOT use the shell — they're
// pre-authentication.

import Link from "next/link";
import { auth, signOut } from "@/auth";
import { COPY } from "@/lib/copy";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
};

const PILOT_ITEMS: NavItem[] = [
  { href: "/dashboard", label: COPY.nav.dashboard },
  { href: "/calendar", label: COPY.nav.calendar },
  { href: "/flights/new", label: COPY.nav.newFlight },
  { href: "/flights", label: COPY.nav.myFlights },
  { href: "/account", label: COPY.nav.account },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/admin", label: COPY.nav.admin, adminOnly: true },
  { href: "/admin/flights", label: COPY.nav.adminFlights, adminOnly: true },
  { href: "/admin/pilots", label: COPY.nav.adminPilots, adminOnly: true },
  { href: "/admin/availability", label: COPY.nav.adminAvailability, adminOnly: true },
];

export async function AppShell({ children }: { children: ReactNode }) {
  const session = await auth();
  const user = session?.user;
  const isAdmin = user?.role === "ADMIN";
  const items: NavItem[] = isAdmin ? [...PILOT_ITEMS, ...ADMIN_ITEMS] : PILOT_ITEMS;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/dashboard" className="flex items-baseline gap-2">
            <span className="text-xl font-semibold tracking-tight">{COPY.brand.name}</span>
            <span className="hidden text-xs text-zinc-500 sm:inline">{COPY.brand.tagline}</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {user?.name && (
              <span className="hidden text-sm text-zinc-600 sm:inline dark:text-zinc-400">
                {user.name}
              </span>
            )}
            {isAdmin && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                {COPY.dashboard.adminBadge}
              </span>
            )}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {COPY.nav.signOut}
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 pb-20 md:pb-0">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white shadow-md md:hidden dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-6xl items-stretch justify-around px-1 py-1">
          {items.slice(0, 5).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-12 flex-1 flex-col items-center justify-center rounded-md px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <span className="text-center leading-tight">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
