// FlightSchedule — pilot flight history list.
//
// Extracted from /flights/new after Pass 1.2 split the form and the
// history into their own routes. Used by /flights (the full log) and
// can be reused anywhere else the history needs to be rendered.
//
// Server component: queries Prisma + R2 for signed photo URLs directly.
// Pass `userId` to scope to a pilot (admin callers can pass any id;
// the route that mounts this is responsible for authorization).

import { prisma } from "@/lib/db";
import { presignGetUrl } from "@/lib/r2";
import { formatDateFR, formatDateTimeFR } from "@/lib/format";
import { formatHHMM } from "@/lib/duration";
import { Card } from "@/components/ui/Card";

export async function FlightHistory({
  userId,
  limit = 100,
}: {
  userId: string;
  limit?: number;
}) {
  const flights = await prisma.flight.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: limit,
  });

  // Generate signed GET URLs for every photo referenced in the batch.
  // A failed presign logs and falls back to a "?" placeholder so one
  // missing blob can't break the whole page.
  const photoUrlMap = new Map<string, string>();
  await Promise.all(
    flights.flatMap((f) =>
      f.photos.map(async (key) => {
        try {
          const url = await presignGetUrl(key);
          photoUrlMap.set(key, url);
        } catch (err) {
          console.error("[FlightHistory] presignGetUrl failed for", key, err);
        }
      }),
    ),
  );

  if (flights.length === 0) {
    return (
      <Card tone="sunken">
        <p className="text-sm text-text-muted">
          Aucun vol enregistré. Vos saisies apparaîtront ici.
        </p>
      </Card>
    );
  }

  return (
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
                  <span className="mx-2 text-text-subtle">·</span>
                  <span className="tabular">
                    {f.engineStart} → {f.engineStop}
                  </span>
                </p>
                <p className="text-xs text-text-subtle">
                  {f.landings} atterrissage{f.landings !== 1 ? "s" : ""}
                  <span className="mx-1.5">·</span>
                  saisi le {formatDateTimeFR(f.createdAt)}
                </p>
              </div>
            </div>

            {f.remarks && (
              <p className="mt-4 rounded-md bg-surface-sunken px-3.5 py-2.5 text-sm leading-relaxed text-text">
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
                        className="flex h-14 w-14 items-center justify-center rounded-md border border-border bg-surface-sunken text-[10px] text-text-subtle"
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
                      className="block h-14 w-14 overflow-hidden rounded-md border border-border transition-all hover:border-brand hover:shadow-md"
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
  );
}
