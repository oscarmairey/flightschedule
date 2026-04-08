// FlightSchedule — Web App Manifest.
//
// Next.js App Router serves this as `/manifest.webmanifest` and auto-injects
// `<link rel="manifest">` into the document head. Combined with `public/sw.js`
// and the icons in `/public`, this is what makes FlightSchedule installable as
// a PWA on iOS / Android home screens.
//
// `start_url: "/"` is fine because the root page is a smart redirect
// (auth → /dashboard, otherwise → /login). The proxy still applies, so an
// installed PWA opened by an unauthenticated user lands cleanly on /login.

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FlightSchedule",
    short_name: "FlightSchedule",
    description:
      "L'app pour gérer simplement le planning de réservation de votre avion.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "fr",
    dir: "ltr",
    background_color: "#ffffff",
    theme_color: "#0b6bcb",
    categories: ["productivity", "lifestyle"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
