// CAVOK — /admin/pilots/[id] — pilot detail with HDV adjust, reset, toggle.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateTimeFR } from "@/lib/format";
import { formatHHMM, formatHHMMSigned, balanceTier } from "@/lib/duration";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { AppShell } from "@/components/AppShell";
import {
  adjustHdv,
  resetPilotPassword,
  togglePilotActive,
} from "../actions";

export default async function PilotDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ welcome?: string; adjusted?: string; pwreset?: string; toggled?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;

  const pilot = await prisma.user.findUnique({
    where: { id },
    include: {
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!pilot) notFound();

  const banner =
    sp.welcome === "1"
      ? { tone: "success" as const, msg: "Compte créé. Un email avec le mot de passe temporaire a été envoyé." }
      : sp.adjusted === "1"
        ? { tone: "success" as const, msg: "Solde HDV mis à jour." }
        : sp.pwreset === "1"
          ? { tone: "success" as const, msg: "Mot de passe réinitialisé. Email envoyé." }
          : sp.toggled === "1"
            ? { tone: "success" as const, msg: pilot.isActive ? "Compte réactivé." : "Compte désactivé." }
            : sp.error === "bad_amount"
              ? { tone: "error" as const, msg: "Durée invalide. Format attendu : 1h30 ou 90." }
              : sp.error === "invalid"
                ? { tone: "error" as const, msg: COPY.errors.invalidInput }
                : null;

  const isSelf = pilot.id === admin.user.id;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <header>
          <Link href="/admin/pilots" className="text-sm text-zinc-500 hover:underline">
            ← {COPY.nav.adminPilots}
          </Link>
          <div className="mt-2 flex items-baseline justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">{pilot.name}</h1>
              <p className="mt-1 text-sm text-zinc-500">{pilot.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {pilot.role === "ADMIN" && <Badge variant="warning">Admin</Badge>}
              {!pilot.isActive && <Badge variant="danger">Inactif</Badge>}
              <Badge tier={balanceTier(pilot.hdvBalanceMin)}>
                {formatHHMM(pilot.hdvBalanceMin)}
              </Badge>
            </div>
          </div>
        </header>

        {banner && (
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              banner.tone === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-red-300 bg-red-50 text-red-900"
            }`}
            role="alert"
          >
            {banner.msg}
          </div>
        )}

        {/* Manual HDV adjust */}
        <Card>
          <CardHeader>
            <CardTitle>Ajustement HDV manuel</CardTitle>
            <CardDescription>
              Crédite ou débite le solde du pilote. Une raison est obligatoire — elle apparaît
              dans l'historique des mouvements et sert d'audit trail.
            </CardDescription>
          </CardHeader>
          <form action={adjustHdv} className="space-y-4">
            <input type="hidden" name="pilotId" value={pilot.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sign" required>Sens</Label>
                <select
                  id="sign"
                  name="sign"
                  required
                  className="block w-full min-h-11 rounded-md border border-zinc-300 px-3 py-2 text-base shadow-sm focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="credit">Crédit (+)</option>
                  <option value="debit">Débit (−)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount" required>Durée (HH:MM ou minutes)</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="text"
                  required
                  inputMode="numeric"
                  placeholder="ex : 1h30 ou 90"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason" required>Raison</Label>
              <Input
                id="reason"
                name="reason"
                type="text"
                required
                minLength={3}
                maxLength={1000}
                placeholder="ex : virement bancaire reçu, correction Excel, etc."
              />
            </div>
            <Button type="submit">Appliquer</Button>
          </form>
        </Card>

        {/* Account actions */}
        <Card>
          <CardHeader>
            <CardTitle>Actions sur le compte</CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-3">
            <form action={resetPilotPassword}>
              <input type="hidden" name="pilotId" value={pilot.id} />
              <Button type="submit" variant="secondary">
                Réinitialiser le mot de passe
              </Button>
            </form>
            {!isSelf && (
              <form action={togglePilotActive}>
                <input type="hidden" name="pilotId" value={pilot.id} />
                <Button type="submit" variant={pilot.isActive ? "danger" : "secondary"}>
                  {pilot.isActive ? "Désactiver le compte" : "Réactiver le compte"}
                </Button>
              </form>
            )}
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Dernière connexion :{" "}
            {pilot.lastLoginAt ? formatDateTimeFR(pilot.lastLoginAt) : "Jamais"}
          </p>
        </Card>

        {/* Recent transactions */}
        <Card className="overflow-hidden p-0">
          <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <h2 className="text-lg font-semibold">20 derniers mouvements</h2>
          </div>
          {pilot.transactions.length === 0 ? (
            <p className="px-6 py-6 text-sm text-zinc-500">{COPY.account.transactionsEmpty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Référence</th>
                    <th className="px-4 py-3 text-right">Montant</th>
                    <th className="px-4 py-3 text-right">Solde après</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {pilot.transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-3 text-zinc-600">{formatDateTimeFR(t.createdAt)}</td>
                      <td className="px-4 py-3">{COPY.txTypes[t.type]}</td>
                      <td className="px-4 py-3 text-zinc-500 max-w-xs truncate">
                        {t.reference ?? "—"}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          t.amountMin > 0 ? "text-emerald-700" : "text-zinc-700"
                        }`}
                      >
                        {formatHHMMSigned(t.amountMin)}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-700">
                        {formatHHMM(t.balanceAfterMin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
