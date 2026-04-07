// CAVOK — /admin/pilots/[id] — pilot detail with HDV adjust, reset, toggle.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateTimeFR } from "@/lib/format";
import {
  formatHHMM,
  formatHHMMSigned,
  balanceTier,
  BALANCE_TIER_FG_CLASSES,
  BALANCE_TIER_LABELS,
} from "@/lib/duration";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
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
  searchParams: Promise<{
    welcome?: string;
    adjusted?: string;
    pwreset?: string;
    toggled?: string;
    error?: string;
  }>;
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
      ? {
          tone: "success" as const,
          msg: "Compte créé. Un email avec le mot de passe temporaire a été envoyé.",
        }
      : sp.adjusted === "1"
        ? { tone: "success" as const, msg: "Solde HDV mis à jour." }
        : sp.pwreset === "1"
          ? { tone: "success" as const, msg: "Mot de passe réinitialisé. Email envoyé." }
          : sp.toggled === "1"
            ? {
                tone: "success" as const,
                msg: pilot.isActive ? "Compte réactivé." : "Compte désactivé.",
              }
            : sp.error === "bad_amount"
              ? {
                  tone: "error" as const,
                  msg: "Durée invalide. Format attendu : 1h30 ou 90.",
                }
              : sp.error === "invalid"
                ? { tone: "error" as const, msg: COPY.errors.invalidInput }
                : null;

  const isSelf = pilot.id === admin.user.id;
  const tier = balanceTier(pilot.hdvBalanceMin);
  const tierFg = BALANCE_TIER_FG_CLASSES[tier];

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href="/admin/pilots"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {COPY.nav.adminPilots}
        </Link>

        <header className="mt-4 mb-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
                {pilot.name}
              </h1>
              <p className="mt-2 text-base text-text-muted">{pilot.email}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {pilot.role === "ADMIN" && (
                  <Badge variant="brand">Administrateur</Badge>
                )}
                {!pilot.isActive && <Badge variant="danger">Inactif</Badge>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-subtle">
                {COPY.dashboard.balanceLabel}
              </p>
              <p
                className={`font-display tabular mt-1 text-5xl font-semibold tracking-tight ${tierFg}`}
              >
                {formatHHMM(pilot.hdvBalanceMin)}
              </p>
              <Badge tier={tier} className="mt-2">
                {BALANCE_TIER_LABELS[tier]}
              </Badge>
            </div>
          </div>
        </header>

        {banner && (
          <div className="mb-6">
            <Alert tone={banner.tone}>{banner.msg}</Alert>
          </div>
        )}

        {/* Manual HDV adjust */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Ajustement HDV manuel</CardTitle>
            <CardDescription>
              Crédite ou débite le solde du pilote. Une raison est obligatoire
              — elle apparaît dans l&apos;historique et sert d&apos;audit
              trail.
            </CardDescription>
          </CardHeader>
          <form action={adjustHdv} className="space-y-4">
            <input type="hidden" name="pilotId" value={pilot.id} />
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
              <div className="space-y-1.5">
                <Label htmlFor="sign" required>
                  Sens
                </Label>
                <select
                  id="sign"
                  name="sign"
                  required
                  className="block w-full min-h-11 rounded-md border border-border bg-surface-elevated px-3.5 py-2 text-base text-text shadow-xs focus:border-brand focus:outline-none"
                >
                  <option value="credit">Crédit (+)</option>
                  <option value="debit">Débit (−)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amount" required>
                  Durée (HH:MM ou minutes)
                </Label>
                <Input
                  id="amount"
                  name="amount"
                  type="text"
                  required
                  inputMode="numeric"
                  placeholder="ex : 1h30 ou 90"
                  className="tabular"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason" required>
                Raison
              </Label>
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
            <Button type="submit">Appliquer l&apos;ajustement</Button>
          </form>
        </Card>

        {/* Account actions */}
        <Card className="mb-12">
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
                <Button
                  type="submit"
                  variant={pilot.isActive ? "danger" : "secondary"}
                >
                  {pilot.isActive
                    ? "Désactiver le compte"
                    : "Réactiver le compte"}
                </Button>
              </form>
            )}
          </div>
          <p className="mt-4 text-xs text-text-subtle">
            Dernière connexion :{" "}
            <span className="tabular">
              {pilot.lastLoginAt
                ? formatDateTimeFR(pilot.lastLoginAt)
                : "Jamais"}
            </span>
          </p>
        </Card>

        {/* Recent transactions */}
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong">
              20 derniers mouvements
            </h2>
          </div>
          {pilot.transactions.length === 0 ? (
            <Card tone="sunken">
              <p className="text-sm text-text-muted">
                {COPY.account.transactionsEmpty}
              </p>
            </Card>
          ) : (
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {pilot.transactions.map((t) => {
                const isCredit = t.amountMin > 0;
                return (
                  <li
                    key={t.id}
                    className="grid grid-cols-[1fr_auto_auto] items-baseline gap-4 py-3.5 text-sm sm:grid-cols-[1fr_2fr_auto_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text">
                        {COPY.txTypes[t.type]}
                      </p>
                      <p className="mt-0.5 text-xs tabular text-text-subtle">
                        {formatDateTimeFR(t.createdAt)}
                      </p>
                    </div>
                    <p className="hidden truncate text-xs text-text-subtle sm:block">
                      {t.reference ?? "—"}
                    </p>
                    <p
                      className={`tabular text-right font-semibold ${
                        isCredit ? "text-success" : "text-text"
                      }`}
                    >
                      {formatHHMMSigned(t.amountMin)}
                    </p>
                    <p className="tabular text-right text-xs text-text-subtle">
                      → {formatHHMM(t.balanceAfterMin)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
