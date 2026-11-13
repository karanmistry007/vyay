# Vyay

Version 0.8.1. A local-first personal money tracker: React + Vite, installable as a PWA,
every record stored in the browser's own database.

A personal money tracker that runs entirely on your own device. React + Vite, installable as a
PWA, with every record stored in the browser's IndexedDB. There is no backend, no account and no
network call anywhere in the app.

## Icons

Every icon tile is a tint of something, at one strength, one size and one radius:

- a record's own colour for categories, accounts, people, tags and books
- `--icon-neutral` with `--ink2` for navigation and settings rows, via `.vy-row-ic.neutral`
- `--icon-solid-bg` with `--ink` for quick-action tiles and empty states

Nothing is solid black any more except *selection* states, where a filled shape means the same
thing it does on a selected chip. `.vy-row-ic:not(.lg) > svg` pins the glyph to 18px whatever size
a caller passed, so a stray `size={21}` cannot break the rhythm; tiles that set their own
dimensions opt out with `.lg`.

## Reports

The reporting tab covers three periods: **Month**, **Year** and **All time**. Step with the arrows
either side of the title, or tap the title to pick a year and month directly — months with nothing
in them are dimmed, future ones disabled. Each period compares itself with the one before, so every
figure carries its movement rather than sitting on its own.

**Every figure opens the transactions behind it.** The headline, Earned, the entry count, each
breakdown row, and "see all" on the biggest spends. A drill-down groups by day like the Activity
tab, totals what matched, and notes when a split bill only partly belongs there. The whole analysis
runs over income as well as spending through one toggle, so "where it came from" is as answerable
as "where it went".

The period, dimension and spending/income choice survive navigating away and back, which pushing a
screen would otherwise reset.

A period shows the total spent with its change, earned, saved and the share of income kept, then:

- **A chart matched to the period.** A month gets a bar per day; a year gets twelve months with
  spend and income plotted together; all time gets months up to two years and years beyond that,
  because sixty bars tell you nothing.
- **Worth noticing** — the biggest category and merchant, anything up or down more than a quarter
  against the previous period, the quiet days, the heaviest day, and how many transactions it took.
  Only observations that are actually true are listed, so the section can be empty.
- **By category** as a donut with a percentage legend.
- **Breakdown** across categories, merchants, payment methods, accounts and tags, each row showing
  its share and how it moved. Tags are many-per-transaction, so those shares deliberately exceed
  100%: the question a tag answers is "what did the trip cost", not "where did the month go".
- **Which days cost most**, the calendar for a single month, the biggest single spends, and an
  export of just that period.

Charts fill the space they are given: bars occupy their whole slot rather than sitting as
hairlines in the middle of it, days with nothing spent draw nothing at all rather than a row of
marks along the baseline, and axis labels are positioned by percentage so the last one cannot be
clipped by the edge of its column. Scrolling content fades into the fixed header instead of being
cut through the middle of a card, and a scrim behind the floating tab bar keeps whatever passes
under it legible.

All of it is computed by pure functions in `src/lib/analytics.js` — periods, totals, breakdowns,
buckets and insights — so the arithmetic is checked by `test-analytics.mjs` without rendering
anything. Reports read the ledger and write nothing, so this release needs no schema change.

## Money on screen

Every exact figure carries two decimals. A balance of 19,051.06 reads the same in the account
header, the activity list and the ledger — it used to round to 19,051 in some places and not
others. `compact` is deliberately different: it is a rounded summary like ₹3.8L for a net-worth
tile, and stays short.

Amounts are rounded to the paisa on the way into the database, not just on the way out. Splitting
350 three ways leaves 116.66666666666667 in memory; storing that makes every later total drift.
`round2()` guards every write, and the migration cleans up anything stored before it existed.

## Icons

Every icon tile is a translucent wash of a colour, through `tint()` in `src/lib/color.js`.

Tiles used to build that wash by appending an alpha suffix to the colour. That works for a stored
hex but silently produces nonsense for a theme variable — `"var(--in)" + "1c"` is not a colour —
so income and transfer rows rendered with no tile at all while category rows looked fine. `tint()`
keeps the hex fast path and uses `color-mix` for anything else, so the two cases finally match.

Navigation rows carry a hue rather than flat grey, chosen per entry so the lists read as finished
rather than half-styled.

## Motion

Animation is a thin layer in `src/styles.css`, driven by three tokens: a spring for travel,
an ease for fades, a bounce for feedback. Screens push in with the outgoing one parallaxing
and dimming; lists, tiles and stat rows rise in sequence; chips and the compose button
spring on press; the segmented thumb and the bottom-bar highlight both slide; spark bars grow from their
base and heatmap cells pop in. Hero figures count to their new value through `AnimatedNumber`,
so a month change reads as movement rather than a jump.

