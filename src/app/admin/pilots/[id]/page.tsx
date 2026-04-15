// FlightSchedule — /admin/pilots/[id] — pilot detail with HDV adjust, reset, toggle.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PencilLine } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateFR, formatDateTimeFR } from "@/lib/format";
import { formatHHMM, formatHHMMSigned } from "@/lib/duration";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { AppShell } from "@/components/AppShell";
import { HeroBalance } from "@/components/HeroBalance";
import { resolveBanner } from "@/lib/banners";
import {
  adjustHdv,
  changePilotEmail,
  promotePilotToAdmin,
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
    promoted?: string;
    emailchanged?: string;
    flightedited?: string;
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

  // Latest 10 bank transfers for this pilot — any status, newest first.
  // VALIDATED ones also appear as Transaction rows below, but listing
  // them here gives the admin a per-pilot audit view without juggling
  // pages.
  const bankTransfers = await prisma.bankTransfer.findMany({
    where: { userId: pilot.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Latest 10 flights for this pilot — newest first. The admin uses this
  // section as the entry point to /admin/flights/[id]/edit to correct
  // bloc OFF / bloc ON, airports, etc. The compensating ADMIN_ADJUSTMENT
  // row that the edit produces appears further down in "20 derniers
  // mouvements" so the operator sees the ledger impact in one scroll.
  const recentFlights = await prisma.flight.findMany({
    where: { userId: pilot.id },
    orderBy: { date: "desc" },
    take: 10,
    select: {
      id: true,
      date: true,
      depAirport: true,
      arrAirport: true,
      actualDurationMin: true,
      engineStart: true,
      engineStop: true,
    },
  });

  const banner = resolveBanner(sp, {
    welcome: {
      tone: "success",
      msg: "Compte créé. Un email avec le mot de passe temporaire a été envoyé.",
    },
    adjusted: { tone: "success", msg: "Solde HDV mis à jour." },
    pwreset: { tone: "success", msg: "Mot de passe réinitialisé. Email envoyé." },
    promoted: { tone: "success", msg: "Pilote promu administrateur." },
    emailchanged: { tone: "success", msg: "Adresse email mise à jour." },
    flightedited: {
      tone: "success",
      msg: "Vol corrigé. Le solde HDV a été ajusté en conséquence.",
    },
    toggled: {
      tone: "success",
      msg: pilot.isActive ? "Compte réactivé." : "Compte désactivé.",
    },
    "error:bad_amount": {
      tone: "error",
      msg: "Durée invalide. Format attendu : 1h30 ou 90.",
    },
    "error:bad_email": {
      tone: "error",
      msg: "Adresse email invalide.",
    },
    "error:email_taken": {
      tone: "error",
      msg: "Cette adresse email est déjà utilisée par un autre compte.",
    },
    "error:invalid": { tone: "error", msg: COPY.errors.invalidInput },
  });

  const isSelf = pilot.id === admin.user.id;

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
            <HeroBalance
              balanceMin={pilot.hdvBalanceMin}
              label={COPY.dashboard.balanceLabel}
              size="md"
              align="right"
            />
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
                <Select id="sign" name="sign" required>
                  <option value="credit">Crédit (+)</option>
                  <option value="debit">Débit (−)</option>
                </Select>
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

        {/* Email change */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Adresse email</CardTitle>
            <CardDescription>
              Met à jour l&apos;adresse de connexion du pilote. Le nouveau
              mot de passe d&apos;accès reste inchangé.
            </CardDescription>
          </CardHeader>
          <form action={changePilotEmail} className="space-y-4">
            <input type="hidden" name="pilotId" value={pilot.id} />
            <div className="space-y-1.5">
              <Label htmlFor="email" required>
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                maxLength={255}
                defaultValue={pilot.email}
                className="lowercase"
              />
            </div>
            <Button type="submit" variant="secondary">
              Mettre à jour l&apos;email
            </Button>
          </form>
        </Card>

        {/* Account actions */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle>Actions sur le compte</CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-3">
            <ConfirmButton
              formAction={resetPilotPassword}
              hidden={{ pilotId: pilot.id }}
              triggerLabel="Réinitialiser le mot de passe"
              triggerVariant="secondary"
              title="Réinitialiser le mot de passe ?"
              body={
                <>
                  Un nouveau mot de passe temporaire sera généré et envoyé
                  à{" "}
                  <span className="font-semibold text-text">{pilot.email}</span>
                  . Le pilote ne pourra plus se connecter avec son ancien
                  mot de passe.
                </>
              }
              confirmLabel="Réinitialiser"
              confirmVariant="danger"
            />
            {!isSelf && pilot.role !== "ADMIN" && (
              <ConfirmButton
                formAction={promotePilotToAdmin}
                hidden={{ pilotId: pilot.id }}
                triggerLabel="Promouvoir administrateur"
                triggerVariant="secondary"
                title="Promouvoir administrateur ?"
                body={
                  <>
                    <span className="font-semibold text-text">
                      {pilot.name}
                    </span>{" "}
                    aura accès à toutes les fonctions administrateur :
                    gestion des pilotes, des tarifs, des virements, des
                    disponibilités. Cette action ne peut être annulée que
                    par un autre administrateur.
                  </>
                }
                confirmLabel="Promouvoir"
                confirmVariant="primary"
              />
            )}
            {!isSelf && (
              <ConfirmButton
                formAction={togglePilotActive}
                hidden={{ pilotId: pilot.id }}
                triggerLabel={
                  pilot.isActive ? "Désactiver le compte" : "Réactiver le compte"
                }
                triggerVariant={pilot.isActive ? "danger" : "secondary"}
                title={
                  pilot.isActive
                    ? "Désactiver ce compte ?"
                    : "Réactiver ce compte ?"
                }
                body={
                  pilot.isActive ? (
                    <>
                      <span className="font-semibold text-text">
                        {pilot.name}
                      </span>{" "}
                      ne pourra plus se connecter. Ses réservations et
                      historique de vols sont conservés. Vous pouvez
                      réactiver le compte à tout moment.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-text">
                        {pilot.name}
                      </span>{" "}
                      pourra à nouveau se connecter et utiliser
                      l&apos;application.
                    </>
                  )
                }
                confirmLabel={pilot.isActive ? "Désactiver" : "Réactiver"}
                confirmVariant={pilot.isActive ? "danger" : "primary"}
              />
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

        {/* Bank transfers (last 10) — hidden if the pilot has none */}
        {bankTransfers.length > 0 && (
          <section className="mb-12">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong">
                Virements bancaires
              </h2>
              <Link
                href="/admin/virements"
                className="text-xs font-medium text-brand transition-colors hover:text-brand-hover"
              >
                File d&apos;attente →
              </Link>
            </div>
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {bankTransfers.map((bt) => {
                const statusVariant =
                  bt.status === "PENDING"
                    ? ("warning" as const)
                    : bt.status === "VALIDATED"
                      ? ("success" as const)
                      : ("danger" as const);
                const statusLabel =
                  bt.status === "PENDING"
                    ? "En attente"
                    : bt.status === "VALIDATED"
                      ? "Validé"
                      : "Refusé";
                return (
                  <li
                    key={bt.id}
                    className="flex flex-wrap items-start justify-between gap-3 py-3.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-text">
                        {bt.packageName}
                        <span className="mx-2 text-text-subtle">·</span>
                        <span className="tabular text-text-muted">
                          {formatHHMM(bt.hdvMinutes)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs tabular text-text-subtle">
                        <span className="font-mono">{bt.reference}</span>
                        <span className="mx-1.5">·</span>
                        {formatDateTimeFR(bt.createdAt)}
                      </p>
                      {bt.status === "REJECTED" && bt.rejectionNote && (
                        <p className="mt-1 text-xs text-danger">
                          {bt.rejectionNote}
                        </p>
                      )}
                    </div>
                    <Badge variant={statusVariant} size="sm">
                      {statusLabel}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Recent flights — entry point to /admin/flights/[id]/edit */}
        <section className="mb-12">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong">
              10 derniers vols
            </h2>
            <p className="text-xs text-text-subtle">
              Cliquez sur « Modifier » pour corriger un vol.
            </p>
          </div>
          {recentFlights.length === 0 ? (
            <Card tone="sunken">
              <p className="text-sm text-text-muted">
                Aucun vol enregistré pour ce pilote.
              </p>
            </Card>
          ) : (
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {recentFlights.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display tabular text-base font-semibold text-text-strong">
                      {f.depAirport}
                      <span className="mx-1.5 text-text-subtle">→</span>
                      {f.arrAirport}
                    </p>
                    <p className="mt-0.5 text-xs tabular text-text-subtle">
                      {formatDateFR(f.date)}
                      <span className="mx-1.5">·</span>
                      {f.engineStart} → {f.engineStop}
                      <span className="mx-1.5">·</span>
                      <span className="font-semibold text-text">
                        {formatHHMM(f.actualDurationMin)}
                      </span>
                    </p>
                  </div>
                  <Link
                    href={`/admin/flights/${f.id}/edit`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors hover:text-brand-hover"
                  >
                    <PencilLine className="h-4 w-4" aria-hidden="true" />
                    Modifier
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

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
                {COPY.dashboard.transactionsEmpty}
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
                      → {formatHHMM(t.balanceAfterMin ?? 0)}
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
