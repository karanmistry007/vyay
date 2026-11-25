import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BUILD_ID = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

/*
 * The shipped page's Content-Security-Policy. It turns "no network, ever" from a promise
 * into something the browser enforces: everything, connections included, falls back to
 * 'self', so a dependency that tries to phone home is refused rather than merely frowned on.
 *
 * script-src deliberately has no 'unsafe-inline'. Netlify injects a "Powered by Netlify"
 * badge into every HTML response on the free plan; its loader builds the badge inside a
 * srcdoc iframe whose only script is inline, and a srcdoc frame inherits this policy, so
 * the badge never draws. That is the mechanism Netlify itself documents for keeping it off
 * a page. style-src keeps 'unsafe-inline' for the first-paint <style> in index.html, and
 * font-src allows data: because the bundled typeface's CSS inlines one fallback face.
 *
 * It lives in a <meta> rather than a host header so it travels with index.html: the
 * service worker answers every navigation from the cached shell, and the policy works
 * the same on any static host. It is added at build time only, because the dev server
 * relies on an inline React-refresh preamble that this policy would block.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const contentSecurityPolicy = () => ({
  name: "vyay-csp",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
  ],
});

/*
 * Drops the React `key` that lucide stamps on every shape inside every icon. The keys are six
 * random base-36 characters each, 382 of them across the icons we ship, and random text is the
 * one thing gzip cannot shrink: they cost about 2 kB of the bundle budget, as much as a screen.
 * They do nothing at runtime. An icon's shapes are a fixed list that never reorders, so React's
 * positional matching is exactly right without them; production React does not warn either.
 * Build only, because development React would warn about the missing keys on every render.
 *
 * Narrow on purpose: lucide's per-icon modules only, and only a string key closing an attribute
 * object. If a lucide upgrade changes that shape, nothing is stripped and the build warns;
 * the bundle then grows back by about 2 kB, which check-size will catch against the ceiling.
 */
const LUCIDE_ICON = /[\\/]lucide-react[\\/]dist[\\/]esm[\\/]icons[\\/][^\\/]+\.mjs$/;
const lucideIconKeys = () => {
  let seen = 0, stripped = 0;
  return {
    name: "vyay-lucide-icon-keys",
    apply: "build",
    transform(code, id) {
      if (!LUCIDE_ICON.test(id)) return null;
      seen++;
      const out = code.replace(/,\s*key:\s*"[a-z0-9]+"(?=\s*\})/g, "");
      if (out === code) return null;
      stripped++;
      return { code: out, map: null };
    },
    buildEnd() {
      if (seen && !stripped) this.warn(`lucide icon keys: none stripped from ${seen} icons; has lucide's icon format changed?`);
    },
  };
};

export default defineConfig({
  base: "./",
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react(), contentSecurityPolicy(), lucideIconKeys()],
  server: { host: true, port: 5173 },
  build: { outDir: "dist", sourcemap: false },
});
