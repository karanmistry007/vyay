/**
 * Voice input that never leaves the device.
 *
 * Browsers have offered speech recognition for years, but Chrome's long-standing version sends
 * the microphone to Google's servers to transcribe it, and nothing on the page can see or stop
 * that: it is the browser's own request, so the Content-Security-Policy does not apply to it.
 * Vyay promises that nothing about your money leaves the phone (invariant 1), and "I spent 4,000
 * at the pharmacy" is exactly that. So voice is offered only where the page can require
 * recognition on the device — the Web Speech API's `processLocally` — which makes the browser
 * fail rather than fall back to a server. Where that is missing, there is no voice button at
 * all; the keyboard's own dictation still works in the text box, and that is the person's
 * keyboard, set up by them, not this app.
 *
 * Everything that turns the words into a transaction lives in quickParse.js and is pure. This
 * module only gets the words.
 */

import { APP_BUILD } from "./version.js";

const Recognition = () => (typeof window === "undefined" ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null);

/** English locales to try, most specific first. The parser reads English. */
export function speechLangs(currency) {
  const own = typeof navigator === "undefined" ? [] : (navigator.languages || [navigator.language]).filter((l) => /^en\b/i.test(l || ""));
  const extra = currency === "INR" ? ["en-IN", "en-US", "en-GB"] : ["en-US", "en-GB", "en-IN"];
  return [...new Set([...own, ...extra])];
}

/* Asking costs a round trip into the browser, so ask once per set of languages. */
const asked = new Map();

/**
 * Whether voice can be offered here, and in which language.
 *   { state: "ready", lang }          on-device recognition is installed
 *   { state: "downloadable", lang }   the browser can fetch its speech model once, on request
 *   { state: "downloading", lang }    it is already fetching it
 *   { state: "off" }                  only server-side recognition, or none: no voice
 */
export function voiceSupport(langs, { fresh = false } = {}) {
  const key = langs.join(",");
  if (!fresh && asked.has(key)) return asked.get(key);
  const p = probe(langs).catch(() => ({ state: "off" }));
  asked.set(key, p);
  return p;
}

async function probe(langs) {
  const SR = Recognition();
  if (!SR || typeof SR.available !== "function") return { state: "off" };
  let probeInstance;
  try { probeInstance = new SR(); } catch { return { state: "off" }; }
  if (!("processLocally" in probeInstance)) return { state: "off" };

  const results = [];
  for (const lang of langs) {
    let a = "unavailable";
    try { a = await SR.available({ langs: [lang], processLocally: true }); } catch { /* treated as unavailable */ }
    if (a === "available") return { state: "ready", lang };
    results.push({ lang, a });
  }
  const dl = results.find((r) => r.a === "downloading");
  if (dl) return { state: "downloading", lang: dl.lang };
  const can = results.find((r) => r.a === "downloadable");
  if (can) return { state: "downloadable", lang: can.lang };
  return { state: "off" };
}

/**
 * Ask the browser to fetch its on-device model for `lang`. This is the one network request
 * voice ever causes, it is the browser's own component download, and it only happens when
 * the person taps the button that says so. Must be called from that tap.
 */
export async function installVoice(lang) {
  const SR = Recognition();
  if (!SR || typeof SR.install !== "function") return false;
  try { return !!(await SR.install({ langs: [lang], processLocally: true })); } catch { return false; }
}

/*
 * Keeping the model current across app updates. The browser owns the speech model and updates
 * it on its own schedule; a page cannot replace it. What a page can do is ask, and `install()`
 * on a model that is already there is how it asks: the browser fetches a newer one if it has
 * one, and otherwise answers at once. So the first time the mic is used after each new build
 * (an app update reloads the page, which is what makes this run), it asks once and remembers
 * the build that asked. Per device, so localStorage, the same way notify.js keeps its marks.
 */
const MODEL_MARK = "vyay-voice-model";
const markFor = (lang) => `${APP_BUILD}|${lang}`;

export function modelNeedsRefresh(lang) {
  try { return localStorage.getItem(MODEL_MARK) !== markFor(lang); } catch { return false; }
}

/**
 * Ask the browser to bring the model for `lang` up to date, waiting at most `waitMs` so the
 * person is never kept from speaking by a slow download, which carries on by itself. Call it
 * from the tap: browsers may refuse an install without one, and then it is simply asked again
 * next time.
 */
export async function refreshVoiceModel(lang, waitMs = 4000) {
  let timer;
  const ok = await Promise.race([
    installVoice(lang),
    new Promise((done) => { timer = setTimeout(() => done(null), waitMs); }),
  ]);
  clearTimeout(timer);
  if (ok === true) { try { localStorage.setItem(MODEL_MARK, markFor(lang)); } catch { /* private window: ask again next time */ } }
  return ok;
}

/**
 * Listen for one sentence. Interim words arrive through `onInterim`; the finished sentence
 * arrives once through `onFinal` as the recogniser's alternatives, best first. `onEnd` always
 * fires last, whatever happened. Returns { stop, abort }.
 */
export function listen(lang, { onInterim, onFinal, onError, onEnd }) {
  const SR = Recognition();
  const noop = { stop() {}, abort() {} };
  if (!SR) { onError("not-local"); onEnd(); return noop; }

  const r = new SR();
  try { r.processLocally = true; } catch { /* checked below */ }
  /* Belt and braces: if the browser did not accept the requirement, do not start at all. */
  if (r.processLocally !== true) { onError("not-local"); onEnd(); return noop; }

  r.lang = lang;
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 3;

  let finished = false;
  r.onresult = (e) => {
    const results = Array.from(e.results);
    if (!results.length) return;
    if (results.every((x) => x.isFinal)) {
      if (finished) return;
      finished = true;
      const head = results.slice(0, -1).map((x) => x[0].transcript).join(" ");
      const alts = Array.from(results[results.length - 1])
        .map((a) => `${head} ${a.transcript}`.trim())
        .filter(Boolean);
      if (alts.length) onFinal(alts);
    } else {
      onInterim(results.map((x) => x[0].transcript).join(" "));
    }
  };
  r.onerror = (e) => onError((e && e.error) || "unknown");
  r.onend = () => onEnd();

  try { r.start(); } catch { onError("busy"); onEnd(); return noop; }
  return {
    stop() { try { r.stop(); } catch { /* already stopped */ } },
    abort() { try { r.abort(); } catch { /* already stopped */ } },
  };
}

/** What to tell the person when listening fails; null when there is nothing worth saying. */
export function voiceErrorText(code) {
  switch (code) {
    case "aborted": return null;
    case "no-speech": return "Didn't hear anything. Tap the mic and try again.";
    case "not-allowed":
    case "service-not-allowed": return "Microphone access is blocked. Allow it for this site in your browser's settings.";
    case "audio-capture": return "No microphone was found.";
    case "language-not-supported":
    case "not-local": return "On-device speech isn't available in this browser, so voice is off. Typing works the same.";
    case "busy": return "The microphone is busy. Try again in a moment.";
    default: return "Voice input stopped. You can type it instead.";
  }
}
