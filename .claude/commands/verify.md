---
description: Run every check this repo has and report the result honestly
allowed-tools: Bash(npm run verify), Bash(npm run verify:build), Bash(npm run check:invariants), Bash(npm run check:size), Bash(npm run ci), Bash(node check-imports.mjs), Bash(node test-format.mjs), Bash(node test-analytics.mjs), Bash(node test-planner.mjs), Bash(npm run build), Bash(git diff:*), Bash(git status:*)
---

Run the full safety net. There is no test runner, linter or typechecker in this project, so
five standalone scripts and a set of machine-checkable invariants are all there is.

```
npm run verify
npm run check:invariants
```

`npm run verify` wraps the five scripts and judges them against the known baseline, which is
why it is used instead of running each one by hand: `test-analytics.mjs` exits non-zero on a
clean checkout, and only the wrapper can tell that apart from a regression. The same two
commands are what CI runs, so a green run here means a green run there.

Then, only if `$ARGUMENTS` contains `build` or the change touches `vite.config.js`,
`public/sw.js`, `scripts/build-sw.mjs`, `index.html` or `package.json`, run
`npm run verify:build` instead of `npm run verify`, and confirm the `build-sw:` line appears —
a build without it has an empty precache list and the app will not work offline. With a build
present, `check:invariants` also checks `dist/sw.js`, the manifest and every icon the install
prompt needs, and `npm run check:size` reports the gzipped payload against its budget.

Report the table `npm run verify` prints: script, passed, failed, and the label of every
failing assertion.

**The known baseline is one failure**, `a short history charts month by month` in
`test-analytics.mjs`, caused by that test assuming the current month. The wrapper already
classifies it as known and will say so. Do not count it as a regression and do not silence it
by editing the expectation to match today. Everything the wrapper calls NEW is yours.

If anything else fails, say so plainly with the output, then fix it before claiming the work
is done. If everything passes, say so in one line with the counts — no victory lap.
