---
description: Add a field to a stored record, in the order that keeps old installs and old backups working
argument-hint: <collection> <field> — e.g. txns merchantRef
---

Add `$ARGUMENTS` to the data model. Follow this order; it is the order that keeps existing
installs safe, and skipping ahead to the UI is how a field ships without a migration.

**1. Decide what the field means for records that predate it.** Write that sentence down
before touching code. The default must state the old truth, not invent a new one — `payer:
null` means "paid by me, from my own account", because that is what every older transaction
was. If no honest default exists, say so and stop.

**2. `src/lib/migrate.js`.**
- Apply the default in `migrateTxn` or the relevant branch of `migrateState`.
- Spread the existing record first (`{ ...t, ... }`). Rebuilding field by field silently drops
  anything added later; that is how `clearedBy` was lost and the settlement repair ran forever.
- Bump `SCHEMA_VERSION` and add a line to the field-history comment explaining what the
  version added and why.
- Keep it idempotent: running the migration twice must change nothing.

**3. If it is a new collection**, also add it to `COLLECTIONS` in `src/lib/db.js`, create the
store inside `onupgradeneeded` with any index it needs, and bump `DB_VERSION`. Without the
bump, existing installs never get the store and every write throws.

**4. Writes.** Set the field through `store.add` / `store.update` only — never `db.js`
directly. If it holds money, it passes `round2()` on the way in. If it is a date, it is an ISO
`YYYY-MM-DD` string.

**5. UI.** The Entry form or the relevant `masterConfigs.jsx` config (`fields`, `validate`,
`serialize`, and a `guard` if other records can reference it), then `TxnDetail` or the detail
screen so the value is visible where a user would check it.

**6. Export.** `src/lib/exporter.js` — it belongs in the JSON backup automatically if it is on
the record, but decide deliberately whether it earns a column in the transactions or master
CSV.

**7. Verify.** Run `/verify`. Then state what happens in three cases: an install on the
previous schema, an install several schemas old, and a restore of a backup exported before the
field existed. Each answer should be a real sentence about a real record.

Hand the finished diff to the `schema-guardian` agent before calling it done.