It is all CSS transforms and opacity, which the compositor handles, so scrolling stays smooth.
**`prefers-reduced-motion` cancels the lot** — every animation and delay collapses to nothing and
screen transitions are removed entirely, leaving the app fully usable.

## Keeping the app up to date

**More → App → Update the app** asks the browser to look for a new build and says what it found:
already current (with the running build id), downloading, or ready. When a build is waiting the
row turns into **Restart to update** and tapping it hands over to the new worker.

Nothing swaps itself in mid-use. A build that downloads in the background while the app is open
surfaces the same way rather than reloading under you. The version and build id sit at the foot of
the More screen, which is what to quote when reporting a problem.

## Upgrading from an earlier build

Safe to deploy over an existing install. Nothing is renamed or dropped.

- The IndexedDB version is unchanged, so no store is rebuilt.
- `src/lib/migrate.js` runs on every load. It fills in fields added since the last
  release and stamps the schema version, then writes the upgraded rows back once so the
  patching does not repeat on later loads.
- A transaction saved before shared bills existed reads as "paid by you, from your own
  account", which is what it was.
- Backups exported by the previous build restore normally. A backup from a *newer* build
  than the one running is refused rather than silently mangled.

Users keep their books, accounts, categories, transactions, budgets, goals and outstanding
balances. Theme and layout changes touch no data at all.

## Theme

The app paints itself, but the page behind it does not. With the app set to dark while the system
was light, the strip under the tab bar and the overscroll area kept the light page colour and read
as a white band. `html`, `body`, `color-scheme` and the status-bar colour now all follow the
in-app theme, and `test-theme.mjs` checks each of them in both directions.

## Fully offline

The app makes **no network requests at all** once it has loaded. There is no API, no analytics,
no CDN, and the typeface is bundled into the build rather than fetched from Google Fonts, so
there is nothing left to fail when the connection does.

Served over http(s), a service worker precaches every file the build produced — HTML, JS, CSS,
the font and the icons — during its first install. From then on the app opens with no connection
at all: cold start, deep link, airplane mode, laptop switched off.

The precache list is generated at build time by `scripts/build-sw.mjs`, because Vite hashes asset
filenames and only the finished build knows what they are. The cache is named after a hash of that
list, so every build gets a fresh cache and the old one is deleted on activation.

Updates never swap themselves in mid-use. A new build installs in the background and waits; the
app shows **"A new version is ready"** with a Reload action, and only then does the new worker take
over. **More → Backup & export** shows whether the offline cache is in place.

Opening the built files straight from disk still runs the app — a service worker just needs
http(s), so you get no offline cache that way, only the page you already have open.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

Production build:

```bash
npm run build        # writes ./dist
npm run preview      # serves ./dist with --host so your phone can reach it
```

## Get it onto your phone

Three options, in increasing order of how much it behaves like a real app.

**1. Over your LAN — fastest, good enough for data entry**

```bash
npm run build && npm run preview
```

Open `http://<your-laptop-ip>:4173` on the phone. Everything works and data saves. The service
worker will not register, because browsers only allow that on a secure origin, so you get no
offline cache and no install prompt — the laptop has to stay reachable.

**2. Through an HTTPS tunnel — full PWA, laptop must stay on**

```bash
npm run build && npx serve dist -l 4173
npx cloudflared tunnel --url http://localhost:4173
```

Open the `https://…trycloudflare.com` address on the phone, then **Add to home screen**. The
service worker registers, the app installs, and it opens fullscreen with its own icon.

**3. Static hosting — the one to use for a few weeks of real testing**

`dist/` is plain static files. Drop it on Netlify, Vercel, Cloudflare Pages or GitHub Pages.
Your data still never leaves the phone; the host only ever serves the app shell. This gives you a
stable HTTPS URL so the installed app keeps working without your laptop running.

## Where the data lives

IndexedDB, database `vyay`, one object store per collection:

```
books  accounts  categories  retailers  methods  people
txns   budgets   goals       recurring  rules    meta
```

`src/lib/db.js` is the only file that talks to IndexedDB. Everything above it works against plain
arrays held in React state, so swapping IndexedDB for a Frappe REST backend later means rewriting
that one module and the action bodies in `src/lib/store.jsx`.

On first run the app asks the browser to mark storage as persistent. Grant it if prompted —
without it, a browser under storage pressure may evict the database. **Take backups anyway.**

### What deletes your data

