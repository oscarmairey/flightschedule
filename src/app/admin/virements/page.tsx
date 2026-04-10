// FlightSchedule — /admin/virements — bank-transfer validation queue.
//
// Two sections:
//   - Virements en attente: PENDING rows, ordered oldest first (admins
//     should process them FIFO, like any queue). Each row has "Valider"
//     and "Refuser" buttons.
//   - Historique: VALIDATED + REJECTED from the last 30 days for audit.

import { Banknote, CheckCircle2, XCircle } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatHHMM } from "@/lib/duration";
import { formatDateTimeFR } from "@/lib/format";
import { formatEuros } from "@/lib/pricing";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";
import { validateBankTransfer, rejectBankTransfer } from "./actions";

export default async function AdminVirementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    validated?: string;
    rejected?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const thirtyDaysAgo = new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000);

  const [pending, history] = await Promise.all([
    prisma.bankTransfer.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" }, // FIFO
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.bankTransfer.findMany({
      where: {
        status: { in: ["VALIDATED", "REJECTED"] },
        reviewedAt: { gte: thirtyDaysAgo },
      },
      orderBy: { reviewedAt: "desc" },
      take: 50,
      include: {
        user: { select: { id: true, name: true } },
        reviewedBy: { select: { name: true } },
      },
    }),
  ]);

  const banner =
    sp.validated === "1"
      ? { tone: "success" as const, msg: "Virement validé — solde crédité." }
      : sp.rejected === "1"
        ? { tone: "success" as const, msg: "Virement refusé." }
        : sp.error === "invalid"
          ? { tone: "error" as const, msg: COPY.errors.invalidInput }
          : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-10">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            <Banknote className="h-4 w-4" aria-hidden="true" />
            {COPY.nav.adminVirements}
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            Virements bancaires
          </h1>
          <p className="mt-3 max-w-xl text-base text-text-muted">
            Validez les virements reçus sur le compte de l&apos;association en
            rapprochant le montant et la référence. La validation crédite
            immédiatement le solde HDV du pilote.
          </p>
        </header>

        {banner && (
          <div className="mb-6">
            <Alert tone={banner.tone}>{banner.msg}</Alert>
          </div>
        )}

        {/* Pending queue */}
        <section className="mb-14">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong">
              En attente ({pending.length})
            </h2>
            {pending.length > 0 && (
              <p className="text-xs text-text-subtle">Par ordre d&apos;arrivée</p>
            )}
          </div>
          {pending.length === 0 ? (
            <Card tone="sunken">
              <p className="text-sm text-text-muted">
                Aucun virement en attente.
              </p>
            </Card>
          ) : (
            <ul className="space-y-4">
              {pending.map((bt) => (
                <li key={bt.id}>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <h3 className="font-display text-lg font-semibold tracking-tight text-text-strong">
                            {bt.user.name}
                          </h3>
                          <Badge variant="warning" size="sm">
                            En attente
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-text-muted">
                          {bt.packageName}
                          <span className="mx-2 text-text-subtle">·</span>
                          <span className="tabular">
                            {formatHHMM(bt.hdvMinutes)}
                          </span>
                          <span className="mx-2 text-text-subtle">·</span>
                          <span className="tabular font-semibold text-text">
                            {formatEuros(bt.priceCentsTTC)}
                          </span>
                        </p>
                        <p className="mt-2 text-xs tabular text-text-subtle">
                          Référence{" "}
                          <span className="rounded border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-text">
                            {bt.reference}
                          </span>
                          <span className="mx-1.5">·</span>
                          Déclaré le {formatDateTimeFR(bt.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 border-t border-border-subtle pt-4">
                      <form action={validateBankTransfer} className="mb-4">
                        <input type="hidden" name="id" value={bt.id} />
                        <Button type="submit" variant="primary" size="sm">
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          Valider et créditer
                        </Button>
                      </form>
                      <form action={rejectBankTransfer} className="space-y-2">
                        <input type="hidden" name="id" value={bt.id} />
                        <Label htmlFor={`rejectionNote-${bt.id}`}>
                          Motif du refus{" "}
                          <span className="font-normal text-text-subtle">
                            ({COPY.common.optional})
                          </span>
                        </Label>
                        <div className="flex flex-wrap items-start gap-2">
                          <Input
                            id={`rejectionNote-${bt.id}`}
                            name="rejectionNote"
                            type="text"
                            maxLength={500}
                            placeholder="ex : virement non reçu, montant incorrect…"
                            className="min-w-52 flex-1"
                          />
                          <Button type="submit" variant="danger" size="sm">
                            <XCircle className="h-4 w-4" aria-hidden="true" />
                            Refuser
                          </Button>
                        </div>
                      </form>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* History */}
        {history.length > 0 && (
          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong">
                Historique
              </h2>
              <p className="text-xs text-text-subtle">
                30 derniers jours · {history.length} virement
                {history.length > 1 ? "s" : ""}
              </p>
            </div>
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {history.map((bt) => {
                const isValidated = bt.status === "VALIDATED";
                return (
                  <li
                    key={bt.id}
                    className="flex flex-wrap items-start justify-between gap-3 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text">
                        {bt.user.name}
                        <span className="mx-2 text-text-subtle">·</span>
                        <span className="tabular text-text-muted">
                          {formatHHMM(bt.hdvMinutes)}
                        </span>
                        <span className="mx-2 text-text-subtle">·</span>
                        <span className="tabular text-text-muted">
                          {formatEuros(bt.priceCentsTTC)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs tabular text-text-subtle">
                        <span className="font-mono">{bt.reference}</span>
                        <span className="mx-1.5">·</span>
                        {bt.reviewedAt && formatDateTimeFR(bt.reviewedAt)}
                        {bt.reviewedBy && (
                          <>
                            <span className="mx-1.5">·</span>
                            {bt.reviewedBy.name}
                          </>
                        )}
                      </p>
                      {!isValidated && bt.rejectionNote && (
                        <p className="mt-1 text-xs text-danger">
                          {bt.rejectionNote}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={isValidated ? "success" : "danger"}
                      size="sm"
                    >
                      {isValidated ? "Validé" : "Refusé"}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
