// Home Suite root service worker — scope: /
// Only caches homepage assets; sub-apps have their own SWs.

const CACHE = "home-suite-v6";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/home.js",
  "/weather.js",
  "/weather-bg.js",
  "/home.png",
  "/legacy",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Sub-app SWs handle their own scopes
  if (
    url.pathname.startsWith("/home-radar/") ||
    url.pathname.startsWith("/notes/") ||
    url.pathname.startsWith("/watchlist/") ||
    url.pathname.startsWith("/draw/")
  ) {
    return;
  }

  // External APIs (Open-Meteo) go directly to network — never cache
  if (url.hostname !== self.location.hostname) return;

  // Shared ES modules must stay fresh (exports change); avoid stale import errors
  if (url.pathname.startsWith("/shared/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) => cached || fetch(event.request).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone));
        }
        return res;
      })
    )
  );
});