- Clearing browsing data or site data for the origin
- Uninstalling the installed PWA on Android
- iOS clearing unused web app data after long inactivity
- The "Erase everything" button in Backup & export

## Migrating older data

`src/lib/migrate.js` brings records from any earlier build up to the current shape. It runs on
every load and on every restore, and it is additive and idempotent: nothing is renamed, nothing is
dropped, running it twice changes nothing. A transaction saved before the payer field existed is
read as "paid by you, from your own account", which is what it was.

Restoring a backup exported by an older build is therefore safe. The restore path validates the
file, refuses anything exported by a *newer* build than the one running, migrates it, and only
then writes.

| Schema | Added |
|---|---|
| 1 | the original shape |
| 2 | `peopleEntries` — hand-recorded outstanding amounts |
| 3 | `tags` on transactions; `quick` and `order` on categories |
| 4 | `payer`, `mySettled` and `includeMe` on transactions |

## Backup and export

**More → Backup & export** gives you:

| Output | What it is |
|---|---|
| Full backup (JSON) | Every collection, every book, plus settings. This is the file that restores. |
| Transactions (CSV) | Active book, names resolved, one row per split leg |
| Master data (CSV) | Accounts, categories, merchants, methods, people |

Restore accepts a JSON backup, validates it before touching anything, and replaces the whole
database. Export before you change phones, clear your browser, or ship the real backend.

## The back button

The device back button unwinds the app instead of closing it. Each pushed screen owns one history
entry, and so does the first move away from the Home tab, so back goes: sheet closes, then screen
pops, then you land on Home, and only then does another press leave the app.

Sheets deliberately own no history entry. They intercept one press and the listener immediately
hands the entry back, which means a sheet that closes programmatically can never strand a dead
entry behind it. `src/lib/backstack.js` holds that coordination; `App.jsx` owns the history stack.

## Settling a debt moves money

Marking a share settled clears the IOU **and** records the cash changing hands. These are two
different events and treating them as one was a real bug: pay ₹1,000, split ₹300 each with two
people, take their ₹300 back — the account still showed ₹1,000 gone instead of ₹400, because the
repayment was never recorded anywhere.

A settlement is an ordinary transaction with three extras:

- filed under a **Settlement** category, one per direction, shipped in the starter set and created
  on demand for books that predate it
- `exclude`d from reports, so it corrects the balance without inflating spending — the original
  bill is already counted in full
- carrying `settles`, which names the person and links the exact bills it clears

Both ends of that link are live: a settlement lists the bills it paid off, and a settled share on a
bill says "tap to see the payment". "No money changed hands" is still offered for debts squared off
some other way.

### The upgrade patch

Debts settled before any of this existed left accounts short. On first load after updating, the
app finds them and records the missing movements itself, then says how many it fixed.

- Each is dated from the bill it clears, not the day of the upgrade, so balances read correctly
  back through history.
- Each goes through the account its bill was paid from, because money usually comes back the way
  it went out. Two bills to the same person on different accounts put both accounts right.
- Anything it cannot place — a bill somebody else paid, where no account of yours was involved —
  is left for **Settle up → Settlement check**, which shows the same groups with account pickers.

It is idempotent by construction: it only touches debts marked settled with **no** `clearedBy`
recorded, and stamps each one as it goes. `"none"` means somebody deliberately said no money moved
and is left alone. `planRepair()` in `src/lib/settlements.js` is a pure function, so the patch can
be previewed and tested without writing anything — `test-planner.mjs` covers the arithmetic,
grouping and a second pass being a no-op.

## Shared bills and who paid

A split records **who actually handed over the money**, which may not be you.

- **You paid.** Everyone else owes you their share. Your account drops by the full bill.
- **Somebody else paid.** Say Pradip Mama covers a ₹8,000 Mumbai hotel for four of you.
  Pick him under *Who paid*, add Babu Masi and Hina Masi as participants, tap **Split evenly
  between 4**. You now owe Pradip ₹2,000, Babu and Hina owe Pradip ₹2,000 each, and Pradip's
  own ₹2,000 is nobody's debt. **None of your accounts move**, because none of your money did.

Debts between other people never touch your balances, but they are still tracked. **Settle up**
has an *Everyone's balances* section showing every open debt in the group, marked either "on your
balance" or "between them, not you", and it filters by tag so you can see one trip at a time.

Your own share of a bill somebody else paid does count as your spending, since you consumed it.
The full bill still shows on the transaction so the record matches the receipt.

### Counting your own share

There is an asymmetry worth knowing. When somebody else pays, only your share is your spending.
When **you** pay for a group, the default is that the whole bill is your spending, because that is
what left your account.

