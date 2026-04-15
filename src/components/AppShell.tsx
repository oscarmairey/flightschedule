// FlightSchedule — application shell.
//
// Top bar (always visible):
//   - Logo + Fraunces wordmark — the brand surface
//   - Pilot nav items inline (md+)
//   - Admin dropdown for admins (md+, native <details> — no client JS)
//   - Sign-out button: ghost on desktop, icon-only on mobile
//
// Bottom nav (mobile only):
//   - Pilot items only with lucide icons. Admins on mobile use the
//     dropdown which collapses into a stacked menu when the top bar wraps.

import Link from "next/link";
import Image from "next/image";
import {
  LogOut,
  ChevronDown,
  Shield,
  LayoutGrid,
  CalendarDays,
  Plane,
} from "lucide-react";
import { auth, signOut } from "@/auth";
import { COPY } from "@/lib/copy";
import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof LayoutGrid;
};

const PILOT_ITEMS: NavItem[] = [
  { href: "/dashboard", label: COPY.nav.dashboard, Icon: LayoutGrid },
  { href: "/calendar", label: COPY.nav.calendar, Icon: CalendarDays },
  { href: "/flights", label: COPY.nav.myFlights, Icon: Plane },
];

const ADMIN_ITEMS: { href: string; label: string }[] = [
  { href: "/admin/pilots", label: COPY.nav.adminPilots },
  { href: "/admin/disponibilites", label: COPY.nav.adminDisponibilites },
  { href: "/admin/virements", label: COPY.nav.adminVirements },
  { href: "/admin/tarifs", label: COPY.nav.adminTarifs },
];

export async function AppShell({ children }: { children: ReactNode }) {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border-subtle bg-surface-elevated/85 backdrop-blur supports-[backdrop-filter]:bg-surface-elevated/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:py-4">
          {/* Wordmark */}
          <Link
            href="/dashboard"
            className="group flex items-center gap-2.5"
            aria-label="FlightSchedule"
          >
            <Image
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-md ring-1 ring-border-subtle"
              priority
            />
            <span className="font-display text-xl font-semibold text-text-strong tracking-tight transition-colors group-hover:text-brand">
              FlightSchedule
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden flex-1 items-center justify-center gap-0.5 md:flex">
            {PILOT_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-text-strong"
              >
                {item.label}
              </Link>
            ))}

            {isAdmin && (
              <details className="group relative ml-1">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-text-strong [&::-webkit-details-marker]:hidden">
                  <Shield className="h-4 w-4" aria-hidden="true" />
                  <span>{COPY.nav.admin}</span>
                  <ChevronDown
                    className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="absolute right-0 top-full z-30 mt-2 min-w-52 overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg">
                  <ul className="py-1.5">
                    {ADMIN_ITEMS.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className="block px-4 py-2 text-sm text-text-muted transition-colors hover:bg-surface-sunken hover:text-text-strong"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            )}
          </nav>

          {/* Right side: signout */}
          <div className="flex items-center gap-2">
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                aria-label={COPY.nav.signOut}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-text-muted shadow-xs transition-colors hover:border-border-strong hover:bg-surface-soft hover:text-danger"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{COPY.nav.signOut}</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 pb-24 md:pb-0">{children}</main>

      {/* Mobile bottom nav — pilot items, plus one admin entry point for
          admins. The old /admin overview page is gone, so mobile lands
          directly on the pilots admin list. */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-surface-elevated/95 backdrop-blur md:hidden"
      >
        <div
          className={`mx-auto grid max-w-md gap-0.5 px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 ${
            isAdmin ? "grid-cols-4" : "grid-cols-3"
          }`}
        >
          {PILOT_ITEMS.map((item) => {
            const Icon = item.Icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 text-[0.65rem] font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-brand"
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="text-center leading-tight">{item.label}</span>
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin/pilots"
              className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 text-[0.65rem] font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-brand"
            >
              <Shield className="h-5 w-5" aria-hidden="true" />
              <span className="text-center leading-tight">{COPY.nav.admin}</span>
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
