// FlightSchedule service worker — minimal PWA shell.
//
// This SW exists to make the app installable and to give users a graceful
// offline screen. It deliberately does NOT cache pages, API responses, or
// photos, because:
//   - All meaningful pages are auth-protected and dynamic (HDV balance,
//     reservations, flights). Stale caches would lie to pilots.
//   - Photos go through presigned R2 URLs that expire — caching is unsafe.
//   - The Stripe webhook and auth endpoints must always hit the network.
//
// Strategy:
//   - Pre-cache an offline shell + the PWA icons on install.
//   - Network-first for navigation; on failure, serve /offline.html.
//   - Cache-first for the precached static assets.
//   - Pass-through for everything else.
//
// Bump CACHE_VERSION on any change to the precache list to force eviction
// on the next page load.

const CACHE_VERSION = "flightschedule-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [OFFLINE_URL, "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Never touch non-GET requests (auth POSTs, Stripe webhook, form actions).
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Same-origin only — never proxy R2 photo URLs or any third party.
  if (url.origin !== self.location.origin) return;

  // Navigation requests: network-first, fall back to the offline shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached || Response.error();
      })
    );
    return;
  }

  // Precached static assets: cache-first.
  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Everything else: pass through, no caching.
});
