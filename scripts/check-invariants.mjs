/**
 * Enforce the invariants in CLAUDE.md that a machine can actually check.
 *
 * Each rule below exists because breaking it caused a real bug, and most of them break
 * silently: a stray fetch still renders, a version mismatch still builds, a second place
 * reading db.js still works right up until two writers disagree. The five test scripts
 * check the arithmetic; this one checks the promises.
 *
 * Not everything belongs here. That every amount passes round2() on the way into the
 * database, and that ledger rows carry the right `account` and `ex` semantics, still needs
 * the ledger-auditor agent reading an actual diff. This file only claims the rules that can
 * be decided by reading the source, so a green run is never mistaken for a full audit.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const problems = [];
const notes = [];

const rel = (p) => relative(ROOT, p).split(sep).join("/");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sourceFiles = walk(join(ROOT, "src")).filter((f) => /\.(js|jsx)$/.test(f));

/* ----------------------------------------------------------------------- *
 * Invariant 1 — no network, ever.
 *
 * No fetch, no CDN, no analytics, no Google Fonts; the typeface is bundled. The only
 * fetch in the repo is the service worker's cache handler in public/sw.js, which is why
 * that file is not scanned here. A dependency that phones home breaks the core promise.
 * ----------------------------------------------------------------------- */

/* Namespace URLs are declarations, not requests, so they are not traffic. */
const URL_ALLOW = [/https?:\/\/(www\.)?w3\.org/, /https?:\/\/localhost/, /https?:\/\/127\.0\.0\.1/];
const NETWORK_API = /\b(fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|new\s+WebSocket|new\s+EventSource|importScripts\s*\()/;

for (const file of [...sourceFiles, join(ROOT, "index.html")]) {
  if (!existsSync(file)) continue;
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const where = `${rel(file)}:${i + 1}`;
    const api = line.match(NETWORK_API);
    if (api) {
      problems.push(`[no network] ${where} calls ${api[1].trim()} — only public/sw.js may touch the network.`);
    }
    const url = line.match(/https?:\/\/[^\s"'`)]+/);
    if (url && !URL_ALLOW.some((ok) => ok.test(url[0]))) {
      problems.push(`[no network] ${where} references ${url[0]} — no CDN, no remote font, no analytics.`);
    }
  });
}

/*
 * Speech recognition is the one browser API that can send what a person says to a server
 * without the page making any request the CSP could refuse. It is allowed in exactly one
 * module, and only while that module still requires recognition on the device.
 */
const VOICE_OWNER = "src/lib/voice.js";
for (const file of sourceFiles) {
  const path = rel(file);
  const src = readFileSync(file, "utf8");
  if (path !== VOICE_OWNER && /\b(webkit)?SpeechRecognition\b/.test(src)) {
    problems.push(`[no network] ${path} touches SpeechRecognition — only ${VOICE_OWNER} may, because only it insists on processLocally.`);
  }
  if (path === VOICE_OWNER && !/\.processLocally\s*=\s*true/.test(src)) {
    problems.push(`[no network] ${VOICE_OWNER} no longer sets processLocally = true, so voice could fall back to a server.`);
  }
}

/* ----------------------------------------------------------------------- *
 * Invariant 2 — record CRUD goes through store.jsx.
 *
 * Importing db.js elsewhere is allowed only for the storage capability helpers, as
 * exporter.js, DataManager.jsx and Onboarding.jsx do. Never to read or write records:
 * a second writer means two callers disagreeing about what is on disk.
 * ----------------------------------------------------------------------- */

const DB_OWNER = "src/lib/store.jsx";
const CAPABILITY = new Set(["estimateUsage", "persistStorage", "storageKind", "COLLECTIONS"]);

for (const file of sourceFiles) {
  const path = rel(file);
  if (path === DB_OWNER || path === "src/lib/db.js") continue;

  const IMPORT_FROM_DB = /import\s+(\*\s+as\s+[A-Za-z_$][\w$]*|\{[^}]*\}|[A-Za-z_$][\w$]*)\s*,?\s*(?:\{[^}]*\}\s*)?from\s+["'][^"']*\bdb\.js["']/g;

  for (const m of readFileSync(file, "utf8").matchAll(IMPORT_FROM_DB)) {
    const clause = m[1].trim();
    if (clause.startsWith("*")) {
      problems.push(
        `[store boundary] ${path} does \`${clause}\` from db.js. Only ${DB_OWNER} may hold the whole module; ` +
        "everywhere else takes named capability helpers."
      );
      continue;
    }
    const named = [...clause.matchAll(/([A-Za-z_$][\w$]*)/g)].map((x) => x[1]);
    const illegal = named.filter((n) => !CAPABILITY.has(n));
    if (illegal.length) {
      problems.push(
        `[store boundary] ${path} imports { ${illegal.join(", ")} } from db.js. Record CRUD goes through store.jsx; ` +
        `db.js is importable only for ${[...CAPABILITY].join(", ")}.`
      );
    }
  }
}

