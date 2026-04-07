// CAVOK — /admin/flights — pending flight validation queue.
//
// Per D4: Validate or Edit only. No Reject.

import { ClipboardCheck } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateFR, formatDateTimeFR } from "@/lib/format";
import { formatHHMM, formatHHMMSigned } from "@/lib/duration";
import { presignGetUrl } from "@/lib/r2";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";
import { validateFlight, editFlight } from "./actions";

export default async function AdminFlightsPage({
  searchParams,
}: {
  searchParams: Promise<{
    validated?: string;
    edited?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const pending = await prisma.flight.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" }, // oldest first per PRD §3.3.4
    include: {
      user: { select: { id: true, name: true, email: true } },
      reservation: true,
    },
  });

  // Pre-sign all photos for inline display
  const photoUrlMap = new Map<string, string>();
  await Promise.all(
    pending.flatMap((f) =>
      f.photos.map(async (key) => {
        try {
          const url = await presignGetUrl(key);
          photoUrlMap.set(key, url);
        } catch (err) {
          console.error("[admin/flights] presign failed:", key, err);
        }
      }),
    ),
  );

  const banner =
    sp.validated === "1"
      ? { tone: "success" as const, msg: "Vol validé." }
      : sp.edited === "1"
        ? {
            tone: "success" as const,
            msg: "Vol mis à jour. N'oubliez pas de le valider.",
          }
        : sp.error === "not_pending"
          ? { tone: "error" as const, msg: "Le vol n'est plus en attente." }
          : sp.error === "bad_duration"
            ? { tone: "error" as const, msg: "Durée invalide." }
            : sp.error === "invalid"
              ? { tone: "error" as const, msg: COPY.errors.invalidInput }
              : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-10">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            {COPY.nav.adminFlights}
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            {pending.length} vol{pending.length > 1 ? "s" : ""} à valider
          </h1>
        </header>

        {banner && (
          <div className="mb-6">
            <Alert tone={banner.tone}>{banner.msg}</Alert>
          </div>
        )}

        {pending.length === 0 ? (
          <Card tone="sunken">
            <p className="text-sm text-text-muted">
              File vide. Tous les vols soumis ont été validés.
            </p>
          </Card>
        ) : (
          <ul className="space-y-6">
            {pending.map((f) => (
              <li key={f.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-2xl font-semibold tabular text-text-strong">
                          {f.depAirport}
                        </span>
                        <span className="text-text-subtle">→</span>
                        <span className="font-display text-2xl font-semibold tabular text-text-strong">
                          {f.arrAirport}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-text-muted">
                        {f.user.name}
                        <span className="mx-1.5 text-text-subtle">·</span>
                        <span className="text-text-subtle">{f.user.email}</span>
                      </p>
                      <p className="mt-1 text-sm tabular text-text-muted">
                        {formatDateFR(f.date)}
                        <span className="mx-2 text-text-subtle">·</span>
                        <span className="font-semibold text-text">
                          {formatHHMM(f.actualDurationMin)}
                        </span>
                        <span className="ml-1 text-xs text-text-subtle">
                          (réservé {formatHHMM(f.reservedDurationMin)})
                        </span>
                      </p>
                      {f.reconciliationDeltaMin !== 0 && (
                        <Badge
                          variant={f.reconciliationDeltaMin > 0 ? "info" : "warning"}
                          className="mt-2"
                        >
                          Delta {formatHHMMSigned(f.reconciliationDeltaMin)}
                        </Badge>
                      )}
                    </div>
                    <div className="text-right text-xs tabular text-text-subtle">
                      Saisi le<br />
                      {formatDateTimeFR(f.createdAt)}
                    </div>
                  </div>

                  {f.remarks && (
                    <p className="mt-4 rounded-md bg-surface-sunken px-3.5 py-2.5 text-sm leading-relaxed text-text">
                      {f.remarks}
                    </p>
                  )}

                  {f.photos.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-3">
                      {f.photos.map((key) => {
                        const url = photoUrlMap.get(key);
                        if (!url) {
                          return (
                            <div
                              key={key}
                              className="flex h-32 w-32 items-center justify-center rounded-md border border-border bg-surface-sunken text-xs text-text-subtle"
                              aria-label="Photo indisponible"
                            >
                              ?
                            </div>
                          );
                        }
                        return (
                          <a
                            key={key}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block h-32 w-32 overflow-hidden rounded-md border border-border transition-all hover:border-brand hover:shadow-md"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`Photo carnet — ${f.depAirport} → ${f.arrAirport}`}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </a>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-6 grid gap-5 border-t border-border-subtle pt-6 lg:grid-cols-2">
                    {/* Validate */}
                    <form action={validateFlight} className="flex flex-col">
                      <input type="hidden" name="flightId" value={f.id} />
                      <Button type="submit" fullWidth>
                        Valider
                      </Button>
                      <p className="mt-2 text-xs leading-relaxed text-text-subtle">
                        La validation verrouille définitivement le vol. Pour
                        corriger un vol déjà validé, utilisez un ajustement
                        manuel sur la fiche du pilote.
                      </p>
                    </form>

                    {/* Edit */}
                    <form action={editFlight} className="space-y-3">
                      <input type="hidden" name="flightId" value={f.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`dur-${f.id}`} required>
                            Durée corrigée
                          </Label>
                          <Input
                            id={`dur-${f.id}`}
                            name="durationStr"
                            type="text"
                            inputMode="numeric"
                            defaultValue={formatHHMM(f.actualDurationMin)}
                            required
                            className="tabular"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`notes-${f.id}`} required>
                            Motif
                          </Label>
                          <Input
                            id={`notes-${f.id}`}
                            name="adminNotes"
                            type="text"
                            minLength={3}
                            maxLength={1000}
                            required
                            placeholder="ex : durée mal reportée"
                          />
                        </div>
                      </div>
                      <Button type="submit" variant="secondary" fullWidth>
                        Modifier
                      </Button>
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
