// CAVOK — /flights — pilot flight history.
//
// Photos render via signed GET URLs generated server-side. Each render
// generates a fresh batch of presigned URLs (15 min expiry).

import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateFR, formatDateTimeFR } from "@/lib/format";
import { formatHHMM, formatHHMMSigned } from "@/lib/duration";
import { presignGetUrl } from "@/lib/r2";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
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

  const banner =
    sp.submitted === "1"
      ? "Vol enregistré et en attente de validation par l'administrateur."
      : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">{COPY.nav.myFlights}</h1>
        </header>

        {banner && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {banner}
          </div>
        )}

        {flights.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-500">Aucun vol enregistré.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {flights.map((f) => (
              <Card key={f.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-lg font-semibold">
                      <span>{f.depAirport}</span>
                      <span className="text-zinc-400">→</span>
                      <span>{f.arrAirport}</span>
                    </div>
                    <p className="text-sm text-zinc-500">
                      {formatDateFR(f.date)} · {formatHHMM(f.actualDurationMin)}
                      {f.reconciliationDeltaMin !== 0 && (
                        <span className="ml-2 text-zinc-600">
                          (réservé {formatHHMM(f.reservedDurationMin)},{" "}
                          {f.reconciliationDeltaMin > 0 ? "rendu" : "dépassement"}{" "}
                          {formatHHMMSigned(f.reconciliationDeltaMin)})
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {f.landings} atterrissage{f.landings > 1 ? "s" : ""} ·{" "}
                      saisi le {formatDateTimeFR(f.createdAt)}
                    </p>
                  </div>
                  <div>
                    {f.status === "VALIDATED" && <Badge variant="success">Validé</Badge>}
                    {f.status === "PENDING" && <Badge variant="warning">En attente</Badge>}
                    {f.status === "REJECTED" && <Badge variant="danger">Rejeté</Badge>}
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
                            className="flex h-24 w-24 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-xs text-zinc-500"
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
                          className="block h-24 w-24 overflow-hidden rounded-md border border-zinc-200 hover:border-zinc-400"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt="Photo carnet de bord"
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </a>
                      );
                    })}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
