// FlightSchedule — first-visit contextual hint banner.
//
// Renders an info-toned Alert with a "Compris" dismiss button. Whether
// the hint shows is decided client-side from localStorage so we never
// need a per-pilot DB read to know "have they seen this yet" — the
// /welcome flow handled the load-bearing teaching, these are quieter
// nudges per browser.
//
// State machine:
//   1. Mount → return null (server has no idea what localStorage says,
//      so any SSR'd state would mismatch on hydration).
//   2. After useEffect reads localStorage:
//        - "dismissed" → stays hidden forever for this browser
//        - missing → show (first visit)
//   3. Click "Compris" → write "dismissed", hide.
//
// We never persist a "shown" state — only explicit dismissal. So a pilot
// who clears storage gets the hints again, which is the right behaviour
// for a per-browser nudge (the welcome flow + DB flag handle the
// per-account teaching).

"use client";

import { useSyncExternalStore, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { COPY } from "@/lib/copy";

type Props = {
  /** Stable storage key, e.g. "fs:hint:calendar-booking". */
  hintKey: string;
  title: ReactNode;
  children: ReactNode;
};

const DISMISSED = "dismissed";

// Keep a no-op subscribe — we don't need cross-tab reactivity here, the
// dismissal is a one-shot per browser. The point of useSyncExternalStore
// is that it gives us a SSR-safe boolean ("dismissed in storage?") without
// the setState-in-effect anti-pattern. Server snapshot returns true so the
// initial server render hides the hint; client snapshot reads localStorage.
const subscribe = () => () => {};
const getServerSnapshot = () => true;

function makeReadDismissed(hintKey: string) {
  return () => {
    try {
      return localStorage.getItem(hintKey) === DISMISSED;
    } catch {
      return false;
    }
  };
}

export function OnboardingHint({ hintKey, title, children }: Props) {
  const storedDismissed = useSyncExternalStore(
    subscribe,
    makeReadDismissed(hintKey),
    getServerSnapshot,
  );
  // Track in-session dismissal so the click hides the banner immediately
  // without waiting for a re-read. Reset implicitly when hintKey changes.
  const [sessionDismissed, setSessionDismissed] = useState(false);

  if (storedDismissed || sessionDismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(hintKey, DISMISSED);
    } catch {
      // ignore — at worst the hint reappears next page load
    }
    setSessionDismissed(true);
  };

  return (
    <Alert
      tone="info"
      title={title}
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={dismiss}
          aria-label={COPY.onboarding.hintDismiss}
        >
          {COPY.onboarding.hintDismiss}
        </Button>
      }
    >
      {children}
    </Alert>
  );
}
