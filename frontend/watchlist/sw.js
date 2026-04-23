const CACHE_NAME = "watchlist-shell-v3";
const APP_SHELL = [
  "/watchlist/",
  "/watchlist/index.html",
  "/watchlist/style.css",
  "/watchlist/app.js",
  "/watchlist/manifest.webmanifest",
  "/watchlist/icons/icon-192.svg",
  "/watchlist/icons/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          if (cached) return cached;
          const url = new URL(event.request.url);
          if (url.pathname.startsWith("/watchlist/api/")) {
            return new Response(JSON.stringify({ movies: [] }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            });
          }
          return caches.match("/watchlist/index.html");
        });

      return cached || networkFetch;
    })
  );
});
