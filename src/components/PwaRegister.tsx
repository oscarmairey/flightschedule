"use client";

// Registers the service worker defined in `public/sw.js`.
//
// Renders nothing — kept as a tiny client component so the rest of the
// root layout can stay a server component. Failures are logged but never
// throw: a missing SW must not break the app for pilots.

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("FlightSchedule SW registration failed:", err);
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
