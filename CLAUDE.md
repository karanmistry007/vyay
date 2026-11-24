# Vyay — working agreement

A local-first personal money tracker. React 18 + Vite, no TypeScript, no backend, no router,
no state library, no component library, no chart library. Everything lives in the browser's
IndexedDB. Read `README.md` for the product behaviour; this file is how to work on the code.

## Commands

| What | Command | Notes |
|---|---|---|
| Dev server | `npm run dev` | http://localhost:5173, `host: true` so a phone on the LAN can reach it |
| Build | `npm run build` | `vite build` then `node scripts/build-sw.mjs` — the second half is not optional |
| Preview a build | `npm run preview` | serves `dist/` on :4173 with `--host` |
| Static checks | `node check-imports.mjs` | missing JSX imports and bad named imports; ~0.1s |
| Money formatting | `node test-format.mjs` | `fmt`, `round2`, `tint` |
| Report maths | `node test-analytics.mjs` | pure functions in `src/lib/analytics.js` |
| Settlement repair | `node test-planner.mjs` | `planRepair` correctness and idempotency |

There is no test runner, no linter and no typechecker. The four scripts above are the whole
safety net, so they are not optional either. Each exits non-zero on failure.

**Before reporting any code change as done, run all four.** Quote the pass/fail counts.
The `/verify` command does this in one step.

## Git workflow

- **`main` is the release line.** Nothing lands on it directly; it only receives `develop`
  when a version ships.
- **`develop` is the integration branch** and the base of every pull request. It is the
  default branch on the remote, so a PR opened without a base goes to the right place.
- **Work happens on `<owner>/<kebab-topic>` cut from `develop`** — `karan/dev-mode-sample-data`,
  `karan/agent-config`. One branch per change, named for the change itself.
- **Merge back through a pull request, with a merge commit.** No squash: the individual
  commits are the record of how the change was reasoned about.
- **Commit messages** are an imperative subject under about 60 characters, a blank line, then
  wrapped prose saying why the change exists and what it prevents. Match the existing history —
  it explains reasoning, not file lists.
- Run `/verify` before opening the PR, and quote the result in the description.
- Never commit straight to `develop` or `main`, and never force-push a branch somebody else
  may have pulled.

## Baseline (verified 2026-11-24)

- `check-imports`, `test-format` (20 passed), `test-planner` (27 passed) pass clean.
- `test-analytics` is **51 passed, 1 failed**. The failure is `a short history charts month by
  month`: `buildRange("all", ...)` ends the range at the real `today`, not at the anchor the test
  passes, so the expected bucket count drifts by one every month. That is a defect in the test's
  assumption, not in the app. Do not "fix" it by editing the assertion to match this month —
  either make the range honour its anchor, or inject a clock. If you changed nothing in
  analytics, 51/1 is the expected baseline, not your regression.
- `README.md` mentions `test-theme.mjs`; that file does not exist.
- `README.md`'s migration table stops at schema 4; `SCHEMA_VERSION` is actually 6. The prose
  above the table is current, the table is stale.

## Architecture

Five files carry the system. Understand these before changing anything.

- **`src/lib/db.js`** — the only module that talks to persistent storage. IndexedDB (`vyay`, v3),
  falling back to localStorage, falling back to memory, because a prototype opened from a file://
  URL gets an opaque origin and no IndexedDB. One object store per collection, keyPath `id`.
- **`src/lib/store.jsx`** — React context. Owns every mutation (`add`, `update`, `upsert`,
  `remove`, `restore`, `addMany`, `setMeta`, `setSetting`, `replaceAll`, `wipe`, `settleDebt`)
  and the derived per-book view (`accounts`, `txns`, `ledger`, `balances`, `catById`, ...).
- **`src/lib/ledger.js`** — the single-leg-with-dimensions engine. A transaction fans out into
  flat rows; balances, category totals, merchant totals and net worth are each one reduce over
  that array. No aggregation belongs anywhere else.
- **`src/lib/migrate.js`** — brings any older record up to the current shape, on every load and
  every restore.
- **`src/lib/analytics.js`** — all report maths as pure functions, so `test-analytics.mjs` can
  check the arithmetic without rendering anything.

Screens take `{ s, nav }`, where `s` is the store value. They are plain default-export
components registered in the `renderPushed` switch in `src/App.jsx`.

## Invariants

Each of these exists because breaking it caused a real bug. Do not relax one silently.

1. **No network, ever.** No fetch, no CDN, no analytics, no Google Fonts. The typeface is
   bundled. The only `fetch` in the repo is the service worker's cache handler in `public/sw.js`.
   A dependency that phones home breaks the core promise of the app.
2. **Record CRUD goes through `store.jsx`.** Importing `db.js` elsewhere is allowed only for the
   storage *capability* helpers (`estimateUsage`, `persistStorage`, `storageKind`, `COLLECTIONS`),
   as `exporter.js`, `DataManager.jsx` and `Onboarding.jsx` do. Never to read or write records.
3. **Mutations read `stateRef.current`, never the `state` closure.** React may run a setState
   updater long after the call returns; two back-to-back writes computed from a stale snapshot
   silently lose the first. Use `commit(next)`, which sets the ref and the state together.
4. **Every amount passes `round2()` on the way into the database.** Splitting 350 three ways
   leaves `116.66666666666667`; storing that makes every later total drift.
5. **Migrations are additive and idempotent.** Nothing is renamed, nothing is dropped, running
   twice changes nothing. Spread the old record first (`{ ...sh, ... }`) — rebuilding a share
   field by field drops `clearedBy`, and without `clearedBy` the settlement repair runs forever.
