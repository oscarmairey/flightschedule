// CAVOK — /flights — pilot flight history.
//
// Photos render via signed GET URLs generated server-side. Each render
// generates a fresh batch of presigned URLs (15 min expiry).

import { History } from "lucide-react";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateFR, formatDateTimeFR } from "@/lib/format";
import { formatHHMM, formatHHMMSigned } from "@/lib/duration";
import { presignGetUrl } from "@/lib/r2";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";

export default async function FlightsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const flights = await prisma.flight.findMany({
    where: { userId: session.user.id },
    orderBy: { date: "desc" },
    take: 100,
    include: { reservation: true },
  });

  // Generate signed GET URLs for all photos in this batch.
  const photoUrlMap = new Map<string, string>();
  await Promise.all(
    flights.flatMap((f) =>
      f.photos.map(async (key) => {
        try {
          const url = await presignGetUrl(key);
          photoUrlMap.set(key, url);
        } catch (err) {
          console.error("[flights] presignGetUrl failed for", key, err);
        }
      }),
    ),
  );

  const totalMin = flights.reduce((acc, f) => acc + f.actualDurationMin, 0);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-10">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            <History className="h-4 w-4" aria-hidden="true" />
            {COPY.nav.myFlights}
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            {flights.length} vol{flights.length > 1 ? "s" : ""}
          </h1>
          {flights.length > 0 && (
            <p className="mt-2 text-base text-text-muted">
              <span className="font-display tabular text-text-strong">
                {formatHHMM(totalMin)}
              </span>{" "}
              cumulés depuis votre premier vol
            </p>
          )}
        </header>

        {sp.submitted === "1" && (
          <div className="mb-6">
            <Alert tone="success">
              Vol enregistré et en attente de validation par
              l&apos;administrateur.
            </Alert>
          </div>
        )}

        {flights.length === 0 ? (
          <Card tone="sunken">
            <p className="text-sm text-text-muted">
              Aucun vol enregistré. Vos saisies apparaîtront ici.
            </p>
          </Card>
        ) : (
          <ul className="space-y-5">
            {flights.map((f) => (
              <li key={f.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-2xl font-semibold tabular text-text-strong">
                          {f.depAirport}
                        </span>
                        <span className="text-text-subtle">→</span>
                        <span className="font-display text-2xl font-semibold tabular text-text-strong">
                          {f.arrAirport}
                        </span>
                      </div>
                      <p className="text-sm tabular text-text-muted">
                        {formatDateFR(f.date)}
                        <span className="mx-2 text-text-subtle">·</span>
                        <span className="font-semibold text-text">
                          {formatHHMM(f.actualDurationMin)}
                        </span>
                        {f.reconciliationDeltaMin !== 0 && (
                          <span className="ml-2 text-xs text-text-subtle">
                            (réservé {formatHHMM(f.reservedDurationMin)},{" "}
                            {f.reconciliationDeltaMin > 0 ? "rendu" : "dépassement"}{" "}
                            {formatHHMMSigned(f.reconciliationDeltaMin)})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-text-subtle">
                        {f.landings} atterrissage{f.landings > 1 ? "s" : ""}
                        <span className="mx-1.5">·</span>
                        saisi le {formatDateTimeFR(f.createdAt)}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {f.status === "VALIDATED" && (
                        <Badge variant="brand">Validé</Badge>
                      )}
                      {f.status === "PENDING" && (
                        <Badge variant="warning">En attente</Badge>
                      )}
                      {f.status === "REJECTED" && (
                        <Badge variant="danger">Rejeté</Badge>
                      )}
                    </div>
                  </div>

                  {f.remarks && (
                    <p className="mt-4 rounded-md bg-surface-sunken px-3.5 py-2.5 text-sm leading-relaxed text-text">
                      {f.remarks}
                    </p>
                  )}

                  {f.photos.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-2.5">
                      {f.photos.map((key) => {
                        const url = photoUrlMap.get(key);
                        if (!url) {
                          return (
                            <div
                              key={key}
                              className="flex h-24 w-24 items-center justify-center rounded-md border border-border bg-surface-sunken text-xs text-text-subtle"
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
                            className="block h-24 w-24 overflow-hidden rounded-md border border-border transition-all hover:border-brand hover:shadow-md"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`Photo carnet de bord du vol ${f.depAirport} → ${f.arrAirport}`}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </a>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