/* ----------------------------------------------------------------------- *
 * Invariant 9 — colours come from CSS tokens, through tint().
 *
 * Never concatenate an alpha suffix onto a colour: "var(--in)" + "1c" is not a colour,
 * and that is exactly why income rows once rendered with no icon tile.
 *
 * Only a var() token on the left of a concatenation is the bug. Appending alpha to a
 * stored hex is the documented fast path inside tint() itself, so it is not flagged, and
 * comment lines are skipped because color.js explains the old bug by quoting it.
 * ----------------------------------------------------------------------- */

for (const file of sourceFiles) {
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const comment = /^\s*(\/\/|\*|\/\*)/.test(line);
    if (!comment && /["'`]var\(--[^"'`]*\)?["'`]\s*\+/.test(line)) {
      problems.push(
        `[colour] ${rel(file)}:${i + 1} concatenates onto a colour token. Use tint() — ` +
        "a var() with an alpha suffix glued on is not a colour."
      );
    }
  });
}

/* ----------------------------------------------------------------------- *
 * Invariant 11 — the service worker keeps its placeholders and never jumps the queue.
 *
 * scripts/build-sw.mjs exits 1 without the placeholders, and an unconditional
 * skipWaiting() swaps a new build in underneath someone halfway through typing a
 * transaction. The page asks for the update; the worker does not take it.
 * ----------------------------------------------------------------------- */

const sw = read("public/sw.js");

for (const token of ["__PRECACHE__", "__VERSION__"]) {
  if (sw.includes(token)) continue;
  problems.push(
    `[service worker] public/sw.js no longer contains ${token}. build-sw.mjs rewrites both after the ` +
    "Vite build and exits 1 without them, so the offline precache would be empty."
  );
}

/*
 * The one legitimate call sits in the message handler, on a line that also names the
 * SKIP_WAITING message it answers. Any other occurrence is the bug.
 */
sw.split("\n").forEach((line, i) => {
  if (!/\bskipWaiting\s*\(/.test(line)) return;
  if (line.trim().startsWith("//") || line.includes("SKIP_WAITING")) return;
  problems.push(
    `[service worker] public/sw.js:${i + 1} calls skipWaiting() without the SKIP_WAITING guard. ` +
    "A new build must wait to be asked, not swap itself in under someone mid-entry."
  );
});

/*
 * The other half of the same invariant: after a build the placeholders must be gone. A
 * dist/sw.js that still carries them precaches nothing, and the failure is invisible until
 * somebody opens the app with no connection. Only checked when a build is present, so this
 * script still runs on a bare checkout.
 */
const builtSw = join(ROOT, "dist", "sw.js");
if (existsSync(builtSw)) {
  const built = readFileSync(builtSw, "utf8");
  for (const token of ["__PRECACHE__", "__VERSION__"]) {
    if (!built.includes(token)) continue;
    problems.push(
      `[service worker] dist/sw.js still contains ${token} — scripts/build-sw.mjs did not rewrite it, ` +
      "so the built app would precache nothing and fail offline."
    );
  }
  if (/const\s+PRECACHE\s*=\s*\[\s*\]/.test(built)) {
    problems.push("[service worker] dist/sw.js has an empty precache list — the build produced an offline shell with nothing in it.");
  }

  /*
   * An icon named in the manifest but missing from the build costs the install prompt, and
   * nothing says so: the app still loads in a tab. Same for a file the worker promises to
   * precache — addAll() rejects as a whole, so one bad path means nothing is cached at all
   * and the app is silently online-only.
   */
  const manifestPath = join(DIST, "manifest.webmanifest");
  if (!existsSync(manifestPath)) {
    problems.push("[pwa] dist/manifest.webmanifest is missing — the app cannot be installed.");
  } else {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (e) {
      problems.push(`[pwa] dist/manifest.webmanifest is not valid JSON: ${e.message}`);
    }
    for (const icon of manifest?.icons ?? []) {
      const src = String(icon.src).replace(/^\.?\//, "");
      if (!existsSync(join(DIST, src))) {
        problems.push(`[pwa] manifest names icon ${icon.src} (${icon.sizes}) but dist/${src} does not exist.`);
      }
    }
    if (!(manifest?.icons ?? []).some((i) => String(i.purpose ?? "").includes("maskable"))) {
      problems.push("[pwa] the manifest has no maskable icon, so Android will letterbox the home-screen icon.");
    }
  }

  /*
   * The built page's Content-Security-Policy is the browser-side half of invariant 1, and
   * its script-src is what keeps the host's injected badge from drawing. Losing the plugin,
   * or loosening script-src with 'unsafe-inline' or a remote origin, still builds and still
   * runs, so nothing else would notice that either promise had gone.
   */
  const builtHtmlPath = join(DIST, "index.html");
  if (existsSync(builtHtmlPath)) {
    /*
     * Read the attribute the way a browser does. Vite 8 serialises the quotes around
     * 'self' as &#39;, so matching the raw bytes saw "&#39" for a policy that was intact.
     */
    const decode = (s) => s
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    const raw = readFileSync(builtHtmlPath, "utf8")
      .match(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]*)"/i)?.[1];
    const csp = raw === undefined ? undefined : decode(raw);
    const directives = Object.fromEntries(
      (csp ?? "").split(";").map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v])
    );
    const onlySelf = (name) => {
      const sources = directives[name] ?? directives["default-src"];
      return sources && sources.length === 1 && sources[0] === "'self'";
    };
    if (!csp) {
      problems.push("[csp] dist/index.html has no Content-Security-Policy meta — the vyay-csp plugin in vite.config.js did not run.");
    } else {
      if (!onlySelf("script-src")) {
        problems.push(`[csp] script-src is "${(directives["script-src"] ?? []).join(" ")}", not 'self' alone. Inline or remote script lets the host's badge, and anything else, back in.`);
      }
      if (!onlySelf("connect-src")) {
        problems.push("[csp] connect-src is not 'self' alone, so the browser would no longer refuse a request that leaves the device.");
      }
    }
  }

  for (const entry of built.match(/"\.\/[^"]*"/g) ?? []) {
    const path = entry.slice(1, -1).replace(/^\.\//, "");
    /* "./" is the bare directory URL, which the shell answers from index.html. */
    if (!path || path === "index.html") continue;
    if (!existsSync(join(DIST, path))) {
      problems.push(`[service worker] dist/sw.js precaches ./${path}, which is not in the build. addAll() rejects as a whole, so nothing would be cached.`);
    }
  }
}

