# Changelog

Every version of Vyay that reached users, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the numbers follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), read for a local-first app as set
out under "Versioning and releases" in `CLAUDE.md`.

Write for the person using the app, not for the code: what they can now do, what stopped going
wrong, and whether anything about their data changed. The section for a version becomes the
body of its GitHub release, so it must exist before the tag is pushed. The release notes open
with the live app, https://vyay.karanmistry.in, which the release workflow adds on its own.

## [Unreleased]

## [1.0.1] — 2026-11-25

### Fixed

- Quick add no longer sits silently with no voice button on phones. Where voice is off, it now
  says why: Chrome on Android cannot yet turn speech into text on the phone itself, only by
  sending it to a server, and Vyay never does that. A browser that does not answer the question
  no longer leaves the sheet waiting, and "Check again" asks once more.

### Your data

Nothing about stored data changed. It stays at schema 6, so an install or backup from 1.0.0
carries forward as it is.

## [1.0.0] — 2026-11-25

The first production release. Earlier builds (0.x) were previews; installs and backups from
them carry forward unchanged.

### What Vyay is

A personal money tracker that runs entirely on your device. Every record lives in the
browser's own database. There is no account, no server and no network call, and the app
works with no connection at all once installed.

### In this release

- **Transactions** — expenses, income and transfers across accounts, with categories,
  merchants, payment methods, tags, notes and splits across several categories.
- **Quick add by sentence or voice** — type or say "lunch 250 at Cafe Coffee Day yesterday"
  and it becomes a draft entry. Speech is recognised on the device only; where the phone
  cannot do that, voice is unavailable rather than sent to a server.
- **Shared bills and settling up** — record a bill you paid for others, or one somebody else
  paid, and see who owes whom. Settling a debt records the money actually moving, so account
  balances stay right.
- **Reports** — month, year and all-time views, each compared with the period before. Every
  figure opens the transactions behind it.
- **Planning** — budgets, savings goals, recurring payments and auto-categorise rules.
- **Books** — keep separate sets of accounts, such as personal and business, side by side.
- **Notifications** — a daily recap of yesterday after midnight, and a reminder the day before
  and on the day each recurring payment is due.
- **Looks** — light and dark mode, and a Liquid Glass theme alongside the default one.
- **Privacy** — hide every amount with one switch, and lock the app with a PIN.
- **Your data** — JSON backup and restore, CSV export, and erase everything. A backup from an
  older build always restores; one from a newer build is refused rather than mangled.
- **Installable and offline** — add it to the home screen as an app. New builds download in
  the background and wait for you to restart; they never swap in mid-entry.
- **About** — More → About shows the version and build. Tap it to copy them for a bug report.

### Your data

Stored data is at schema 6. Nothing is renamed or dropped, so an install or backup from any
0.x build upgrades on first load with nothing to do.

[Unreleased]: https://github.com/karanmistry007/vyay/compare/v1.0.1...develop
[1.0.1]: https://github.com/karanmistry007/vyay/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/karanmistry007/vyay/releases/tag/v1.0.0
