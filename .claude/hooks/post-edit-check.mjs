/**
 * PostToolUse hook: catch the mistakes this codebase cannot catch at runtime.
 *
 *  1. A component used in JSX but never imported ships happily and throws only when
 *     that screen renders, possibly days later. `check-imports.mjs` finds it in about
 *     a tenth of a second, so running it after every source edit is free.
 *  2. A pure-maths module edited without running its test is how report arithmetic
 *     drifts. Known-failing assertions are listed in scripts/baseline.mjs and ignored, so
 *     only a *new* failure interrupts.
 *  3. `public/sw.js` losing its build-time placeholders makes the build silently wrong.
 *
 * Exits 2 with a message on stderr when something is wrong, which is how a hook hands
 * the problem back to the agent. Anything else lets the edit stand.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isKnownFailure } from "../../scripts/baseline.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/*
 * The list of assertions that already fail on a clean checkout lives in
 * scripts/baseline.mjs, because CI reads it too. If this hook and the CI verifier
 * disagreed about what counts as a known failure, an edit would pass locally and fail in
 * the pull request, or worse, the other way round.
 */

/** Modules whose correctness lives in a test rather than in the type system. */
const PAIRED = {
  "src/lib/analytics.js": "test-analytics.mjs",
  "src/lib/settlements.js": "test-planner.mjs",
  "src/lib/ledger.js": "test-analytics.mjs",
  "src/lib/money.js": "test-format.mjs",
  "src/lib/color.js": "test-format.mjs",
};

const readStdin = () => new Promise((done) => {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { raw += chunk; });
  process.stdin.on("end", () => done(raw));
  setTimeout(() => done(raw), 2000); // a manual run has no stdin and must not hang
});

/** Run a node script at the project root and return its combined output. */
function run(script) {
  try {
    return { ok: true, out: String(execFileSync(process.execPath, [script], { cwd: ROOT, stdio: "pipe" })) };
  } catch (e) {
    return { ok: false, out: [e.stdout, e.stderr].filter(Boolean).map(String).join("") };
  }
}

/* A hook that cannot read its own input must get out of the way, not fail the edit. */
let payload = {};
try { payload = JSON.parse((await readStdin()) || "{}"); } catch { process.exit(0); }

const input = payload.tool_input || {};
const file = input.file_path || input.filePath || "";
const path = file.replace(/\\/g, "/");
const problems = [];

if (/(^|\/)src\/.*\.(jsx|js)$/.test(path)) {
  const { ok, out } = run("check-imports.mjs");
  if (!ok) problems.push("check-imports.mjs failed:\n" + out.trim());
}

for (const [module, script] of Object.entries(PAIRED)) {
  if (!path.endsWith(module)) continue;
  const { ok, out } = run(script);
  if (ok) continue;
  const failures = out.split("\n")
    .filter((line) => line.includes("FAIL"))
    .filter((line) => !isKnownFailure(script, line));
  if (failures.length) {
    problems.push(`${script} has new failures after editing ${module}:\n${failures.join("\n")}`);
  }
}

if (/(^|\/)public\/sw\.js$/.test(path)) {
  const src = readFileSync(file, "utf8");
  for (const token of ["__PRECACHE__", "__VERSION__"]) {
    if (src.includes(token)) continue;
    problems.push(
      `public/sw.js no longer contains ${token}. scripts/build-sw.mjs rewrites both ` +
      "placeholders after the Vite build and exits 1 without them, so the offline precache " +
      "would be wrong. Put it back."
    );
  }
}

if (problems.length) {
  console.error(problems.join("\n\n"));
  process.exit(2);
}
