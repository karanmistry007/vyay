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
 * Code is split in two. What index.html loads is the startup payload: it stands between a
 * tap on the icon and a usable screen, and it carries the original ceiling. A chunk behind a
 * dynamic import (the quick-add parser, for one) is fetched only when its screen opens, so it
 * is weighed against its own, smaller ceiling. Lumping the two together made moving code off
 * the startup path look exactly as costly as adding it.
 *
 * Run after `npm run build`. Exits 1 when either payload is over its budget.
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

/*
 * On-demand chunks. Set when the quick-add parser became the first one, at 11.5 kB, with room
 * for one more feature that size. Moving code here from startup is the cheap way to make
 * headroom; this ceiling is what stops it becoming a place to hide growth.
 */
const LAZY_BUDGET_KB = 20;
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

/*
 * Startup is index.html plus every script and stylesheet it names. Any other code under
 * assets/ can only arrive through a dynamic import.
 */
const html = readFileSync(join(DIST, "index.html"), "utf8");
const named = new Set([...html.matchAll(/(?:src|href)="(?:\.\/|\/)?([^"]+)"/g)].map((m) => m[1]));
const isStartup = (f) => f.path === "index.html" || named.has(f.path);

const allCode = files.filter((f) => CODE.has(f.ext) && f.path !== "sw.js");
const code = allCode.filter(isStartup);
const lazy = allCode.filter((f) => !isStartup(f));
const other = files.filter((f) => !allCode.includes(f));

const codeGz = code.reduce((n, f) => n + f.gz, 0);
const lazyGz = lazy.reduce((n, f) => n + f.gz, 0);
const otherGz = other.reduce((n, f) => n + f.gz, 0);
const kb = (n) => (n / KB).toFixed(2) + " kB";

const rows = [
  "| file | raw | transferred |",
  "| --- | ---: | ---: |",
  ...code.map((f) => `| \`${f.path}\` | ${kb(f.raw)} | ${kb(f.gz)} |`),
  `| **startup total** | | **${kb(codeGz)}** |`,
  ...lazy.map((f) => `| \`${f.path}\` (on demand) | ${kb(f.raw)} | ${kb(f.gz)} |`),
  `| **on-demand total** | | **${kb(lazyGz)}** |`,
  ...other.map((f) => `| \`${f.path}\` (not budgeted) | ${kb(f.raw)} | ${kb(f.gz)} |`),
];

console.log("\nBundle\n");
console.log(rows.join("\n"));
console.log(`\n  startup ${kb(codeGz)} gzipped against a ${BUDGET_KB} kB budget`);
console.log(`  on demand ${kb(lazyGz)} gzipped against a ${LAZY_BUDGET_KB} kB budget`);
console.log(`  plus ${kb(otherGz)} of fonts and icons, cached once`);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    ["", "## Bundle", "", rows.join("\n"), "", `Startup **${kb(codeGz)}** gzipped, budget **${BUDGET_KB} kB**. On demand **${kb(lazyGz)}**, budget **${LAZY_BUDGET_KB} kB**.`, ""].join("\n")
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

const lazyBudget = LAZY_BUDGET_KB * KB;

if (lazyGz > lazyBudget) {
  console.error(
    `\ncheck-size: on-demand chunks are ${kb(lazyGz)} gzipped, over their ${LAZY_BUDGET_KB} kB budget ` +
    `by ${kb(lazyGz - lazyBudget)}.\nTrim them, or argue for a higher ceiling out loud.`
  );
  process.exit(1);
}

/* A near miss is worth saying before the commit that actually breaks it. */
if (codeGz > budget * 0.95) {
  console.log(`\n  NOTE  within 5% of the budget — ${kb(budget - codeGz)} of headroom left.`);
}

console.log(`\n  PASS  startup is ${kb(budget - codeGz)} under budget, on demand ${kb(lazyBudget - lazyGz)} under`);
