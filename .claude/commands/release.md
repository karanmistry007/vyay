---
description: Cut a release — version bump, full verification, offline and data checks, release notes
argument-hint: <new version> — e.g. 0.9.0
---

Prepare release $ARGUMENTS. This app has no error reporting and no backend: a bad build is
discovered by a user whose balances look wrong, so every step below is load-bearing.

**1. Know what is shipping.** `git log --oneline` since the last version bump, and
`git diff --stat`. List the user-visible changes before touching anything.

**2. Version in two places, which must match.**
- `version` in `package.json`
- `APP_VERSION` in `src/lib/version.js`

The build id comes from `__BUILD_ID__` in `vite.config.js` and needs no edit. Both the version
and the build id show at the foot of the More screen and are what a bug report quotes.

**3. Verify.** Run `/verify` including the build. Confirm:
- the four scripts report their expected counts (one known analytics failure, no more)
- `npm run build` printed the `build-sw: N entries precached as vyay-<hash>` line
- `dist/sw.js` contains no `__PRECACHE__` or `__VERSION__` placeholder

**4. Data safety.** If anything under `src/lib/migrate.js`, `db.js` or `exporter.js` changed,
run the `schema-guardian` agent on the diff and include its verdict. State explicitly whether
`SCHEMA_VERSION` moved and whether backups from the previous build still restore.

**5. Promises.** Run the `offline-guard` agent. It checks that nothing calls the network, that
the precache covers the build, and that the new worker waits instead of swapping itself in.

**6. Money.** If anything under `ledger.js`, `settlements.js`, `analytics.js` or `money.js`
changed, run the `ledger-auditor` agent and include its verdict.

**7. Documentation.** Update `README.md` where behaviour changed. Two things are already known
stale and worth fixing while you are there: the migration table stops at schema 4 while
`SCHEMA_VERSION` is 6, and the Theme section references `test-theme.mjs`, which does not exist.

**8. Report, do not commit.** Summarise: version, what changed, every check with its result,
and anything a human still has to test by hand — install prompt, a real offline reload, and
restoring a backup taken with the previous build.

The release itself follows the branch strategy in CLAUDE.md: the version bump goes on an
`<owner>/<topic>` branch off `develop` and merges there by pull request; `develop` then merges
into `main`, which is the release line. Ask before committing, merging, tagging or pushing any
of it.
