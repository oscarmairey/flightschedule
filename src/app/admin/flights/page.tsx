// CAVOK — /admin/flights — pending flight validation queue.
//
// Per D4: Validate or Edit only. No Reject.

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
        ? { tone: "success" as const, msg: "Vol mis à jour. N'oubliez pas de le valider." }
        : sp.error === "not_pending"
          ? { tone: "error" as const, msg: "Le vol n'est plus en attente." }
          : sp.error === "bad_duration"
            ? { tone: "error" as const, msg: "Durée invalide." }
            : sp.error === "invalid"
              ? { tone: "error" as const, msg: COPY.errors.invalidInput }
              : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">{COPY.nav.adminFlights}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {pending.length} vol{pending.length > 1 ? "s" : ""} en attente
          </p>
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

        {pending.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-500">
              Aucun vol en attente de validation.
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {pending.map((f) => (
              <Card key={f.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-lg font-semibold">
                      <span>{f.depAirport}</span>
                      <span className="text-zinc-400">→</span>
                      <span>{f.arrAirport}</span>
                    </div>
                    <p className="text-sm text-zinc-600">
                      {f.user.name} · {f.user.email}
                    </p>
                    <p className="text-sm text-zinc-500">
                      {formatDateFR(f.date)} · {formatHHMM(f.actualDurationMin)} effectif{" "}
                      <span className="text-zinc-400">
                        (réservé {formatHHMM(f.reservedDurationMin)})
                      </span>
                    </p>
                    {f.reconciliationDeltaMin !== 0 && (
                      <Badge
                        variant={f.reconciliationDeltaMin > 0 ? "info" : "warning"}
                        className="mt-1"
                      >
                        Delta {formatHHMMSigned(f.reconciliationDeltaMin)}
                      </Badge>
                    )}
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    Saisi le {formatDateTimeFR(f.createdAt)}
                  </div>
                </div>

                {f.remarks && (
                  <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-900">
                    {f.remarks}
                  </p>
                )}

                {f.photos.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {f.photos.map((key) => {
                      const url = photoUrlMap.get(key);
                      if (!url) {
                        return (
                          <div
                            key={key}
                            className="flex h-32 w-32 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-xs text-zinc-500"
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
                          className="block h-32 w-32 overflow-hidden rounded-md border border-zinc-200 hover:border-zinc-400"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt="Photo carnet"
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </a>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 grid gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-800 lg:grid-cols-2">
                  {/* Validate */}
                  <form action={validateFlight}>
                    <input type="hidden" name="flightId" value={f.id} />
                    <Button type="submit" fullWidth>
                      Valider
                    </Button>
                    <p className="mt-2 text-xs text-zinc-500">
                      La validation verrouille définitivement le vol. Pour corriger
                      un vol déjà validé, utilisez un ajustement manuel sur la fiche
                      du pilote.
                    </p>
                  </form>

                  {/* Edit */}
                  <form action={editFlight} className="space-y-2">
                    <input type="hidden" name="flightId" value={f.id} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`dur-${f.id}`} required>Durée corrigée</Label>
                        <Input
                          id={`dur-${f.id}`}
                          name="durationStr"
                          type="text"
                          inputMode="numeric"
                          defaultValue={formatHHMM(f.actualDurationMin)}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`notes-${f.id}`} required>Motif</Label>
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
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
