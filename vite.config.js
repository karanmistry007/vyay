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

export default defineConfig({
  base: "./",
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react(), contentSecurityPolicy()],
  server: { host: true, port: 5173 },
  build: { outDir: "dist", sourcemap: false },
});
