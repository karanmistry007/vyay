---
description: Cut a release — version bump, changelog, full verification, release PR, tag on main
argument-hint: <new version> — e.g. 1.1.0
---

Prepare release $ARGUMENTS. This app has no error reporting and no backend: a bad build is
discovered by a user whose balances look wrong, so every step below is load-bearing. The rules
behind these steps (what counts as major, minor or patch; where the version lives) are under
"Versioning and releases" in CLAUDE.md.

The maintainer merges, approves and publishes. You open pull requests, and push a tag only
when told to. Stop and ask at each of the three hand-offs marked **⏸**.

**1. Know what is shipping.** `git log --oneline <last tag>..origin/develop` (`git describe
--tags --abbrev=0 origin/main` finds the last tag), and the `[Unreleased]` section of
`CHANGELOG.md`. List the user-visible changes. Check the requested number against the SemVer
table: a `SCHEMA_VERSION` bump or a new feature is at least minor.

**2. Branch.** `karan/release-x-y-z` from an up-to-date `develop`.

**3. Version in three places, which must match.**
- `npm version $ARGUMENTS --no-git-tag-version` (updates `package.json` and the lockfile)
- `APP_VERSION` in `src/lib/version.js`
- `CHANGELOG.md`: rename `## [Unreleased]` to `## [x.y.z] — YYYY-MM-DD`, open a fresh empty
  `## [Unreleased]` above it, fill any gaps from step 1 in words a user would recognise, and
  add the compare link at the foot.

**4. Verify.** Run `/verify` including the build, plus `npm run check:invariants` and
`npm run check:size`. Confirm:
- the scripts report their expected counts (only the known analytics baseline failure)
- `npm run build` printed the `build-sw: N entries precached as vyay-<hash>` line
- `dist/sw.js` contains no `__PRECACHE__` or `__VERSION__` placeholder

**5. Data safety.** If anything under `src/lib/migrate.js`, `db.js` or `exporter.js` changed
since the last tag, run the `schema-guardian` agent on that diff and include its verdict. State
whether `SCHEMA_VERSION` moved and whether backups from the previous version still restore.

**6. Promises.** Run the `offline-guard` agent. It checks that nothing calls the network, that
the precache covers the build, and that the new worker waits instead of swapping itself in.

**7. Money.** If anything under `ledger.js`, `settlements.js`, `analytics.js` or `money.js`
changed since the last tag, run the `ledger-auditor` agent and include its verdict.

**8. Documentation.** Update `README.md` where behaviour changed, including its version line.

**9. ⏸ Version pull request into `develop`.** Commit, push, open the PR. Quote the verify
table. Wait for the maintainer to merge it.

**10. ⏸ Release pull request, `develop` → `main`.** Title `Release vX.Y.Z`. The description is
the changelog section, then the verification results from steps 4–7, then the "Still needs a
human" list. Wait for the maintainer to merge it with a merge commit.

**11. ⏸ Tag on `main`, when told to.** Only on `main`, only on that merge commit:

```
git switch main && git pull --ff-only
git log -1 --oneline            # must be "Merge pull request #N from …/develop"
git tag -a vX.Y.Z -m "Vyay X.Y.Z"
git push origin vX.Y.Z
```

Never tag `develop` or a topic branch, never move or reuse a tag. `release.yml` refuses a tag
that is not on `main`, or that disagrees with the version or the changelog.

**12. Report.** Link the draft release that `release.yml` opened, and list what a human still
has to do before publishing it: install the PWA from the zip, reload with the network off,
restore a backup taken with the previous version, then publish the draft and deploy that same
`dist/`. Finally, if anything landed on `main` alone, open a PR merging `main` back into
`develop`.
