// CAVOK — /admin/pilots — pilot directory.

import Link from "next/link";
import { Users, Plus, ArrowRight } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateTimeFR } from "@/lib/format";
import { formatHHMM, balanceTier } from "@/lib/duration";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";

export default async function AdminPilotsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const pilots = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  const errorBanner =
    params.error === "self_deactivate"
      ? "Vous ne pouvez pas désactiver votre propre compte."
      : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
              <Users className="h-4 w-4" aria-hidden="true" />
              {COPY.nav.adminPilots}
            </p>
            <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
              {pilots.length} compte{pilots.length > 1 ? "s" : ""}
            </h1>
          </div>
          <Link href="/admin/pilots/new">
            <Button>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouveau pilote
            </Button>
          </Link>
        </header>

        {errorBanner && (
          <div className="mb-6">
            <Alert tone="error">{errorBanner}</Alert>
          </div>
        )}

        <ul className="divide-y divide-border-subtle border-y border-border-subtle">
          {pilots.map((p) => (
            <li
              key={p.id}
              className={`group flex flex-wrap items-center justify-between gap-4 py-5 ${
                p.isActive ? "" : "opacity-55"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/pilots/${p.id}`}
                    className="font-display text-lg font-semibold text-text-strong transition-colors hover:text-brand"
                  >
                    {p.name}
                  </Link>
                  {p.role === "ADMIN" && (
                    <Badge variant="brand" size="sm">
                      Admin
                    </Badge>
                  )}
                  {!p.isActive && (
                    <Badge variant="danger" size="sm">
                      Inactif
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-text-muted">{p.email}</p>
                <p className="mt-0.5 text-xs tabular text-text-subtle">
                  Dernière connexion :{" "}
                  {p.lastLoginAt ? formatDateTimeFR(p.lastLoginAt) : "Jamais"}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Badge tier={balanceTier(p.hdvBalanceMin)}>
                  {formatHHMM(p.hdvBalanceMin)}
                </Badge>
                <Link
                  href={`/admin/pilots/${p.id}`}
                  aria-label={`Détails de ${p.name}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-sunken hover:text-brand"
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
