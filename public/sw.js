// Service worker: precache degli asset statici dell'app shell + runtime cache
// per gli asset immutabili di Next. I contenuti autenticati (pagine, payload
// RSC, API, Supabase) NON vengono mai cachati.
const VERSION = "v1";
const STATIC_CACHE = `static-${VERSION}`;

const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/favicon.ico",
  "/apple-icon.png",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** True se la richiesta è un asset statico cacheabile in sicurezza. */
function isStaticAsset(url) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/_next/image")) return true;
  return PRECACHE_URLS.includes(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Solo stessa origine; mai API, mai payload RSC (header RSC) — quelli vanno
  // sempre in rete per non servire dati autenticati stantii.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (request.headers.get("RSC") === "1") return;

  if (isStaticAsset(url)) {
    // Cache-first: gli asset /_next/static/ hanno hash nel nome, immutabili.
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return res;
          }),
      ),
    );
  }
  // Tutto il resto (navigazioni, dati): network-only, pass-through.
});