/* ----------------------------------------------------------------------- *
 * Invariant 12 — APP_VERSION tracks package.json.
 *
 * The More screen quotes the version and the build id, which is what bug reports cite.
 * A mismatch means every report names a build that was never shipped.
 * ----------------------------------------------------------------------- */

const pkg = JSON.parse(read("package.json"));
const appVersion = read("src/lib/version.js").match(/APP_VERSION\s*=\s*["']([^"']+)["']/)?.[1];

if (!appVersion) {
  problems.push("[version] could not find APP_VERSION in src/lib/version.js.");
} else if (appVersion !== pkg.version) {
  problems.push(
    `[version] APP_VERSION is ${appVersion} but package.json version is ${pkg.version}. ` +
    "Both must match; both are quoted in bug reports."
  );
}

/*
 * The release workflow publishes CHANGELOG.md's section for the tagged version as the
 * release notes, and refuses the tag without one. Catching a missing section here means
 * the version bump's own pull request fails, not the release run after main has merged.
 */
const changelog = existsSync(join(ROOT, "CHANGELOG.md")) ? read("CHANGELOG.md") : "";
if (!changelog.includes(`## [${pkg.version}]`)) {
  problems.push(
    `[version] CHANGELOG.md has no "## [${pkg.version}]" section. ` +
    "Every version gets one; it becomes the GitHub release notes."
  );
}

/* ----------------------------------------------------------------------- *
 * Bundle discipline — four runtime dependencies.
 *
 * A fifth needs a reason stated out loud and agreed, not discovered in a lockfile diff.
 * ----------------------------------------------------------------------- */

const EXPECTED_RUNTIME_DEPS = 4;
const deps = Object.keys(pkg.dependencies ?? {});

if (deps.length > EXPECTED_RUNTIME_DEPS) {
  problems.push(
    `[dependencies] ${deps.length} runtime dependencies (${deps.join(", ")}), expected ${EXPECTED_RUNTIME_DEPS}. ` +
    "A fifth needs a reason stated out loud and agreed; once it is, raise EXPECTED_RUNTIME_DEPS here in the same commit."
  );
}

/* Two lockfiles can disagree about one tree, and only the one CI installs is enforced. */
if (existsSync(join(ROOT, "package-lock.json")) && existsSync(join(ROOT, "yarn.lock"))) {
  notes.push(
    "package-lock.json and yarn.lock both exist. CI installs with `npm ci`, so yarn.lock is unenforced " +
    "and will drift from what actually ships. Pick one and delete the other."
  );
}

/* ----------------------------------------------------------------------- */

if (notes.length) {
  notes.forEach((n) => console.log("  NOTE  " + n));
  console.log("");
}

if (problems.length) {
  problems.forEach((p) => console.log("  FAIL  " + p));
  console.error(
    `\n${problems.length} invariant violation${problems.length === 1 ? "" : "s"}. ` +
    "Each of these exists because breaking it caused a real bug — do not relax one silently."
  );
  process.exit(1);
}

console.log(
  `  PASS  invariants hold across ${sourceFiles.length} source files: no network, store boundary intact, ` +
  `colour tokens, worker placeholders and patience, version ${appVersion} in sync, ${deps.length} runtime deps`
);
