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

/*
 * The daily recap. These three names match src/lib/notify.js. The page writes the
 * finished messages here; the worker only reads them, so it never sums anything and
 * never opens the app's own database. The key has no "./" on purpose: it is not a file,
 * and check-invariants reads every "./" string in the built worker as a precache entry.
 */
const RECAP_CACHE = "vyay-digest";
const RECAP_KEY = "__vyay-digest.json";
const RECAP_TAG = "vyay-daily-recap";
/* The payment reminder: its own record beside the recap's, and its own tag so it never replaces it. */
const DUES_KEY = "__vyay-dues.json";
const DUES_TAG = "vyay-payment-due";

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
      // The recap record is not a build artefact: deleting it with the old shell would
      // forget which day was already sent and post the same recap twice after an update.
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== RECAP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // caches.match below searches every cache, so it would otherwise answer for the two records.
  if (url.pathname.endsWith("/__vyay-digest.json") || url.pathname.endsWith("/__vyay-dues.json")) return;

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

/* ── the daily recap ───────────────────────────────────────────────────────── */

const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function sendRecap() {
  const cache = await caches.open(RECAP_CACHE);
  const hit = await cache.match(RECAP_KEY);
  if (!hit) return;
  const record = await hit.json();
  if (!record.enabled) return;

  const now = new Date();
  const target = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (record.since && target < record.since) return;
  if (record.sent && record.sent >= target) return;

  const message = (record.days && record.days[target]) || record.fallback;
  if (!message) return;

  // Mark it first: if showing fails, a missed recap is better than a repeated one.
  await cache.put(RECAP_KEY, new Response(JSON.stringify({ ...record, sent: target }),
    { headers: { "Content-Type": "application/json" } }));
  await self.registration.showNotification(message.title, {
    body: message.body, tag: RECAP_TAG, icon: "icon-192.png", badge: "icon-192.png", data: { date: target },
  });
}

/*
 * The payment reminder for today. The page publishes a week of messages ahead, so the
 * worker only looks up today's; a day with nothing due has no entry and stays silent.
 */
async function sendDues() {
  const cache = await caches.open(RECAP_CACHE);
  const hit = await cache.match(DUES_KEY);
  if (!hit) return;
  const record = await hit.json();
  if (!record.enabled) return;

  const target = isoDate(new Date());
  if (record.sent && record.sent >= target) return;
  const message = record.days && record.days[target];
  if (!message) return;

  await cache.put(DUES_KEY, new Response(JSON.stringify({ ...record, sent: target }),
    { headers: { "Content-Type": "application/json" } }));
  await self.registration.showNotification(message.title, {
    body: message.body, tag: DUES_TAG, icon: "icon-192.png", badge: "icon-192.png", data: { open: "recurring" },
  });
}

// Fired by the browser, at a time of its choosing, for an installed app with the page closed.
// One wake-up serves both, and each is caught alone so a failed recap cannot cost the reminder.
self.addEventListener("periodicsync", (event) => {
  if (event.tag === RECAP_TAG) {
    event.waitUntil(Promise.all([sendRecap().catch(() => {}), sendDues().catch(() => {})]));
  }
});

/*
 * A tap opens what the notification is about: the day a recap describes, or the
 * recurring list for a payment reminder. A running app is focused and told where to
 * go; otherwise a new window opens at ?day= or ?open=, which the app reads once and drops.
 */
self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  const date = data.date;
  event.notification.close();
  if (data.open) {
    event.waitUntil((async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (open.length) {
        try { await open[0].focus(); } catch (e) { /* focus can be refused; the message still lands */ }
        open[0].postMessage({ type: "VYAY_OPEN_SCREEN", screen: data.open });
        return;
      }
      const url = new URL("./", self.registration.scope);
      url.searchParams.set("open", data.open);
      await self.clients.openWindow(url.href);
    })());
    return;
  }
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (open.length) {
      const client = open[0];
      try { await client.focus(); } catch (e) { /* focus can be refused; the message still lands */ }
      client.postMessage({ type: "VYAY_OPEN_DAY", date });
      return;
    }
    const url = new URL("./", self.registration.scope);
    if (date) url.searchParams.set("day", date);
    await self.clients.openWindow(url.href);
  })());
});
