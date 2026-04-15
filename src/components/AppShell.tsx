// FlightSchedule — application shell.
//
// Top bar (always visible):
//   - Logo + Fraunces wordmark — the brand surface
//   - Pilot nav items inline (md+) with active-state
//   - Admin dropdown for admins (md+, native <details> — no client JS)
//   - Sign-out button via Button primitive (ghost-danger)
//
// Bottom nav (mobile only):
//   - Pilot items only with lucide icons, with active-state.
//   - Admins on mobile get a single entry point to the admin area.
//
// Active-state: the current pathname is forwarded by `src/proxy.ts` via
// the `x-pathname` request header. We read it through `headers()` so this
// stays a server component (no client JS for the whole shell).

import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import {
  LogOut,
  ChevronDown,
  Shield,
  LayoutGrid,
  CalendarDays,
  Plane,
} from "lucide-react";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/Button";
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

/** Exact-or-prefix match so /flights/new highlights /flights. */
function isActive(href: string, pathname: string): boolean {
  if (href === pathname) return true;
  return pathname.startsWith(`${href}/`);
}

export async function AppShell({ children }: { children: ReactNode }) {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  const adminOpen = pathname.startsWith("/admin");

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
            {PILOT_ITEMS.map((item) => {
              const active = isActive(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out-ui)] ${
                    active
                      ? "bg-brand-soft text-brand-soft-fg"
                      : "text-text-muted hover:bg-surface-sunken hover:text-text-strong"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {isAdmin && (
              <details
                open={adminOpen ? undefined : undefined}
                className="group relative ml-1"
              >
                <summary
                  aria-current={adminOpen ? "page" : undefined}
                  className={`flex cursor-pointer list-none items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out-ui)] [&::-webkit-details-marker]:hidden ${
                    adminOpen
                      ? "bg-brand-soft text-brand-soft-fg"
                      : "text-text-muted hover:bg-surface-sunken hover:text-text-strong"
                  }`}
                >
                  <Shield className="h-4 w-4" aria-hidden="true" />
                  <span>{COPY.nav.admin}</span>
                  <ChevronDown
                    className="h-4 w-4 transition-transform duration-[var(--duration-ui)] ease-[var(--ease-out-ui)] group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="absolute right-0 top-full z-30 mt-2 min-w-52 overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg">
                  <ul className="py-1.5">
                    {ADMIN_ITEMS.map((item) => {
                      const active = isActive(item.href, pathname);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={`block px-4 py-2 text-sm transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out-ui)] ${
                              active
                                ? "bg-brand-soft text-brand-soft-fg"
                                : "text-text-muted hover:bg-surface-sunken hover:text-text-strong"
                            }`}
                          >
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
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
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                aria-label={COPY.nav.signOut}
                className="hover:text-danger"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{COPY.nav.signOut}</span>
              </Button>
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
            const active = isActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 text-[0.65rem] font-medium transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out-ui)] ${
                  active
                    ? "bg-brand-soft text-brand-soft-fg"
                    : "text-text-muted hover:bg-surface-sunken hover:text-brand"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="text-center leading-tight">{item.label}</span>
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin/pilots"
              aria-current={adminOpen ? "page" : undefined}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 text-[0.65rem] font-medium transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out-ui)] ${
                adminOpen
                  ? "bg-brand-soft text-brand-soft-fg"
                  : "text-text-muted hover:bg-surface-sunken hover:text-brand"
              }`}
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
