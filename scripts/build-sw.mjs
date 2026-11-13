/**
 * Post-build step: tell the service worker exactly which files to precache.
 *
 * Vite hashes asset filenames, so the list can only be known after the build.
 * This walks dist, writes the list into sw.js, and names the cache after a hash
 * of that list so a new build always produces a new cache.
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createHash } from "node:crypto";

const DIST = "dist";
const SKIP = new Set(["sw.js"]);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(DIST)
  .map((f) => relative(DIST, f).split(sep).join("/"))
  .filter((f) => !SKIP.has(f) && !f.endsWith(".map"))
  .sort();

// "./" and "./index.html" resolve to the same response; cache both keys so a bare
// directory URL works offline too.
const precache = ["./", ...files.map((f) => "./" + f)];
const version = "vyay-" + createHash("sha1").update(precache.join("|")).digest("hex").slice(0, 10);

const swPath = join(DIST, "sw.js");
const source = readFileSync(swPath, "utf8");

if (!source.includes("__PRECACHE__") || !source.includes("__VERSION__")) {
  console.error("build-sw: placeholders missing from dist/sw.js — was public/sw.js changed?");
  process.exit(1);
}

writeFileSync(
  swPath,
  source
    .replace("__PRECACHE__", JSON.stringify(precache, null, 2))
    .replace("__VERSION__", version)
);

const bytes = files.reduce((total, f) => total + statSync(join(DIST, f)).size, 0);
console.log(`build-sw: ${precache.length} entries precached as ${version} (${(bytes / 1024).toFixed(0)} kB)`);
