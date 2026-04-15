// FlightSchedule — /flights — pilot flight entry form and history.
//
// This is now the canonical pilot route for flight entry. The former
// /flights/new path only redirects here for compatibility.

import { PencilLine } from "lucide-react";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { parisLocalDateString } from "@/lib/format";
import { COPY } from "@/lib/copy";
import { COMMON_AIRPORTS } from "@/lib/airports";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";
import { PhotoUpload } from "@/components/flights/PhotoUpload";
import { FlightTimeFields } from "@/components/flights/FlightTimeFields";
import { FlightHistory } from "@/components/flights/FlightHistory";
import { OnboardingHint } from "@/components/onboarding/OnboardingHint";
import { submitFlight } from "./new/actions";

export default async function FlightsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; msg?: string; added?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const defaultFlightDate = parisLocalDateString(new Date());

  // The "vols immuables" hint only makes sense once the pilot has at
  // least one flight to worry about. Cheap count, kept off the
  // FlightHistory child to keep its API single-purpose.
  const flightCount = await prisma.flight.count({
    where: { userId: session.user.id },
  });

  const errorBanner =
    sp.error === "too_many_photos"
      ? "Maximum 5 photos par vol."
      : sp.error === "bad_photo_key"
        ? "Photo invalide ou n'appartenant pas à votre compte."
        : sp.error === "photo_missing"
          ? "Une photo n'a pas été trouvée sur le serveur. Réessayez."
          : sp.error === "engine"
            ? sp.msg ?? "Heures bloc OFF / bloc ON invalides."
            : sp.error === "invalid"
              ? COPY.errors.invalidInput
              : sp.error === "no_active_type"
                ? sp.msg ??
                  "Aucun forfait actif — contactez l'administrateur avant de saisir un vol."
                : null;

  const justAdded = sp.added === "1";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <header className="mb-10">
          <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            Saisie
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-text-strong sm:text-5xl">
            {COPY.nav.newFlight}
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
              Vol enregistré. Retrouvez-le dans votre historique ci-dessous.
            </Alert>
          </div>
        )}

        <div className="mb-6">
          <OnboardingHint
            hintKey="fs:hint:flights-engine-times"
            title={COPY.onboarding.hintFlightsEngineTitle}
          >
            {COPY.onboarding.hintFlightsEngineBody}
          </OnboardingHint>
        </div>

        <form action={submitFlight} className="space-y-6">
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
                  max={defaultFlightDate}
                  className="tabular"
                />
                <p className="text-xs text-text-subtle">
                  Date à laquelle le vol a eu lieu (pas de vol dans le futur).
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

              <FlightTimeFields />

              <div className="space-y-2">
                <Label htmlFor="tachyStart">TACHY départ</Label>
                <Input
                  id="tachyStart"
                  name="tachyStart"
                  type="text"
                  inputMode="decimal"
                  placeholder="1234.56"
                  pattern="\d{1,6}([.,]\d{1,2})?"
                  className="tabular"
                />
                <p className="text-xs text-text-subtle">
                  Relevé horamètre au bloc OFF (optionnel).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tachyStop">TACHY arrivée</Label>
                <Input
                  id="tachyStop"
                  name="tachyStop"
                  type="text"
                  inputMode="decimal"
                  placeholder="1235.12"
                  pattern="\d{1,6}([.,]\d{1,2})?"
                  className="tabular"
                />
                <p className="text-xs text-text-subtle">
                  Relevé horamètre au bloc ON (optionnel).
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

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="remarks">Remarques</Label>
                <Textarea
                  id="remarks"
                  name="remarks"
                  rows={3}
                  maxLength={2000}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Photos du vol</Label>
                <PhotoUpload name="photoKeys" />
              </div>
            </div>
          </Card>

          <div className="flex justify-end">
            <SubmitButton size="lg" pendingLabel="Enregistrement…">
              Enregistrer le vol
            </SubmitButton>
          </div>
        </form>

        {flightCount > 0 && (
          <div className="mt-10">
            <OnboardingHint
              hintKey="fs:hint:flights-immutable"
              title={COPY.onboarding.hintFlightsImmutableTitle}
            >
              {COPY.onboarding.hintFlightsImmutableBody}
            </OnboardingHint>
          </div>
        )}

        <FlightHistory userId={session.user.id} />
      </div>
    </AppShell>
  );
}
