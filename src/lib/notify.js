/**
 * The daily recap, delivered without a server.
 *
 * Real push needs a push service and a backend holding subscriptions, and this app
 * talks to no network at all, so the recap is a local notification posted through the
 * service worker instead. It reaches the user three ways: a timer when the app is open
 * across midnight, a check whenever the app is opened or brought back, and Periodic
 * Background Sync where the browser offers it (an installed PWA on Chromium), which
 * wakes the worker with the app closed.
 *
 * The worker never works out a figure itself. The page writes the finished title and
 * body for yesterday and today into a small cache entry every time the data changes,
 * and the worker only reads it back. That keeps every sum in analytics.js and keeps
 * the worker out of the records, which only store.jsx may touch.
 */

/* public/sw.js reads these same three names; change them together or the worker goes quiet. */
export const RECAP_CACHE = "vyay-digest";
const RECAP_KEY = "__vyay-digest.json";
const SYNC_TAG = "vyay-daily-recap";

const LOCAL_KEY = "vyay:digest";
const DAY = 24 * 60 * 60 * 1000;

const hasCaches = () => typeof caches !== "undefined" && typeof window !== "undefined" && window.isSecureContext;

/** granted | denied | default | unsupported — the last when the browser has no notifications at all. */
export function permissionState() {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  if (!window.isSecureContext) return "unsupported";
  return Notification.permission;
}

/** Must run inside a tap: Safari and Firefox ignore a permission request made on their own. */
export async function askPermission() {
  if (permissionState() === "unsupported") return "unsupported";
  try { return await Notification.requestPermission(); }
  catch (e) { return permissionState(); }
}

/*
 * The shared record lives in Cache Storage because that is the one store both the page
 * and the worker can reach without going near the app's IndexedDB. Over plain http on
 * a LAN there is no Cache Storage and no worker either, so localStorage keeps the
 * once-a-day marker and the in-app fallback still works.
 *
 * When both throw (a file:// open, a private window), the copy held in memory is the
 * last resort, as in db.js. Without it the marker never stuck, and the recap toast came
 * back every time the tab was refocused instead of once a day.
 */
let memory = {};

async function readRecord() {
  try {
    if (hasCaches()) {
      const hit = await (await caches.open(RECAP_CACHE)).match(RECAP_KEY);
      return hit ? await hit.json() : memory;
    }
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "null") || memory;
  } catch (e) { return memory; }
}

async function writeRecord(patch) {
  const next = { ...(await readRecord()), ...patch };
  memory = next;
  try {
    if (hasCaches()) {
      const body = new Response(JSON.stringify(next), { headers: { "Content-Type": "application/json" } });
      await (await caches.open(RECAP_CACHE)).put(RECAP_KEY, body);
    } else {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    }
  } catch (e) { /* kept in memory only: at worst it repeats once per session */ }
  return next;
}

/**
 * Hand the worker the finished messages. `days` maps a date to { title, body };
 * `fallback` is what it shows for a day the page never saw, which can only be a day
 * nothing was logged, since logging anything runs the page.
 */
export const publishRecap = ({ enabled, since, days, fallback }) =>
  writeRecord({ enabled, since, days, fallback });

/** The last day a recap went out for, from either the page or the worker. */
export const lastSent = async () => (await readRecord()).sent || "";
export const markSent = (date) => writeRecord({ sent: date });

/** Post the notification. False means it could not be shown and the caller should say it in the app. */
export async function showRecap({ title, body, date }) {
  if (permissionState() !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;
    await registration.showNotification(title, {
      body,
      // One recap at a time: a new one replaces yesterday's rather than stacking up.
      tag: SYNC_TAG,
      icon: new URL("icon-192.png", document.baseURI).href,
      badge: new URL("icon-192.png", document.baseURI).href,
      data: { date },
    });
    return true;
  } catch (e) { return false; }
}

/**
 * Ask to be woken roughly twice a day with the app closed. The browser decides the
 * exact moment and only grants this to an installed app, so every failure here is
 * expected and silent: the open-the-app path still delivers the recap.
 */
export async function scheduleBackgroundRecap(on) {
  try {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration || !registration.periodicSync) return;
    if (!on) { await registration.periodicSync.unregister(SYNC_TAG); return; }
    const status = await navigator.permissions.query({ name: "periodic-background-sync" });
    if (status.state !== "granted") return;
    await registration.periodicSync.register(SYNC_TAG, { minInterval: DAY / 2 });
  } catch (e) { /* unsupported, or not installed */ }
}

/** Milliseconds until the next local midnight, plus a moment so the date has turned. */
export function msUntilMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  return next - now;
}
