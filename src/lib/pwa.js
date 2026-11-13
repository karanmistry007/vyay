/**
 * Service worker registration and update handling.
 *
 * Registration only happens over http(s); opening the built files straight from
 * disk still runs the app, just without the offline cache.
 */
export function registerServiceWorker({ onUpdateReady, onOfflineReady } = {}) {
  if (!("serviceWorker" in navigator) || !window.location.protocol.startsWith("http")) return;

  const url = new URL("sw.js", document.baseURI).href;

  navigator.serviceWorker.register(url).then((registration) => {
    if (!navigator.serviceWorker.controller) {
      // First visit: once this worker activates, everything is cached.
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "activated" && onOfflineReady) onOfflineReady();
        });
      });
    }

    const notifyIfWaiting = () => {
      if (registration.waiting && navigator.serviceWorker.controller && onUpdateReady) {
        onUpdateReady(() => {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        });
      }
    };

    notifyIfWaiting();
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed") notifyIfWaiting();
      });
    });

    // Look for a new build when the app is brought back to the foreground.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") registration.update().catch(() => {});
    });
  }).catch(() => { /* offline caching is optional, the app still runs */ });

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

/**
 * Ask the browser to look for a new build now.
 * Returns what happened so the caller can say something specific:
 *   unsupported | not-registered | ready (with apply) | downloading | current
 */
export async function checkForUpdate() {
  if (!("serviceWorker" in navigator)) return { state: "unsupported" };
  if (!window.location.protocol.startsWith("http")) return { state: "unsupported" };

  let registration;
  try { registration = await navigator.serviceWorker.getRegistration(); }
  catch (e) { return { state: "unsupported" }; }
  if (!registration) return { state: "not-registered" };

  const waiting = () => registration.waiting;
  const applyNow = () => { if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" }); };

  if (waiting()) return { state: "ready", apply: applyNow };

  try { await registration.update(); }
  catch (e) { return { state: "offline" }; }

  if (waiting()) return { state: "ready", apply: applyNow };
  if (registration.installing) {
    // Give the new worker a moment to finish installing before answering.
    const installed = await new Promise((resolve) => {
      const worker = registration.installing;
      const done = () => {
        if (worker.state === "installed" || worker.state === "activated") resolve(true);
        else if (worker.state === "redundant") resolve(false);
      };
      worker.addEventListener("statechange", done);
      setTimeout(() => resolve(!!registration.waiting), 6000);
    });
    if (installed && registration.waiting) return { state: "ready", apply: applyNow };
    return { state: "downloading" };
  }
  return { state: "current" };
}

/** Whether the offline cache is in place, for showing status in the app. */
export async function offlineStatus() {
  if (!("serviceWorker" in navigator)) return { supported: false, ready: false, reason: "This browser has no service worker support." };
  if (!window.location.protocol.startsWith("http")) return { supported: true, ready: false, reason: "Open the app over http or https to enable offline mode." };
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration || !registration.active) return { supported: true, ready: false, reason: "Not cached yet. Reload once while online." };
    return { supported: true, ready: true, reason: "Every file is cached on this device." };
  } catch (e) {
    return { supported: true, ready: false, reason: "Offline cache could not be checked." };
  }
}

/** Subscribe to connection changes. The app itself needs no network, this is only for display. */
export function watchConnection(callback) {
  const emit = () => callback(navigator.onLine);
  window.addEventListener("online", emit);
  window.addEventListener("offline", emit);
  emit();
  return () => {
    window.removeEventListener("online", emit);
    window.removeEventListener("offline", emit);
  };
}
