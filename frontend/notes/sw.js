const CACHE_NAME = "courses-shell-v2";
const APP_SHELL = [
  "/notes/",
  "/notes/index.html",
  "/notes/styles/notepad.css",
  "/notes/js/main.js",
  "/notes/js/editor.js",
  "/notes/js/socket.js",
  "/notes/js/alarm.js",
  "/notes/js/offline-queue.js",
  "/notes/manifest.webmanifest",
  "/notes/icons/icon-192.svg",
  "/notes/icons/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

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
        .catch(() => cached || caches.match("/notes/index.html"));

      return cached || networkFetch;
    }),
  );
});
