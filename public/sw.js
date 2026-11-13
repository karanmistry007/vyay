/**
 * Vyay offline shell.
 *
 * The asset list and cache name below are rewritten at build time by
 * scripts/build-sw.mjs, which knows the hashed filenames Vite produced. That means
 * a fresh install pulls every file it needs in one go and the app opens with no
 * connection from then on.
 */
const CACHE = "__VERSION__";
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  // No skipWaiting here on purpose: a new build must not swap itself in underneath
  // someone who is halfway through typing a transaction. The page asks for it instead.
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Single-page app: every navigation is answered by the cached shell, so it works
  // in a tunnel, on a plane, or with the laptop that served it switched off.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then((cached) =>
        cached || fetch(request).catch(() => caches.match("./index.html"))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
