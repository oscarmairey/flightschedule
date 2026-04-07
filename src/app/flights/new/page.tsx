// CAVOK — /flights/new — pilot flight entry form.

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { COPY } from "@/lib/copy";
import { formatDateFR } from "@/lib/format";
import { formatHHMM } from "@/lib/duration";
import { COMMON_AIRPORTS } from "@/lib/airports";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { AppShell } from "@/components/AppShell";
import { PhotoUpload } from "@/components/flights/PhotoUpload";
import { submitFlight } from "./actions";

const TZ = "Europe/Paris";

export default async function NewFlightPage({
  searchParams,
}: {
  searchParams: Promise<{ reservation?: string; error?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  // Reservations the pilot can attach a flight to: own + confirmed + no
  // existing flight + already started (at least 30 min ago to be safe).
  const candidates = await prisma.reservation.findMany({
    where: {
      userId: session.user.id,
      status: "CONFIRMED",
      startsAt: { lte: new Date() },
      flight: null,
    },
    orderBy: { startsAt: "desc" },
    take: 20,
  });

  if (candidates.length === 0) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-8">
          <h1 className="text-3xl font-semibold tracking-tight">{COPY.nav.newFlight}</h1>
          <Card className="mt-6">
            <p className="text-sm text-zinc-600">
              Aucune réservation en attente de saisie. Réservez d'abord un créneau,
              effectuez votre vol, puis revenez ici pour le saisir.
            </p>
          </Card>
        </div>
      </AppShell>
    );
  }

  // Pre-select the requested reservation, or default to the most recent
  const preselected =
    candidates.find((r) => r.id === sp.reservation) ?? candidates[0];

  const errorBanner =
    sp.error === "no_photos"
      ? "Au moins une photo du carnet de bord est obligatoire."
      : sp.error === "too_many_photos"
        ? "Maximum 5 photos par vol."
        : sp.error === "bad_photo_key"
          ? "Photo invalide ou n'appartenant pas à votre compte."
          : sp.error === "photo_missing"
            ? "Une photo n'a pas été trouvée sur le serveur. Réessayez."
            : sp.error === "bad_reservation"
              ? "Réservation invalide."
              : sp.error === "already_logged"
                ? "Un vol a déjà été enregistré pour cette réservation."
                : sp.error === "bad_duration"
                  ? "Durée invalide. Format attendu : 1h30 ou 90."
                  : sp.error === "invalid"
                    ? COPY.errors.invalidInput
                    : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">{COPY.nav.newFlight}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Saisissez les informations de votre vol et joignez les photos du carnet
            de bord papier.
          </p>
        </header>

        {errorBanner && (
          <div
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          >
            {errorBanner}
          </div>
        )}

        <form action={submitFlight} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Réservation rattachée</CardTitle>
              <CardDescription>
                Sélectionnez la réservation correspondant au vol effectué.
              </CardDescription>
            </CardHeader>
            <div className="space-y-2">
              <select
                name="reservationId"
                defaultValue={preselected.id}
                required
                className="block w-full min-h-11 rounded-md border border-zinc-300 px-3 py-2 text-base shadow-sm focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
              >
                {candidates.map((r) => (
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
                    {" · "}
                    {formatHHMM(r.durationMin)}
                  </option>
                ))}
              </select>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vol</CardTitle>
            </CardHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="depAirport" required>Aéroport départ (OACI)</Label>
                <Input
                  id="depAirport"
                  name="depAirport"
                  type="text"
                  required
                  maxLength={4}
                  list="airports-list"
                  placeholder="LFPN"
                  className="uppercase"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="arrAirport" required>Aéroport arrivée (OACI)</Label>
                <Input
                  id="arrAirport"
                  name="arrAirport"
                  type="text"
                  required
                  maxLength={4}
                  list="airports-list"
                  placeholder="LFPN"
                  className="uppercase"
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
                <Label htmlFor="durationStr" required>Durée réelle</Label>
                <Input
                  id="durationStr"
                  name="durationStr"
                  type="text"
                  required
                  inputMode="numeric"
                  placeholder="ex : 1h30"
                />
                <p className="text-xs text-zinc-500">
                  HH:MM ou minutes (ex : <code>1h30</code>, <code>1:30</code>, <code>90</code>)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="landings" required>Atterrissages</Label>
                <Input
                  id="landings"
                  name="landings"
                  type="number"
                  required
                  inputMode="numeric"
                  defaultValue={1}
                  min={1}
                  max={99}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="engineStart">Heure départ moteur</Label>
                <Input
                  id="engineStart"
                  name="engineStart"
                  type="time"
                  step="60"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="engineStop">Heure arrêt moteur</Label>
                <Input
                  id="engineStop"
                  name="engineStop"
                  type="time"
                  step="60"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="remarks">Remarques</Label>
                <textarea
                  id="remarks"
                  name="remarks"
                  rows={3}
                  maxLength={2000}
                  className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-base shadow-sm focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Photos du carnet de bord</CardTitle>
              <CardDescription>
                Joignez 1 à 5 photos. Les fichiers sont uploadés directement sur le
                stockage privé Cloudflare R2 — le serveur ne voit jamais les bytes.
              </CardDescription>
            </CardHeader>
            <PhotoUpload name="photoKeys" />
          </Card>

          <div className="flex justify-end">
            <Button type="submit">Enregistrer le vol</Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
