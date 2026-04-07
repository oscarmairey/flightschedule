// CAVOK — /admin/pilots — pilot directory.

import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateTimeFR } from "@/lib/format";
import { formatHHMM, balanceTier } from "@/lib/duration";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
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
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{COPY.nav.adminPilots}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {pilots.length} compte{pilots.length > 1 ? "s" : ""}
            </p>
          </div>
          <Link href="/admin/pilots/new">
            <Button>Nouveau pilote</Button>
          </Link>
        </header>

        {errorBanner && (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
            {errorBanner}
          </div>
        )}

        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-3">Nom</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Rôle</th>
                  <th className="px-4 py-3 text-right">Solde HDV</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Dernière connexion</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {pilots.map((p) => (
                  <tr key={p.id} className={p.isActive ? "" : "opacity-60"}>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-zinc-600">{p.email}</td>
                    <td className="px-4 py-3">
                      {p.role === "ADMIN" ? (
                        <Badge variant="warning">Admin</Badge>
                      ) : (
                        <Badge>Pilote</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge tier={balanceTier(p.hdvBalanceMin)}>
                        {formatHHMM(p.hdvBalanceMin)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {p.isActive ? (
                        <Badge variant="success">Actif</Badge>
                      ) : (
                        <Badge variant="danger">Inactif</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {p.lastLoginAt ? formatDateTimeFR(p.lastLoginAt) : "Jamais"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/pilots/${p.id}`}
                        className="text-sm font-medium text-zinc-700 hover:underline"
                      >
                        Détails
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
