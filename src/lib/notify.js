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

/* public/sw.js reads these same names; change them together or the worker goes quiet. */
export const RECAP_CACHE = "vyay-digest";
const RECAP_KEY = "__vyay-digest.json";
const SYNC_TAG = "vyay-daily-recap";
/*
 * The payment reminder keeps its own record and tag in the same cache. A separate key
 * matters: both records are read, merged and written back, and two hooks doing that to
 * one entry at the same moment would each drop the other's half. A separate tag lets
 * the reminder sit beside the recap instead of replacing it.
 */
const DUES_KEY = "__vyay-dues.json";
const DUES_TAG = "vyay-payment-due";

const LOCAL_KEYS = { [RECAP_KEY]: "vyay:digest", [DUES_KEY]: "vyay:dues" };
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
const memory = {};

async function readRecord(key = RECAP_KEY) {
  const held = memory[key] || {};
  try {
    if (hasCaches()) {
      const hit = await (await caches.open(RECAP_CACHE)).match(key);
      return hit ? await hit.json() : held;
    }
    return JSON.parse(localStorage.getItem(LOCAL_KEYS[key]) || "null") || held;
  } catch (e) { return held; }
}

async function writeRecord(patch, key = RECAP_KEY) {
  const next = { ...(await readRecord(key)), ...patch };
  memory[key] = next;
  try {
    if (hasCaches()) {
      const body = new Response(JSON.stringify(next), { headers: { "Content-Type": "application/json" } });
      await (await caches.open(RECAP_CACHE)).put(key, body);
    } else {
      localStorage.setItem(LOCAL_KEYS[key], JSON.stringify(next));
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

/**
 * The payment reminder's copy of the same arrangement. `days` maps a date to its
 * { title, body }, published a week ahead so a closed app still has the words; a date
 * with nothing due is simply absent, and the worker stays quiet for it.
 */
export const publishDues = ({ enabled, days }) => writeRecord({ enabled, days }, DUES_KEY);
export const lastDueSent = async () => (await readRecord(DUES_KEY)).sent || "";
export const markDueSent = (date) => writeRecord({ sent: date }, DUES_KEY);

async function show(title, options) {
  if (permissionState() !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;
    await registration.showNotification(title, {
      icon: new URL("icon-192.png", document.baseURI).href,
      badge: new URL("icon-192.png", document.baseURI).href,
      ...options,
    });
    return true;
  } catch (e) { return false; }
}

/** Post the notification. False means it could not be shown and the caller should say it in the app. */
// One recap at a time: a new one replaces yesterday's rather than stacking up.
export const showRecap = ({ title, body, date }) => show(title, { body, tag: SYNC_TAG, data: { date } });

/** The payment reminder. A tap opens the recurring list rather than a day. */
export const showDues = ({ title, body }) => show(title, { body, tag: DUES_TAG, data: { open: "recurring" } });

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
