// FlightSchedule — admin-only "Rejouer l'onboarding" trigger.
//
// Two-step flow because localStorage and the DB live on opposite sides
// of the network:
//   1. Client clears the per-browser hint dismissals so all four
//      contextual hints fire fresh on the replay.
//   2. Form submits to `resetOwnOnboarding`, which nulls the admin's
//      onboardingCompletedAt, refreshes the JWT via `unstable_update`,
//      and redirects to /welcome.
//
// Scope is intentionally limited to the caller's OWN account. The
// server action enforces this — there is no "reset another pilot" path
// because admins handle that off-platform (over the phone, on the
// pilot's own browser if needed).

"use client";

import { useRef } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { COPY } from "@/lib/copy";
import { resetOwnOnboarding } from "@/app/welcome/actions";

const HINT_KEYS = [
  "fs:hint:dashboard-balance",
  "fs:hint:calendar-booking",
  "fs:hint:flights-engine-times",
  "fs:hint:flights-immutable",
] as const;

export function ReplayOnboardingButton() {
  const formRef = useRef<HTMLFormElement>(null);

  const handleClick = () => {
    try {
      for (const key of HINT_KEYS) {
        localStorage.removeItem(key);
      }
    } catch {
      // Storage disabled — the server reset still works; hints just
      // remain dismissed for this browser. Acceptable degradation.
    }
    formRef.current?.requestSubmit();
  };

  return (
    <form ref={formRef} action={resetOwnOnboarding}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleClick}
        title={COPY.onboarding.adminReplayHint}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {COPY.onboarding.adminReplay}
      </Button>
    </form>
  );
}