If you would rather your reports show only your own portion in both cases — useful for trip
totals — turn on **More → Count only my share**. Your account balance still drops by the full
bill; only the reporting changes. It is off by default so existing figures do not move under you.

## People and outstanding amounts

Balances run both ways. A person's net is unsettled bill splits plus anything you record by hand,
where **positive means they owe you and negative means you owe them**.

Tap anyone in **More → People** or **More → Settle up** to open their page: current balance,
buttons to record in either direction, a settle-up action, and the full history. Recording takes
an amount, a date and a note. Settling clears open splits and writes a balancing entry so the
history still adds up rather than silently disappearing.

Settle up shows the whole picture at once: net position, what is coming to you, what you need to
pay, and people grouped into owes-you, you-owe and all-square.

Hand-recorded amounts live in the `peopleEntries` store and are covered by both the JSON backup
and the master data CSV.

## Adding a transaction

The whole form is on one screen in the order you fill it: category, account, payment method,
date, merchant, note, tags, shared bill, options. Nothing is hidden behind a "more" button.

Fields with only a handful of options are chips you tap once rather than pickers that open a
sheet, and the date offers Today and Yesterday directly with a calendar for anything older.

**More → Adding transactions → Entry defaults** sets what a new transaction starts with —
account, payment method, expense category, income category — each with a *Leave empty* option
for anything you would rather pick every time. Defaults are stored per book.

A bill becomes shared the moment you tap someone in **Shared with**; remove the last person and
it is an ordinary expense again. There is no separate toggle.

## Master data

Every master list is one screen driven by config, not ten hand-written screens.
`src/screens/Master.jsx` renders the list and the editor; `src/screens/masterConfigs.jsx` declares
the fields, validation, delete guards and row rendering for each entity. Adding a new master type
is one config object.

Delete is guarded: anything referenced by a transaction cannot be deleted, only archived, so the
ledger never ends up with dangling links.

Onboarding offers a starter set of 25 expense categories, 9 income categories and 7 payment
methods. Take it and prune, or start empty — everything is editable.

## Tags

A transaction can carry any number of tags, and they cut across categories — a Goa trip, a
semester, a house move. Set them up in **More → Tags**, then pick them in the Note, split, status
section of the add screen.

Tags show on the transaction row and detail, filter the Activity list, and get their own breakdown
in **Reports → Tags**. A transaction with three tags counts its full amount against each one, so
those totals deliberately do not sum to your monthly spend — they answer "what did the trip cost",
not "where did the month go". Untagged spend is listed too, so nothing hides.

## The quick-pick row

The chips above the form on the add screen start out as your most recently used categories.
**More → Categories → Arrange the quick-pick row**, or the Arrange chip on the row itself, lets you
pin exactly which categories appear and in what order, separately for expense and income. Reset it
and it goes back to following recency.

## The ledger

`src/lib/ledger.js` is the single-leg-with-dimensions model. A transaction fans out into flat
rows: one per split leg, two for a transfer. Account balances, category totals, merchant totals,
payment-method breakdowns and net worth are all one reduce over that array. Transaction detail
shows the generated rows so you can check the engine against your own arithmetic.

This is the same shape the Frappe backend should use, which is why the export maps cleanly onto it
later.

## Project layout

```
src/
  lib/
    db.js             IndexedDB access — the only storage-aware module
    store.jsx         React context, CRUD actions, derived per-book views
    ledger.js         ledger engine and aggregations
    money.js          currency formatting (Indian and Western grouping), dates
    exporter.js       JSON / CSV export, backup validation
    icons.jsx         icon registry and palette
    presets.js        optional starter master data
  components/
    ui.jsx            sheet, toast, switch, picker, swipe row, calendar
    charts.jsx        donut, bars, cashflow — hand-rolled SVG, no chart library
    TxnRow.jsx
  screens/
    Onboarding, Home, Txns, Entry, TxnDetail, Reports, More,
    Master + masterConfigs, DataManager, Misc (account, category, settle, alerts, lock)
```

No chart library and no component library. The whole bundle is React, react-dom, lucide-react and
a self-hosted variable font — roughly 100 KB of gzipped code plus the woff2 subsets.

The typeface is **Manrope**, bundled rather than fetched, and it carries a real **₹** glyph, so
currency renders in the same family as the digits beside it.

## Known gaps

Deliberately left out until the backend exists: statement import, receipt capture and OCR, push
notifications, multi-user sharing, and recurring transactions posting themselves. Recurring items
are reminders and forecasts only — nothing writes to the ledger without you.
