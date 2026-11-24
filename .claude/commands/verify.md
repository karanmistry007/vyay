---
description: Run every check this repo has and report the result honestly
allowed-tools: Bash(node check-imports.mjs), Bash(node test-format.mjs), Bash(node test-analytics.mjs), Bash(node test-planner.mjs), Bash(npm run build), Bash(git diff:*), Bash(git status:*)
---

Run the full safety net. There is no test runner, linter or typechecker in this project, so
these four scripts are all there is.

```
node check-imports.mjs
node test-format.mjs
node test-analytics.mjs
node test-planner.mjs
```

Then, only if `$ARGUMENTS` contains `build` or the change touches `vite.config.js`,
`public/sw.js`, `scripts/build-sw.mjs`, `index.html` or `package.json`, also run
`npm run build` and confirm the `build-sw:` line appears in the output — a build without it
has an empty precache list and the app will not work offline.

Report a table: script, passed, failed, and the label of every failing assertion.

**The known baseline is one failure**, `a short history charts month by month` in
`test-analytics.mjs`, caused by that test assuming the current month. Do not count it as a
regression and do not silence it by editing the expectation to match today. Everything else
failing is yours.

If anything else fails, say so plainly with the output, then fix it before claiming the work
is done. If everything passes, say so in one line with the counts — no victory lap.
