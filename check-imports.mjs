/**
 * Static checks the bundler will not do for you.
 *
 *  1. A component used in JSX but never imported is only a runtime error, so it
 *     ships happily and blows up when that screen renders.
 *  2. A named import that the target module does not export is caught by rollup
 *     during `vite build`, but only after a two-minute build — and not at all by
 *     the dev server. Catching both here keeps the feedback immediate.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const files = walk("src").filter((f) => /\.(jsx|js)$/.test(f));
const problems = [];

/* ── what each local module exports ── */
const exportsOf = new Map();
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([\w$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    m[1].split(",").forEach((n) => { const t = n.split(" as ").pop().trim(); if (t) names.add(t); });
  }
  if (/export\s+default/.test(src)) names.add("default");
  if (/export\s*\*/.test(src)) names.add("*");
  exportsOf.set(resolve(file), names);
}

const resolveLocal = (fromFile, spec) => {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.js`, `${base}.jsx`, join(base, "index.js"), join(base, "index.jsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return resolve(candidate);
  }
  return base; // missing file, reported below
};

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const isJsx = file.endsWith(".jsx");
  const imported = new Set();

  for (const m of src.matchAll(/import\s+(?:([\w$]+)\s*,\s*)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g)) {
    if (m[1]) imported.add(m[1]);
    const names = m[2].split(",").map((n) => n.trim()).filter(Boolean);
    names.forEach((n) => imported.add(n.split(" as ").pop().trim()));

    const target = resolveLocal(file, m[3]);
    if (!target) continue;
    const available = exportsOf.get(target);
    if (!available) { problems.push(`${file}: imports from "${m[3]}", which does not exist`); continue; }
    if (available.has("*")) continue;
    for (const n of names) {
      const source = n.split(" as ")[0].trim();
      if (!available.has(source)) problems.push(`${file}: "${source}" is not exported by ${m[3]}`);
    }
  }
  for (const m of src.matchAll(/import\s+([\w$]+)\s+from\s+["']([^"']+)["']/g)) {
    imported.add(m[1]);
    const target = resolveLocal(file, m[2]);
    if (target && exportsOf.has(target) && !exportsOf.get(target).has("default") && !exportsOf.get(target).has("*")) {
      problems.push(`${file}: ${m[2]} has no default export`);
    }
  }

  if (!isJsx) continue;
  for (const m of src.matchAll(/(?:function|const|let|class)\s+([A-Z][\w$]*)/g)) imported.add(m[1]);
  for (const m of src.matchAll(/[[{]([^[\]{}]*)[\]}]\s*(?:=>|=|\))/g)) {
    m[1].split(",").forEach((n) => {
      const t = n.split(":").pop().replace(/[^\w$]/g, "").trim();
      if (/^[A-Z]/.test(t)) imported.add(t);
    });
  }
  for (const m of src.matchAll(/<([A-Z][\w.]*)/g)) {
    const name = m[1].split(".")[0];
    if (!imported.has(name) && name !== "React") problems.push(`${file}: <${name}> used but never imported or defined`);
  }
}

if (problems.length) {
  [...new Set(problems)].forEach((p) => console.log("  FAIL  " + p));
  process.exit(1);
}
console.log(`  PASS  imports and JSX components resolve across ${files.length} files`);
