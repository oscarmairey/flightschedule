// FlightSchedule — /flights — pilot flight entry form and history.
//
// This is now the canonical pilot route for flight entry. The former
// /flights/new path only redirects here for compatibility.
//
// The form itself lives in `<NewFlightForm>` (client component) so it
// can hold field state across server-side validation errors and show
// a confirmation dialog before submitting. This page stays a server
// component for the success-flash banner and for the FlightHistory
// fetch below.

import { PencilLine } from "lucide-react";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { parisLocalDateString } from "@/lib/format";
import { COPY } from "@/lib/copy";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/AppShell";
import { NewFlightForm } from "@/components/flights/NewFlightForm";
import { FlightHistory } from "@/components/flights/FlightHistory";
import { OnboardingHint } from "@/components/onboarding/OnboardingHint";

export default async function FlightsPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string }>;
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

        {justAdded && (
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

        <NewFlightForm defaultFlightDate={defaultFlightDate} />

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
