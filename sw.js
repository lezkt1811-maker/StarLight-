/* StarChart13 service worker — namespaced cache, app-shell caching so the
   site is installable and works offline for previously-visited pages. This
   file does not touch any of the site's existing JS/CSS/HTML logic. */

const SC13_CACHE = "starchart13-v1";
const SC13_SHELL = [
  "/",
  "/index.html",
  "/compare.js",
  "/reading-config.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SC13_CACHE).then((cache) => cache.addAll(SC13_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SC13_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Network-first for freshness, falling back to cache when offline. */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(SC13_CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
