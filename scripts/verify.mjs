/**
 * Run the whole safety net and judge the result against the known baseline.
 *
 * This project has no test runner, no linter and no typechecker: four standalone scripts
 * are all there is. Running them from CI directly does not work, because test-analytics.mjs
 * exits 1 on a clean checkout over one assertion that assumes the current month. A pipeline
 * that is red before anybody has changed anything teaches people to ignore it, so this
 * wrapper separates "failed" from "failed in the way it already failed yesterday" and exits
 * non-zero only for the former.
 *
 * Usage:
 *   node scripts/verify.mjs            the four scripts
 *   node scripts/verify.mjs --build    also build, and prove the service worker was rewritten
 */
import { execSync, spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BASELINE, isKnownFailure } from "./baseline.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SCRIPTS = [
  { file: "check-imports.mjs", what: "missing JSX imports and bad named imports" },
  { file: "test-format.mjs", what: "money formatting: fmt, round2, tint" },
  { file: "test-analytics.mjs", what: "report maths in src/lib/analytics.js" },
  { file: "test-planner.mjs", what: "planRepair correctness and idempotency" },
];

const withBuild = process.argv.includes("--build");

/** Run a node script at the project root, capturing everything it says. */
function run(file) {
  const r = spawnSync(process.execPath, [file], { cwd: ROOT, encoding: "utf8" });
  return { code: r.status ?? 1, out: [r.stdout, r.stderr].filter(Boolean).join("") };
}

const results = [];
let regressed = false;

for (const { file } of SCRIPTS) {
  const { code, out } = run(file);

  /* Both the tests and check-imports print "  PASS  label" / "  FAIL  label". */
  const failures = out.split("\n").filter((l) => l.includes("FAIL")).map((l) => l.trim());
  const known = failures.filter((l) => isKnownFailure(file, l));
  const fresh = failures.filter((l) => !isKnownFailure(file, l));

  /* The tests end with "  N passed, M failed"; check-imports only prints a single line. */
  const counts = out.match(/(\d+) passed, (\d+) failed/);
  const passed = counts ? Number(counts[1]) : code === 0 ? 1 : 0;
  const failed = counts ? Number(counts[2]) : failures.length;

  /*
   * A non-zero exit with nothing that looks like a failing assertion means the script itself
   * threw — a syntax error or a bad import. That is never covered by the baseline.
   */
  const crashed = code !== 0 && failures.length === 0;
  const bad = fresh.length > 0 || crashed;
  if (bad) regressed = true;

  results.push({ file, code, passed, failed, known, fresh, crashed, bad, out });
}

/* ---------- report ---------- */

const rows = results.map((r) => {
  const status = r.crashed ? "CRASHED" : r.bad ? "FAILED" : r.known.length ? "pass (known)" : "pass";
  return `| \`${r.file}\` | ${r.passed} | ${r.failed} | ${status} |`;
});

const lines = [
  "| script | passed | failed | verdict |",
  "| --- | ---: | ---: | --- |",
  ...rows,
];

console.log("\nSafety net\n");
console.log(lines.join("\n"));

for (const r of results) {
  if (r.known.length) {
    const why = BASELINE.find((k) => k.script === r.file)?.reason ?? "";
    console.log(`\nKnown baseline failure in ${r.file} — not a regression:`);
    r.known.forEach((l) => console.log("  " + l));
    if (why) console.log("  why: " + why);
  }
  if (r.fresh.length) {
    console.log(`\nNEW failures in ${r.file}:`);
    r.fresh.forEach((l) => console.log("  " + l));
  }
  if (r.crashed) {
    console.log(`\n${r.file} exited ${r.code} without reporting an assertion — it threw:\n`);
    console.log(r.out.trim().split("\n").slice(-20).join("\n"));
  }
}

/* ---------- optional build ---------- */

let buildNote = "";
if (withBuild) {
  console.log("\nBuilding\n");
  try {
    /*
     * execSync with a command string rather than execFileSync with an argument array: npm is
     * a .cmd shim on Windows, which Node refuses to spawn without a shell, and passing an
     * args array to a shell is deprecated. A plain string sidesteps both, and going through
     * npm keeps package.json the only definition of what a build is.
     */
    const out = execSync("npm run build", { cwd: ROOT, encoding: "utf8" });
    const swLine = out.split("\n").find((l) => l.includes("build-sw:"));
    if (!swLine) {
      console.error("build finished but printed no `build-sw:` line — the precache list is empty and the app will not work offline.");
      regressed = true;
    } else {
      console.log("  " + swLine.trim());
      buildNote = swLine.trim();
    }

    /*
     * Whether the built worker still carries its placeholders is invariant 11, and
     * check-invariants.mjs is the one place that decides it — including for dist, now that
     * a build exists for it to look at. Calling it here keeps a single authority.
     */
    const inv = spawnSync(process.execPath, [join(ROOT, "scripts", "check-invariants.mjs")], { cwd: ROOT, encoding: "utf8" });
    process.stdout.write(inv.stdout ?? "");
    if (inv.status !== 0) {
      process.stderr.write(inv.stderr ?? "");
      regressed = true;
    }
  } catch (e) {
    console.error("build failed:\n" + [e.stdout, e.stderr].filter(Boolean).join(""));
    regressed = true;
  }
}

/* GitHub renders this in the job summary, so a reviewer sees the counts without opening logs. */
if (process.env.GITHUB_STEP_SUMMARY) {
  const extra = results
    .filter((r) => r.known.length || r.fresh.length)
    .map((r) => `**${r.file}**\n` + [...r.known.map((l) => "- known: " + l), ...r.fresh.map((l) => "- NEW: " + l)].join("\n"))
    .join("\n\n");
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    ["## Safety net", "", lines.join("\n"), "", extra, "", buildNote ? "```\n" + buildNote + "\n```" : ""].join("\n")
  );
}

if (regressed) {
  console.error("\nVerification failed: see the NEW failures above.");
  process.exit(1);
}

const totalPassed = results.reduce((n, r) => n + r.passed, 0);
const allowed = results.reduce((n, r) => n + r.known.length, 0);
console.log(`\nAll four scripts behaved: ${totalPassed} passed, ${allowed} known baseline failure${allowed === 1 ? "" : "s"}, 0 regressions.`);
