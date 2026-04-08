// FlightSchedule — /flights/new — pilot flight entry form + flight history. V2.
//
// One dropdown to choose: an existing reservation OR "vol sans
// réservation préalable" (the server auto-creates a matching reservation).
// When an existing reservation is selected, the flight date is taken from
// the reservation server-side (the form's flightDate input is ignored).
//
// V2 changes:
//   - Engine bloc OFF / bloc ON drive the flight duration (no manual
//     duration input).
//   - Photos are optional (0–5).
//   - Submitting any flight debits HDV via FLIGHT_DEBIT (allows negative).
//
// The pilot's flight history (last 100) is rendered below the form so
// "Mes vols" doesn't need a separate route in the nav.

import Link from "next/link";
import { PencilLine, Plus } from "lucide-react";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateFR, formatDateTimeFR, parisLocalDateString } from "@/lib/format";
import { formatHHMM } from "@/lib/duration";
import { presignGetUrl } from "@/lib/r2";
import { COMMON_AIRPORTS } from "@/lib/airports";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";
import { PhotoUpload } from "@/components/flights/PhotoUpload";
import { submitFlight } from "./actions";

const TZ = "Europe/Paris";

export default async function NewFlightPage({
  searchParams,
}: {
  searchParams: Promise<{ reservation?: string; error?: string; msg?: string; added?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  // Reservations the pilot can attach a flight to: own + confirmed +
  // already started. The dropdown surfaces the current count of attached
  // flights so the pilot knows when they're adding to an existing slot.
  // Auto-created reservations are filtered out — they always have exactly
  // one flight referencing them already.
  const [candidates, flightHistory] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        userId: session.user.id,
        status: "CONFIRMED",
        startsAt: { lte: new Date() },
        autoCreatedFromFlight: false,
      },
      orderBy: { startsAt: "desc" },
      take: 20,
      include: { _count: { select: { flights: true } } },
    }),
    prisma.flight.findMany({
      where: { userId: session.user.id },
      orderBy: { date: "desc" },
      take: 100,
    }),
  ]);

  // Pre-select either the requested reservation or the most recent
  // candidate; falls back to "onthego" when there are none.
  const preselectedReservationId =
    candidates.find((r) => r.id === sp.reservation)?.id ?? candidates[0]?.id;
  const defaultSelection = preselectedReservationId ?? "onthego";
  // Default the flight date to today (Paris-local). Server overrides this
  // with the reservation's date when one is selected.
  const defaultFlightDate = parisLocalDateString(new Date());

  // Generate signed GET URLs for all photos in the history batch.
  const photoUrlMap = new Map<string, string>();
  await Promise.all(
    flightHistory.flatMap((f) =>
      f.photos.map(async (key) => {
        try {
          const url = await presignGetUrl(key);
          photoUrlMap.set(key, url);
        } catch (err) {
          console.error("[flights/new] presignGetUrl failed for", key, err);
        }
      }),
    ),
  );

  const totalFlightMin = flightHistory.reduce(
    (acc, f) => acc + f.actualDurationMin,
    0,
  );

  const errorBanner =
    sp.error === "too_many_photos"
      ? "Maximum 5 photos par vol."
      : sp.error === "bad_photo_key"
        ? "Photo invalide ou n'appartenant pas à votre compte."
        : sp.error === "photo_missing"
          ? "Une photo n'a pas été trouvée sur le serveur. Réessayez."
          : sp.error === "bad_reservation"
            ? "Réservation invalide."
            : sp.error === "engine"
              ? sp.msg ?? "Heures bloc OFF / bloc ON invalides."
              : sp.error === "cross_pilot"
                ? "Conflit avec une réservation d'un autre pilote — contactez l'administrateur."
                : sp.error === "invalid"
                  ? COPY.errors.invalidInput
                  : null;

  const justAdded = sp.added === "1";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-10">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            {COPY.nav.newFlight}
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            Mes vols
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-text-muted">
            Reportez les informations de votre vol. Les heures bloc OFF /
            bloc ON déterminent la durée et le décompte HDV.
          </p>
        </header>

        {errorBanner && (
          <div className="mb-6">
            <Alert tone="error">{errorBanner}</Alert>
          </div>
        )}

        {justAdded && !errorBanner && (
          <div className="mb-6">
            <Alert tone="success">
              Vol enregistré. Vous pouvez en saisir un autre, ou{" "}
              <Link href="/flights" className="font-semibold underline">
                voir vos vols
              </Link>
              .
            </Alert>
          </div>
        )}

        <form action={submitFlight} className="space-y-6">
          {/* Reservation selector — single dropdown */}
          <Card>
            <CardHeader>
              <CardTitle>Réservation</CardTitle>
              <CardDescription>
                Rattachez ce vol à une de vos réservations confirmées, ou
                choisissez « Vol sans réservation préalable » : une
                réservation sera alors créée automatiquement à partir des
                heures bloc OFF / bloc ON.
              </CardDescription>
            </CardHeader>
            <div>
              <Label htmlFor="reservationSelection" required>
                Réservation
              </Label>
              <select
                id="reservationSelection"
                name="reservationSelection"
                defaultValue={defaultSelection}
                required
                className="mt-1.5 block w-full min-h-11 rounded-md border border-border bg-surface-elevated px-3.5 py-2 text-base text-text shadow-xs focus:border-brand focus:outline-none"
              >
                <option value="onthego">— {COPY.flight.modeOnTheGo} —</option>
                {candidates.map((r) => {
                  const existing = r._count.flights;
                  return (
                    <option key={r.id} value={r.id}>
                      {formatDateFR(r.startsAt)} ·{" "}
                      {new Intl.DateTimeFormat("fr-FR", {
                        timeZone: TZ,
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(r.startsAt)}
                      {" – "}
                      {new Intl.DateTimeFormat("fr-FR", {
                        timeZone: TZ,
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(r.endsAt)}
                      {existing > 0
                        ? ` · ${existing} vol${existing > 1 ? "s" : ""} déjà saisi${existing > 1 ? "s" : ""}`
                        : ""}
                    </option>
                  );
                })}
              </select>
              <p className="mt-2 text-xs text-text-subtle">
                Si vous choisissez une réservation, la date du vol est
                reprise automatiquement.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vol</CardTitle>
            </CardHeader>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="flightDate" required>
                  Date du vol
                </Label>
                <Input
                  id="flightDate"
                  name="flightDate"
                  type="date"
                  required
                  defaultValue={defaultFlightDate}
                  className="tabular"
                />
                <p className="text-xs text-text-subtle">
                  Ignorée si une réservation est sélectionnée ci-dessus.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="depAirport" required>
                  Aéroport départ (OACI)
                </Label>
                <Input
                  id="depAirport"
                  name="depAirport"
                  type="text"
                  required
                  maxLength={4}
                  list="airports-list"
                  placeholder="LFPN"
                  className="uppercase font-display tabular text-lg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="arrAirport" required>
                  Aéroport arrivée (OACI)
                </Label>
                <Input
                  id="arrAirport"
                  name="arrAirport"
                  type="text"
                  required
                  maxLength={4}
                  list="airports-list"
                  placeholder="LFPN"
                  className="uppercase font-display tabular text-lg"
                />
              </div>
              <datalist id="airports-list">
                {COMMON_AIRPORTS.map((a) => (
                  <option key={a.icao} value={a.icao}>
                    {a.name}
                  </option>
                ))}
              </datalist>

              <div className="space-y-2">
                <Label htmlFor="engineStart" required>
                  {COPY.flight.blocOff}
                </Label>
                <Input
                  id="engineStart"
                  name="engineStart"
                  type="time"
                  step="60"
                  required
                  className="tabular"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="engineStop" required>
                  {COPY.flight.blocOn}
                </Label>
                <Input
                  id="engineStop"
                  name="engineStop"
                  type="time"
                  step="60"
                  required
                  className="tabular"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="landings" required>
                  Atterrissages
                </Label>
                <Input
                  id="landings"
                  name="landings"
                  type="number"
                  required
                  inputMode="numeric"
                  defaultValue={1}
                  min={1}
                  max={99}
                  className="tabular"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="remarks">Remarques</Label>
                <textarea
                  id="remarks"
                  name="remarks"
                  rows={3}
                  maxLength={2000}
                  className="block w-full rounded-md border border-border bg-surface-elevated px-3.5 py-2 text-base text-text shadow-xs focus:border-brand focus:outline-none"
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Photos du carnet de bord</CardTitle>
              <CardDescription>
                0 à 5 photos (facultatif). Uploadées directement sur le
                stockage privé Cloudflare R2 — le serveur ne voit jamais les
                fichiers.
              </CardDescription>
            </CardHeader>
            <PhotoUpload name="photoKeys" />
          </Card>

          <div className="flex justify-end">
            <Button type="submit" size="lg">
              Enregistrer le vol
            </Button>
          </div>
        </form>

        {/* Flight history (replaces the dropped /flights route) */}
        <section className="mt-14">
          <header className="mb-5">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-strong">
              {flightHistory.length} vol{flightHistory.length > 1 ? "s" : ""} enregistré
              {flightHistory.length > 1 ? "s" : ""}
            </h2>
            {flightHistory.length > 0 && (
              <p className="mt-1 text-sm text-text-muted">
                <span className="font-display tabular text-text-strong">
                  {formatHHMM(totalFlightMin)}
                </span>{" "}
                cumulés depuis votre premier vol
              </p>
            )}
          </header>

          {flightHistory.length === 0 ? (
            <Card tone="sunken">
              <p className="text-sm text-text-muted">
                Aucun vol enregistré. Vos saisies apparaîtront ici.
              </p>
            </Card>
          ) : (
            <ul className="space-y-5">
              {flightHistory.map((f) => (
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
                          {f.landings} atterrissage{f.landings > 1 ? "s" : ""}
                          <span className="mx-1.5">·</span>
                          saisi le {formatDateTimeFR(f.createdAt)}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <Link
                          href={`/flights/new?reservation=${f.reservationId}`}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text-muted shadow-xs transition-colors hover:border-brand hover:text-brand"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          Ajouter un vol
                        </Link>
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
        </section>
      </div>
    </AppShell>
  );
}
