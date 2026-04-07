// FlySchedule — /flights/new — pilot flight entry form.
//
// V1.1: a reservation can hold any number of flights. The pilot can come
// back to this page and "ajouter un vol" against any past reservation,
// even one that already has flights logged against it.

import Link from "next/link";
import { PencilLine } from "lucide-react";
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
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";
import { PhotoUpload } from "@/components/flights/PhotoUpload";
import { submitFlight } from "./actions";

const TZ = "Europe/Paris";

export default async function NewFlightPage({
  searchParams,
}: {
  searchParams: Promise<{ reservation?: string; error?: string; added?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  // Reservations the pilot can attach a flight to: own + confirmed + already
  // started. There is no "no existing flight" filter — a reservation can hold
  // any number of flights (multi-leg trips). The dropdown surfaces the
  // current count so the pilot knows they're adding to an existing slot.
  const candidates = await prisma.reservation.findMany({
    where: {
      userId: session.user.id,
      status: "CONFIRMED",
      startsAt: { lte: new Date() },
    },
    orderBy: { startsAt: "desc" },
    take: 20,
    include: { _count: { select: { flights: true } } },
  });

  if (candidates.length === 0) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            {COPY.nav.newFlight}
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            Aucune réservation passée
          </h1>
          <Card tone="sunken" className="mt-8">
            <p className="text-sm leading-relaxed text-text-muted">
              Pour saisir un vol, vous devez avoir au moins une réservation
              déjà commencée. Réservez d&apos;abord un créneau, effectuez
              votre vol, puis revenez ici.
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
              : sp.error === "bad_duration"
                ? "Durée invalide. Format attendu : 1h30 ou 90."
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
            Saisie de vol
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-text-muted">
            Reportez les informations de votre vol et joignez les photos du
            carnet de bord papier. L&apos;administrateur validera la saisie
            sous peu.
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
              Vol enregistré. Vous pouvez en ajouter un autre sur la même
              réservation, ou{" "}
              <Link href="/flights" className="font-semibold underline">
                voir vos vols
              </Link>
              .
            </Alert>
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
            <select
              name="reservationId"
              defaultValue={preselected.id}
              required
              className="block w-full min-h-11 rounded-md border border-border bg-surface-elevated px-3.5 py-2 text-base text-text shadow-xs focus:border-brand focus:outline-none"
            >
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
                    {" · "}
                    {formatHHMM(r.durationMin)}
                    {existing > 0
                      ? ` · ${existing} vol${existing > 1 ? "s" : ""} déjà saisi${existing > 1 ? "s" : ""}`
                      : ""}
                  </option>
                );
              })}
            </select>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vol</CardTitle>
            </CardHeader>
            <div className="grid gap-5 sm:grid-cols-2">
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
                <Label htmlFor="durationStr" required>
                  Durée réelle
                </Label>
                <Input
                  id="durationStr"
                  name="durationStr"
                  type="text"
                  required
                  inputMode="numeric"
                  placeholder="ex : 1h30"
                  className="tabular"
                />
                <p className="text-xs text-text-subtle">
                  HH:MM ou minutes (ex&nbsp;:{" "}
                  <code className="rounded bg-surface-sunken px-1 py-0.5 tabular">
                    1h30
                  </code>
                  ,{" "}
                  <code className="rounded bg-surface-sunken px-1 py-0.5 tabular">
                    1:30
                  </code>
                  ,{" "}
                  <code className="rounded bg-surface-sunken px-1 py-0.5 tabular">
                    90
                  </code>
                  )
                </p>
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

              <div className="space-y-2">
                <Label htmlFor="engineStart">Heure départ moteur</Label>
                <Input
                  id="engineStart"
                  name="engineStart"
                  type="time"
                  step="60"
                  className="tabular"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="engineStop">Heure arrêt moteur</Label>
                <Input
                  id="engineStop"
                  name="engineStop"
                  type="time"
                  step="60"
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
                1 à 5 photos. Uploadées directement sur le stockage privé
                Cloudflare R2 — le serveur ne voit jamais les fichiers.
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
      </div>
    </AppShell>
  );
}
