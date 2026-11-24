## What this changes and why

<!-- The reasoning, not the file list. What was wrong, or what this makes possible. -->

## Verification

Paste the `npm run verify` table. The known analytics baseline failure is expected; anything
else is a regression.

```
```

<!-- Tick what applies. CI checks the first two; the agents below read a diff, which CI cannot. -->

- [ ] `npm run verify` — no new failures
- [ ] `npm run check:invariants` — passes
- [ ] `npm run build` printed its `build-sw:` line (if the build, worker or manifest changed)

## Specialist review

Hand the agent a diff rather than re-deriving its checklist inline.

- [ ] `ledger-auditor` — `ledger.js`, `settlements.js`, `analytics.js`, `money.js`, or a screen that writes a transaction
- [ ] `schema-guardian` — `migrate.js`, `db.js`, `exporter.js`, or a record gained a field
- [ ] `offline-guard` — dependencies, service worker, build scripts or manifest
- [ ] `ui-conventions` — a new screen, component or sheet
- [ ] None of the above apply

## Stored data

<!-- Delete if nothing is stored differently. -->

- [ ] `SCHEMA_VERSION` bumped, with a default in `migrateTxn` / `migrateState` and a line in the field-history comment
- [ ] A backup from the previous build still restores
- [ ] Migrations are additive and idempotent — the old record is spread first

## Still needs a human

<!-- What CI cannot check: an install prompt, a real offline reload, a restore. -->
