---
description: Add a screen, a master data type, or a report figure, wired the way the rest of the app is
argument-hint: <what to build> — e.g. "a Subscriptions master list"
---

Build: $ARGUMENTS

First decide which of these three it actually is. Picking wrong means writing a screen the app
already renders for you.

## If it is a master data list (a CRUD list of records in one collection)

Do **not** write a screen. `src/screens/Master.jsx` renders every one of them from a config.

1. Add a config object to `src/screens/masterConfigs.jsx` next to the existing ones:
   `collection`, `title`, `singular`, `icon`, `emptyBody`, `defaults`, `fields`, `validate`,
   `serialize`, and `rowIcon` / `subtitle` / `rowRight` for the row.
2. Add a `guard` if a transaction can reference the record. It must block deletion of anything
   in use and point the user at archiving instead, so the ledger never holds a dangling id.
   Copy the `usedBy` helper at the top of the file.
3. Register it in the `MASTERS` map in `src/App.jsx`.
4. Link to it with `nav.push("<key>")` from `More.jsx`.
5. If the collection is new, it needs a `COLLECTIONS` entry and a `DB_VERSION` bump in
   `db.js` — use `/add-field` for that part.

## If it is a pushed screen

1. A default-export component in `src/screens/` taking `{ s, nav, ...params }`, opening with
   `<Nav title=... onBack={nav.pop} />` from `components/ui.jsx`.
2. A `case` in `renderPushed` in `src/App.jsx`, and `nav.push("name", params)` at the call
   site. One history entry per screen; the back button unwinds on its own.
3. If it needs a sheet, use `Sheet` from `ui.jsx`. Sheets own no history entry — do not call
   `history.pushState` from a screen.
4. Reuse before building: `Sheet`, `Confirm`, `Switch`, `Seg`, `Nav`, `Field`, `Ring`,
   `Empty`, `SwipeRow`, `PickerSheet`, `ColorPicker`, `IconPicker`, `AnimatedNumber`,
   `Select`, `DatePick`, `useToast`, and the charts in `charts.jsx`.
5. Read records off `s` (`s.txns`, `s.ledger`, `s.balances`, `s.catById`, ...). Write only
   through `s.add` / `s.update` / `s.remove`. Never import `db.js` for records.
6. Give every list an `Empty` state with a real sentence in the voice of the existing ones.

## If it is a report figure

1. Write the pure function in `src/lib/analytics.js` — periods, totals, breakdowns, buckets
   and insights all live there so they can be checked without rendering.
2. Add the cases to `test-analytics.mjs` **first**, using the fixture ledger at the top of the
   file, and watch them fail before you make them pass.
3. Only then render it. The screen does no arithmetic.

## Finishing

Amounts render through `fmt(n, { currency: s.currency })` with two decimals; colours come from
tokens through `tint()`; motion uses the three easing tokens in `styles.css`. Run `/verify`,
then have the `ui-conventions` agent look at the diff.