6. **Bump `SCHEMA_VERSION` in `migrate.js` when you add a field**, give it a default in
   `migrateTxn` / `migrateState`, and add a line to the field-history comment. A restore of an
   older backup must still work; a backup from a *newer* build is refused, not mangled.
7. **Ledger row semantics.** `account: null` means reports only, no balance movement (a bill
   somebody else paid). `ex: true` means balance only, kept out of reports (transfers, the cash
   leg of a split under `onlyMyShare`, settlements). Getting these backwards is how money
   appears or disappears.
8. **A settlement is a real transaction.** Clearing an IOU without recording the cash movement
   leaves the account short — that is the bug `planRepair` exists to repair. Route every settle
   button through `store.settleDebt`.
9. **Colours come from CSS tokens, through `tint()`.** Never concatenate an alpha suffix onto a
   colour: `"var(--in)" + "1c"` is not a colour, and that is exactly why income rows once
   rendered with no icon tile. Never hardcode a hex in a component when a token exists.
10. **`prefers-reduced-motion` cancels every animation.** Any new transition goes in
    `src/styles.css` under the existing motion tokens and inherits that cancellation.
11. **`public/sw.js` must keep its `__PRECACHE__` and `__VERSION__` placeholders.**
    `scripts/build-sw.mjs` exits 1 without them. The worker never calls `skipWaiting()` on its
    own — a new build must not swap itself in under someone who is mid-entry.
12. **`APP_VERSION` in `src/lib/version.js` tracks `version` in `package.json`.** Both are 0.8.1.
    The More screen quotes the version and the build id, which is what bug reports cite.

## Conventions

- **JavaScript, not TypeScript.** A block comment at the top of a module says why it exists;
  inline comments explain a non-obvious decision, never the syntax. Match the density of the
  file you are editing — this codebase comments reasoning and nothing else.
- **Comments are prose.** Full sentences, usually naming the bug the code prevents. Keep that.
- **Classes are `vy-` prefixed**, defined in the single `src/styles.css`. No CSS modules. Inline
  styles are for computed values only (a width percentage, a tinted background).
- **Icons** come from `lucide-react`, registered in `src/lib/icons.jsx`, rendered through `Ic`.
  Icon tiles use `.vy-row-ic`; the glyph is pinned to 18px unless the tile opts out with `.lg`.
- **Charts are hand-rolled SVG** in `src/components/charts.jsx`. Do not add a chart library.
- **Keep the bundle near 100 KB gzipped.** Four runtime dependencies; a fifth needs a reason
  stated out loud and agreed.
- **Dev-only code is gated on `import.meta.env.DEV` and loaded with a dynamic `import()`**, so it
  is eliminated from production builds. `sampleData.js` and its Onboarding button are the pattern.
- **Money on screen always carries two decimals** via `fmt`; `compact` (₹3.8L) is a deliberately
  different thing for summary tiles. Indian grouping is the default.
- Dates are ISO `YYYY-MM-DD` strings throughout. Never store a `Date` object in a record.
- `id`s come from `uid(prefix)`; `store.add` stamps `createdAt`, `store.update` stamps `updatedAt`.

## How to add things

- **A field on transactions** — `migrate.js` first (default + `SCHEMA_VERSION` + history
  comment), then the Entry form, then `TxnDetail`, then `exporter.js` if it belongs in the CSV.
- **A master data type** — one config object in `src/screens/masterConfigs.jsx` (fields,
  `validate`, `serialize`, `guard`, row rendering) plus an entry in `MASTERS` in `App.jsx`.
  Do not write a new screen; `Master.jsx` renders them all. `guard` must block deleting anything
  a transaction references — archive instead, so the ledger never holds a dangling link.
- **A pushed screen** — a default-export component taking `{ s, nav }`, a `case` in
  `renderPushed`, and `nav.push("name", params)` at the call site. One history entry per screen;
  sheets own none (see `src/lib/backstack.js`).
- **A report figure** — a pure function in `analytics.js` with a case in `test-analytics.mjs`
  written first. The screen only renders it.

## The agent setup in this repo

**Specialists** (`.claude/agents/`) cover the areas where a mistake is expensive and invisible.
Hand them a diff rather than re-deriving their checklists inline.

| Agent | Use it when |
|---|---|
| `ledger-auditor` | anything under `ledger.js`, `settlements.js`, `analytics.js`, `money.js`, or a screen that writes a transaction |
| `schema-guardian` | `migrate.js`, `db.js` or `exporter.js` changed, or a record gained a field |
| `offline-guard` | dependencies, the service worker, build scripts or the manifest changed; and before every release |
| `ui-conventions` | a new screen, component or sheet, or something that looks half-styled |

**Commands** (`.claude/commands/`): `/verify` runs the whole safety net and reads the result
against the known baseline. `/add-field` adds a stored field in the order that keeps old
installs and old backups working. `/add-screen` wires a screen, a master list or a report
figure the way the rest of the app is wired. `/release` cuts a version.

**Hook** (`.claude/hooks/post-edit-check.mjs`, wired in `.claude/settings.json`): after every
edit it runs `check-imports.mjs` on source changes, runs the paired test for a pure-maths
module, and refuses an edit that strips the service-worker placeholders. It ignores the one
known-failing assertion, listed as `BASELINE` in the hook — delete that entry when the test is
fixed. Personal permission overrides belong in `.claude/settings.local.json`, which is ignored
by git.

## Platform note

Development here is Windows with PowerShell. The npm scripts and the `node ...` checks are
cross-platform; nothing in the toolchain needs a POSIX shell.
