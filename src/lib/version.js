/**
 * The version a user sees under More → About, and the label a bug report cites.
 *
 * Semantic versioning, read for a local-first app (see "Versioning and releases" in
 * CLAUDE.md): major when a backup or an install cannot carry forward unaided, minor for
 * anything a user can see or any schema bump, patch for fixes only. This must equal
 * `version` in package.json and have a section in CHANGELOG.md; check:invariants enforces
 * both, and the release workflow refuses a tag that disagrees with either.
 */
export const APP_VERSION = "1.0.0";

/* Minute-precision UTC stamp set by vite.config.js, so two builds of one version differ. */
export const APP_BUILD = __BUILD_ID__;

/** The one line a bug report should carry: version, build, and the browser it ran in. */
export const versionLabel = () =>
  `Vyay ${APP_VERSION} (build ${APP_BUILD})` +
  (typeof navigator !== "undefined" ? ` · ${navigator.userAgent}` : "");
