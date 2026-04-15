// FlightSchedule — first-run onboarding for new pilots.
//
// Renders right after /setup-password. Three vertically-scrolled cards
// teach the load-bearing concepts in ~1 minute, then a final CTA marks
// the flow done and routes the pilot straight to /calendar to make
// their first booking (the aha moment).
//
// Admins skip onboarding by default. They only see this page when they
// explicitly clear their own flag via the "Rejouer l'onboarding" button
// on /admin/pilots — used to walk a pilot through the flow over the
// phone.

import { redirect } from "next/navigation";
import { Wallet, CalendarCheck, PlaneTakeoff } from "lucide-react";
import Image from "next/image";
import { auth } from "@/auth";
import { COPY } from "@/lib/copy";
import { WelcomeCard } from "@/components/onboarding/WelcomeCard";
import { completeOnboarding, skipOnboarding } from "./actions";

const TOTAL_STEPS = 3;

export default async function WelcomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.mustResetPw) redirect("/setup-password");
  // Already onboarded → don't replay (admins who explicitly cleared
  // their own flag pass this guard because their timestamp is null).
  if (session.user.onboardingCompletedAt) redirect("/dashboard");

  return (
    <main className="relative min-h-screen bg-surface px-4 py-10 sm:px-6 sm:py-14">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-32 right-0 h-[420px] w-[420px] rounded-full bg-brand-soft opacity-60 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-md">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg ring-1 ring-border-subtle shadow-xs"
              priority
            />
            <span className="font-display text-xl font-semibold tracking-tight text-text-strong">
              {COPY.brand.name}
            </span>
          </div>
          <form action={skipOnboarding}>
            <button
              type="submit"
              className="text-sm font-medium text-text-muted transition-colors hover:text-text"
            >
              {COPY.onboarding.skip}
            </button>
          </form>
        </div>

        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
            {COPY.onboarding.welcomeEyebrow}
          </p>
          <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-text-strong sm:text-4xl">
            {COPY.onboarding.welcomeTitle}
          </h1>
          <p className="mt-2 text-base text-text-muted">
            {COPY.onboarding.welcomeIntro}
          </p>
        </header>

        <div className="space-y-6">
          <WelcomeCard
            step={1}
            totalSteps={TOTAL_STEPS}
            id="card-1"
            icon={Wallet}
            title={COPY.onboarding.card1Title}
            ctaLabel={COPY.onboarding.next}
            ctaHref="#card-2"
          >
            <p>{COPY.onboarding.card1Body}</p>
            <p className="font-medium text-text">
              {COPY.onboarding.card1TiersLead}
            </p>
            <ul className="space-y-1.5">
              <li className="flex items-baseline gap-2.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full bg-success"
                />
                <span>{COPY.onboarding.card1TierGreen}</span>
              </li>
              <li className="flex items-baseline gap-2.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full bg-warning"
                />
                <span>{COPY.onboarding.card1TierAmber}</span>
              </li>
              <li className="flex items-baseline gap-2.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full bg-danger"
                />
                <span>{COPY.onboarding.card1TierRed}</span>
              </li>
            </ul>
          </WelcomeCard>

          <WelcomeCard
            step={2}
            totalSteps={TOTAL_STEPS}
            id="card-2"
            icon={CalendarCheck}
            title={COPY.onboarding.card2Title}
            ctaLabel={COPY.onboarding.understood}
            ctaHref="#card-3"
          >
            <p>{COPY.onboarding.card2Body}</p>
          </WelcomeCard>

          <WelcomeCard
            step={3}
            totalSteps={TOTAL_STEPS}
            id="card-3"
            icon={PlaneTakeoff}
            title={COPY.onboarding.card3Title}
            ctaLabel={COPY.onboarding.finalCta}
            formAction={completeOnboarding}
          >
            <p>{COPY.onboarding.card3Body}</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>{COPY.onboarding.card3Rule3h}</li>
              <li>{COPY.onboarding.card3Rule24h}</li>
            </ul>
          </WelcomeCard>
        </div>
      </div>
    </main>
  );
}
