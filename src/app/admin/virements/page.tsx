// FlightSchedule — /admin/virements — bank-transfer validation queue.
//
// Two sections:
//   - Virements en attente: PENDING rows, ordered oldest first (admins
//     should process them FIFO, like any queue). Each row has "Valider"
//     and "Refuser" buttons.
//   - Historique: recent encaissements (Stripe + validated wires) plus
//     rejected wire reviews from the last 30 days for audit.

import { Banknote, CheckCircle2, CreditCard, XCircle } from "lucide-react";
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
import { resolveBanner } from "@/lib/banners";
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

  const collectionYear = new Date().getUTCFullYear();
  const yearStart = new Date(`${collectionYear}-01-01T00:00:00.000Z`);
  const nextYearStart = new Date(
    `${collectionYear + 1}-01-01T00:00:00.000Z`,
  );
  const thirtyDaysAgo = new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000);

  const [pending, bankTransferHistory, cardHistory, collectedByType] = await Promise.all([
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
    prisma.transaction.findMany({
      where: {
        type: "PACKAGE_PURCHASE",
        priceCents: { not: null },
        createdAt: { gte: thirtyDaysAgo },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { id: true, name: true } },
        performedBy: { select: { name: true } },
      },
    }),
    prisma.transaction.groupBy({
      by: ["type"],
      where: {
        type: { in: ["PACKAGE_PURCHASE", "BANK_TRANSFER"] },
        priceCents: { not: null },
        createdAt: {
          gte: yearStart,
          lt: nextYearStart,
        },
      },
      _sum: { priceCents: true },
    }),
  ]);
  const collectedByTypeMap = new Map(
    collectedByType.map((row) => [row.type, row._sum.priceCents ?? 0]),
  );
  const cardCollectedCents = collectedByTypeMap.get("PACKAGE_PURCHASE") ?? 0;
  const bankTransferCollectedCents =
    collectedByTypeMap.get("BANK_TRANSFER") ?? 0;
  const totalCollectedCents = cardCollectedCents + bankTransferCollectedCents;

  type HistoryRow =
    | {
        kind: "bankTransfer";
        at: Date;
        data: (typeof bankTransferHistory)[number];
      }
    | {
        kind: "cardPayment";
        at: Date;
        data: (typeof cardHistory)[number];
      };

  const history: HistoryRow[] = [
    ...bankTransferHistory.map<HistoryRow>((row) => ({
      kind: "bankTransfer",
      at: row.reviewedAt ?? row.createdAt,
      data: row,
    })),
    ...cardHistory.map<HistoryRow>((row) => ({
      kind: "cardPayment",
      at: row.createdAt,
      data: row,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 100);

  const banner = resolveBanner(sp, {
    validated: { tone: "success", msg: "Virement validé — solde crédité." },
    rejected: { tone: "success", msg: "Virement refusé." },
    "error:invalid": { tone: "error", msg: COPY.errors.invalidInput },
  });

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

        <section className="mb-10 grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-subtle">
              Total encaissé en {collectionYear}
            </p>
            <p className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong">
              {formatEuros(totalCollectedCents)}
            </p>
            <p className="mt-2 text-sm text-text-muted">
              Carte + virements validés.
            </p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-text-subtle">
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              <p className="text-xs font-medium uppercase tracking-[0.12em]">
                Carte
              </p>
            </div>
            <p className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong">
              {formatEuros(cardCollectedCents)}
            </p>
            <p className="mt-2 text-sm text-text-muted">
              Paiements Stripe validés.
            </p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-text-subtle">
              <Banknote className="h-4 w-4" aria-hidden="true" />
              <p className="text-xs font-medium uppercase tracking-[0.12em]">
                Virements
              </p>
            </div>
            <p className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong">
              {formatEuros(bankTransferCollectedCents)}
            </p>
            <p className="mt-2 text-sm text-text-muted">
              Virements bancaires validés.
            </p>
          </Card>
        </section>

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
                30 derniers jours · {history.length} opération
                {history.length !== 1 ? "s" : ""}
              </p>
            </div>
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {history.map((row) => {
                if (row.kind === "cardPayment") {
                  const tx = row.data;
                  return (
                    <li
                      key={tx.id}
                      className="flex flex-wrap items-start justify-between gap-3 py-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text">
                          {tx.user.name}
                          <span className="mx-2 text-text-subtle">·</span>
                          <span className="tabular text-text-muted">
                            {formatHHMM(tx.amountMin)}
                          </span>
                          <span className="mx-2 text-text-subtle">·</span>
                          <span className="tabular text-text-muted">
                            {formatEuros(tx.priceCents ?? 0)}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs tabular text-text-subtle">
                          <span className="font-mono">
                            {tx.reference ?? "Paiement carte"}
                          </span>
                          <span className="mx-1.5">·</span>
                          {formatDateTimeFR(tx.createdAt)}
                          {tx.performedBy?.name && (
                            <>
                              <span className="mx-1.5">·</span>
                              {tx.performedBy.name}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="info" size="sm">
                          Carte
                        </Badge>
                        <Badge variant="success" size="sm">
                          Validé
                        </Badge>
                      </div>
                    </li>
                  );
                }

                const bt = row.data;
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
                    <div className="flex items-center gap-2">
                      <Badge variant="info" size="sm">
                        Virement
                      </Badge>
                      <Badge
                        variant={isValidated ? "success" : "danger"}
                        size="sm"
                      >
                        {isValidated ? "Validé" : "Refusé"}
                      </Badge>
                    </div>
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
