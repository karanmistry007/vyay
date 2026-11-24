/**
 * Guard the bundle budget after a build.
 *
 * The app is meant to open instantly on a phone over a bad connection and then never ask
 * for the network again, so the code payload is a product constraint rather than a vanity
 * metric. Nothing enforced it before, which is how a bundle grows: never in one commit, and
 * always invisibly in a lockfile diff.
 *
 * Fonts are measured but excluded from the budget. They are woff2 subsets, already near the
 * floor, served once and then cached forever — weighing them alongside code would let real
 * JavaScript growth hide behind a font that is not going to change.
 *
 * Run after `npm run build`. Exits 1 when the code payload is over budget.
 */
import { readdirSync, readFileSync, statSync, existsSync, appendFileSync } from "node:fs";
import { join, relative, dirname, resolve, sep, extname } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

/*
 * The ceiling, not the target. CLAUDE.md asks for "near 100 KB gzipped"; the real figure
 * when this check was written was 116.9 kB, so the budget sits just above that with room to
 * breathe. Lowering it is good news and should be done deliberately; raising it means a
 * conversation about what was added, which is the entire point of having a number here.
 */
const BUDGET_KB = 125;
const KB = 1024;

if (!existsSync(DIST)) {
  console.error("check-size: no dist/ — run `npm run build` first.");
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const CODE = new Set([".js", ".css", ".html"]);
const files = walk(DIST)
  .filter((f) => !f.endsWith(".map"))
  .map((f) => {
    const bytes = readFileSync(f);
    return {
      path: relative(DIST, f).split(sep).join("/"),
      ext: extname(f),
      raw: bytes.length,
      /* Every real host serves these compressed, so the gzipped figure is what a phone downloads. */
      gz: CODE.has(extname(f)) ? gzipSync(bytes).length : bytes.length,
    };
  })
  .sort((a, b) => b.gz - a.gz);

const code = files.filter((f) => CODE.has(f.ext) && f.path !== "sw.js");
const other = files.filter((f) => !code.includes(f));

const codeGz = code.reduce((n, f) => n + f.gz, 0);
const otherGz = other.reduce((n, f) => n + f.gz, 0);
const kb = (n) => (n / KB).toFixed(2) + " kB";

const rows = [
  "| file | raw | transferred |",
  "| --- | ---: | ---: |",
  ...code.map((f) => `| \`${f.path}\` | ${kb(f.raw)} | ${kb(f.gz)} |`),
  `| **code total** | | **${kb(codeGz)}** |`,
  ...other.map((f) => `| \`${f.path}\` (not budgeted) | ${kb(f.raw)} | ${kb(f.gz)} |`),
];

console.log("\nBundle\n");
console.log(rows.join("\n"));
console.log(`\n  code ${kb(codeGz)} gzipped against a ${BUDGET_KB} kB budget`);
console.log(`  plus ${kb(otherGz)} of fonts and icons, cached once`);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    ["", "## Bundle", "", rows.join("\n"), "", `Code payload **${kb(codeGz)}** gzipped, budget **${BUDGET_KB} kB**.`, ""].join("\n")
  );
}

const budget = BUDGET_KB * KB;

if (codeGz > budget) {
  console.error(
    `\ncheck-size: ${kb(codeGz)} gzipped is over the ${BUDGET_KB} kB budget by ${kb(codeGz - budget)}.\n` +
    "Either trim it or argue for a higher ceiling out loud — a fifth runtime dependency needs a reason, " +
    "and so does a bigger bundle."
  );
  process.exit(1);
}

/* A near miss is worth saying before the commit that actually breaks it. */
if (codeGz > budget * 0.95) {
  console.log(`\n  NOTE  within 5% of the budget — ${kb(budget - codeGz)} of headroom left.`);
}

console.log(`\n  PASS  bundle is ${kb(budget - codeGz)} under budget`);
