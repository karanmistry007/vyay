/**
 * Report maths, kept pure.
 *
 * The screen only arranges what comes out of here, so every figure can be checked
 * without rendering anything. Nothing in this file reads or writes the database.
 */
import { MON, DAYS, daysInMonth, iso, parseISO, monthKey, addMonths, sum, round2 } from "./money.js";

/* ── periods ─────────────────────────────────────────────────────────────── */

export const PERIODS = [
  { v: "month", l: "Month" },
  { v: "year", l: "Year" },
  { v: "all", l: "All time" },
];

const firstDate = (txns) => txns.reduce((min, t) => (!min || t.date < min ? t.date : min), null);

/**
 * A period, the one before it for comparison, and how to bucket the chart.
 * `anchor` is any date inside the period, as "YYYY-MM-DD".
 */
export function buildRange(type, anchor, txns = []) {
  const today = iso(new Date());
  if (type === "year") {
    const year = anchor.slice(0, 4);
    return {
      type, anchor, start: `${year}-01-01`, end: `${year}-12-31`,
      label: year, shortLabel: year, bucket: "month",
      prev: { start: `${+year - 1}-01-01`, end: `${+year - 1}-12-31`, label: String(+year - 1) },
    };
  }
  if (type === "all") {
    const start = firstDate(txns) || today;
    // Monthly bars stay readable up to about two years. Past that there are too
    // many to tell apart, so the chart drops to one bar per year.
    const months = (+today.slice(0, 4) - +start.slice(0, 4)) * 12 + (+today.slice(5, 7) - +start.slice(5, 7));
    return {
      type, anchor: today, start, end: today,
      label: "All time", shortLabel: "All", bucket: months > 24 ? "year" : "month",
      prev: null,
    };
  }
  const mk = anchor.slice(0, 7);
  const prevMk = addMonths(mk, -1);
  return {
    type: "month", anchor, start: `${mk}-01`, end: `${mk}-${String(daysInMonth(mk)).padStart(2, "0")}`,
    label: `${MON[+mk.slice(5, 7) - 1]} ${mk.slice(0, 4)}`,
    shortLabel: MON[+mk.slice(5, 7) - 1],
    bucket: "day",
    prev: {
      start: `${prevMk}-01`, end: `${prevMk}-${String(daysInMonth(prevMk)).padStart(2, "0")}`,
      label: `${MON[+prevMk.slice(5, 7) - 1]} ${prevMk.slice(0, 4)}`,
    },
  };
}

/** Step a period forwards or backwards. All-time has nowhere to go. */
export function stepRange(range, delta, txns = []) {
  if (range.type === "all") return range;
  if (range.type === "year") {
    const year = +range.anchor.slice(0, 4) + delta;
    return buildRange("year", `${year}-01-01`, txns);
  }
  return buildRange("month", `${addMonths(range.anchor.slice(0, 7), delta)}-01`, txns);
}

/** Whether stepping forward would land entirely in the future. */
export const canStepForward = (range) => {
  if (range.type === "all") return false;
  const today = iso(new Date());
  return range.end < today;
};

const within = (date, start, end) => date >= start && date <= end;

/** Years that actually contain something, newest first, always including this one. */
export function availableYears(txns) {
  const years = new Set(txns.map((t) => t.date.slice(0, 4)));
  years.add(iso(new Date()).slice(0, 4));
  return [...years].sort().reverse();
}

/** Which months of a year hold anything, for greying out the empty ones. */
export function monthsWithActivity(txns, year) {
  const months = new Set();
  txns.forEach((t) => { if (t.date.slice(0, 4) === year) months.add(+t.date.slice(5, 7)); });
  return months;
}

/**
 * The transactions behind a figure on the report.
 *
 * Splits mean a transaction can belong to a category it is not filed under, and
 * tags are many-per-transaction, so matching has to look inside both.
 */
export function filterTxns(txns, range, { kind = "Expense", dim, key } = {}) {
  const matchesDim = (t) => {
    if (!dim || dim === "all") return true;
    const none = key === "_none";
    switch (dim) {
      case "cats":
        if (none) return !t.cat && !(t.splits || []).length;
        return t.cat === key || (t.splits || []).some((sp) => sp.cat === key);
      case "merchants": return none ? !t.ret : t.ret === key;
      case "methods": return none ? !t.method : t.method === key;
      case "accounts": return none ? !t.account : t.account === key;
      case "tags": return none ? !(t.tags || []).length : (t.tags || []).includes(key);
      default: return true;
    }
  };
  return txns
    .filter((t) => within(t.date, range.start, range.end))
    .filter((t) => !t.exclude)
    .filter((t) => (kind === "All" ? t.type !== "Transfer" : t.type === kind))
    .filter(matchesDim)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** What those transactions add up to, counting only the part that matches. */
export function filteredTotal(txns, range, filter) {
  const rows = filterTxns(txns, range, filter);
  if (filter.dim === "cats" && filter.key && filter.key !== "_none") {
    // Only the slice of a split bill that belongs to this category counts.
    return round2(sum(rows.map((t) => {
      if (!t.splits || !t.splits.length) return t.amount;
      return sum(t.splits.filter((sp) => sp.cat === filter.key).map((sp) => sp.amount));
    })));
  }
  return round2(sum(rows.map((t) => t.amount)));
}

/* ── the figures ─────────────────────────────────────────────────────────── */

const flowRows = (ledger, start, end, kind = "Expense") =>
  ledger.filter((r) => r.kind === kind && !r.ex && within(r.date, start, end));
const spendRows = (ledger, start, end) => flowRows(ledger, start, end, "Expense");
const earnRows = (ledger, start, end) => flowRows(ledger, start, end, "Income");

export const spentBetween = (ledger, start, end) => round2(-sum(spendRows(ledger, start, end).map((r) => r.amount)));
export const earnedBetween = (ledger, start, end) => round2(sum(earnRows(ledger, start, end).map((r) => r.amount)));

/** How many days of the period have actually happened, for a fair daily average. */
export function elapsedDays(range) {
  const today = iso(new Date());
  const last = range.end > today ? today : range.end;
  if (last < range.start) return 0;
  return Math.round((parseISO(last) - parseISO(range.start)) / 86400000) + 1;
}

export function summarise(ledger, txns, range) {
  const spent = spentBetween(ledger, range.start, range.end);
  const earned = earnedBetween(ledger, range.start, range.end);
  const days = Math.max(1, elapsedDays(range));
  const entries = txns.filter((t) => within(t.date, range.start, range.end)).length;
  const spendCount = txns.filter((t) => t.type === "Expense" && !t.exclude && within(t.date, range.start, range.end)).length;

  const prevSpent = range.prev ? spentBetween(ledger, range.prev.start, range.prev.end) : null;
  const prevEarned = range.prev ? earnedBetween(ledger, range.prev.start, range.prev.end) : null;

  return {
    spent, earned, saved: round2(earned - spent),
    savingsRate: earned > 0 ? (earned - spent) / earned : null,
    perDay: round2(spent / days),
    days, entries, spendCount,
    average: spendCount ? round2(spent / spendCount) : 0,
    prevSpent, prevEarned,
    change: prevSpent ? (spent - prevSpent) / prevSpent : null,
  };
}

/**
 * One calendar day, for the recap sent after midnight.
 *
 * Spend and income come from the ledger, so a split bill counts only your share and
 * a settlement counts nothing, exactly as the reports do. Transfers are reported as
 * money moved rather than spent: calling a top-up of your own wallet "spending" is
 * the kind of number that makes people stop trusting the recap.
 */
export function daySummary(ledger, txns, date, lookup = {}) {
  const onDay = txns.filter((t) => t.date === date);
  const byCat = {};
  spendRows(ledger, date, date).forEach((r) => { byCat[r.cat || "_none"] = (byCat[r.cat || "_none"] || 0) - r.amount; });
  // On a tie a named category wins over "Uncategorised", rather than whichever row came first.
  const [topKey, topValue] = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1] || (a[0] === "_none") - (b[0] === "_none"))[0] || [];
  const topCat = topKey && lookup.catById ? lookup.catById[topKey] : null;

  return {
    date,
    entries: onDay.length,
    spent: spentBetween(ledger, date, date),
    earned: earnedBetween(ledger, date, date),
    moved: round2(sum(onDay.filter((t) => t.type === "Transfer").map((t) => Number(t.amount) || 0))),
    top: topKey ? { key: topKey, name: topCat ? topCat.name : "Uncategorised", amount: round2(topValue) } : null,
  };
}

/**
 * The recurring items that fall on `date`, for the payment reminder.
 *
 * A recurring item stores only a day of the month, so a day past the end of a short
 * month is moved to its last day: rent set for the 31st is due on 30 November and
 * 28 February, rather than silently skipping those months.
 */
export function recurringDue(recurring, date) {
  const dayNo = Number(date.slice(8, 10));
  const last = daysInMonth(date.slice(0, 7));
  return (recurring || []).filter((r) => {
    const d = Math.trunc(Number(r.day));
    if (!(d >= 1)) return false;
    return Math.min(d, last) === dayNo;
  });
}

/* ── breakdowns ──────────────────────────────────────────────────────────── */

/**
 * Totals by any dimension, with each slice's share and its movement against the
 * previous period. Tags are many-per-transaction, so a tagged amount counts once
 * against each of its tags and the shares deliberately exceed 100%.
 */
export function breakdown(ledger, range, keyFn, lookup, { multi = false, kind = "Expense" } = {}) {
  const sign = kind === "Income" ? 1 : -1;
  const tally = (start, end) => {
    const totals = {};
    for (const row of flowRows(ledger, start, end, kind)) {
      const keys = multi ? (keyFn(row) || []) : [keyFn(row)];
      const list = keys.length ? keys : [null];
      for (const key of list) totals[key || "_none"] = (totals[key || "_none"] || 0) + sign * row.amount;
    }
    return totals;
  };

  const now = tally(range.start, range.end);
  const before = range.prev ? tally(range.prev.start, range.prev.end) : {};
  const total = sum(Object.values(now));

  return Object.entries(now)
    .map(([key, value]) => {
      const was = before[key] || 0;
      return {
        key,
        item: key === "_none" ? null : lookup[key] || null,
        value: round2(value),
        share: total ? value / total : 0,
        previous: round2(was),
        change: was ? (value - was) / was : null,
      };
    })
    .sort((a, b) => b.value - a.value);
}

/* ── charts ──────────────────────────────────────────────────────────────── */

/** Spend and income bucketed for the period's chart: by day, month or year. */
export function series(ledger, range) {
  const buckets = [];
  if (range.bucket === "day") {
    const mk = range.start.slice(0, 7);
    for (let d = 1; d <= daysInMonth(mk); d++) {
      const date = `${mk}-${String(d).padStart(2, "0")}`;
      buckets.push({ key: date, name: String(d), start: date, end: date });
    }
  } else if (range.bucket === "month") {
    const year = range.start.slice(0, 4);
    const from = range.type === "all" ? range.start.slice(0, 7) : `${year}-01`;
    const to = range.end.slice(0, 7);
    let cursor = from;
    while (cursor <= to) {
      const last = `${cursor}-${String(daysInMonth(cursor)).padStart(2, "0")}`;
      buckets.push({ key: cursor, name: MON[+cursor.slice(5, 7) - 1], start: `${cursor}-01`, end: last });
      cursor = addMonths(cursor, 1);
    }
  } else {
    for (let y = +range.start.slice(0, 4); y <= +range.end.slice(0, 4); y++) {
      buckets.push({ key: String(y), name: String(y), start: `${y}-01-01`, end: `${y}-12-31` });
    }
  }
  return buckets.map((b) => ({
    ...b,
    spent: spentBetween(ledger, b.start, b.end),
    earned: earnedBetween(ledger, b.start, b.end),
  }));
}

/** Spend per weekday, Monday first, with the heaviest flagged. */
export function weekdays(ledger, range) {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  for (const row of spendRows(ledger, range.start, range.end)) totals[parseISO(row.date).getDay()] -= row.amount;
  const max = Math.max(...totals);
  return [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    name: DAYS[d].slice(0, 3), v: round2(totals[d]), highlight: totals[d] === max && max > 0,
  }));
}

/** Daily totals for the calendar, only meaningful for a single month. */
export function calendar(ledger, range) {
  const mk = range.start.slice(0, 7);
  const totals = {};
  for (const row of spendRows(ledger, range.start, range.end)) {
    totals[+row.date.slice(8)] = round2((totals[+row.date.slice(8)] || 0) - row.amount);
  }
  const values = Object.values(totals);
  return {
    totals, max: Math.max(...values, 1),
    firstWeekday: new Date(+mk.slice(0, 4), +mk.slice(5, 7) - 1, 1).getDay(),
    days: daysInMonth(mk),
    spentDays: values.length,
    quietDays: Math.max(0, elapsedDays(range) - values.length),
    busiest: Object.entries(totals).sort((a, b) => b[1] - a[1])[0] || null,
  };
}

/* ── things worth saying out loud ────────────────────────────────────────── */

/**
 * Observations a person would otherwise have to work out themselves. Only ones
 * that are actually true for this period are returned, so the list can be empty.
 */
export function insights(ledger, txns, range, lookup) {
  const out = [];
  const stats = summarise(ledger, txns, range);
  if (!stats.spent) return out;

  const cats = breakdown(ledger, range, (r) => r.cat, lookup.catById);
  const top = cats[0];
  if (top && top.item) {
    out.push({
      kind: "top-category", tone: "neutral",
      title: `${top.item.name} took the biggest share`,
      detail: `${Math.round(top.share * 100)}% of everything you spent`,
      value: top.value, color: top.item.color,
    });
  }

  const merchants = breakdown(ledger, range, (r) => r.ret, lookup.retById).filter((x) => x.item);
  if (merchants[0]) {
    out.push({
      kind: "top-merchant", tone: "neutral",
      title: `Most went to ${merchants[0].item.name}`,
      detail: `across ${txns.filter((t) => t.ret === merchants[0].key && within(t.date, range.start, range.end)).length} transactions`,
      value: merchants[0].value,
    });
  }

  if (range.prev && stats.prevSpent) {
    const risen = cats.filter((c) => c.item && c.change !== null && c.change > 0.25 && c.value > stats.spent * 0.05)
      .sort((a, b) => b.change - a.change)[0];
    if (risen) {
      out.push({
        kind: "rising", tone: "warn",
        title: `${risen.item.name} is up ${Math.round(risen.change * 100)}%`,
        detail: `against ${range.prev.label}`,
        value: risen.value, color: risen.item.color,
      });
    }
    const fallen = cats.filter((c) => c.item && c.change !== null && c.change < -0.25 && c.previous > stats.prevSpent * 0.05)
      .sort((a, b) => a.change - b.change)[0];
    if (fallen) {
      out.push({
        kind: "falling", tone: "good",
        title: `${fallen.item.name} is down ${Math.abs(Math.round(fallen.change * 100))}%`,
        detail: `against ${range.prev.label}`,
        value: fallen.value, color: fallen.item.color,
      });
    }
  }

  if (range.type === "month") {
    const cal = calendar(ledger, range);
    if (cal.quietDays > 0) {
      out.push({
        kind: "quiet-days", tone: "good",
        title: `${cal.quietDays} day${cal.quietDays === 1 ? "" : "s"} you spent nothing`,
        detail: `out of ${stats.days} so far`,
      });
    }
    if (cal.busiest) {
      out.push({
        kind: "busiest", tone: "neutral",
        title: `Heaviest day was the ${cal.busiest[0]}${suffix(+cal.busiest[0])}`,
        detail: `${range.shortLabel}`, value: cal.busiest[1],
      });
    }
  }

  const buckets = series(ledger, range).filter((b) => b.spent > 0);
  if (range.type !== "month" && buckets.length > 1) {
    const peak = buckets.reduce((a, b) => (b.spent > a.spent ? b : a));
    const low = buckets.reduce((a, b) => (b.spent < a.spent ? b : a));
    out.push({ kind: "peak", tone: "neutral", title: `${peak.name} was the heaviest`, detail: "of the period", value: peak.spent });
    out.push({ kind: "lightest", tone: "good", title: `${low.name} was the lightest`, detail: "of the period", value: low.spent });
  }

  if (stats.average) {
    out.push({
      kind: "average", tone: "neutral",
      title: `${stats.spendCount} transactions`,
      detail: "averaging", value: stats.average,
    });
  }
  return out;
}

const suffix = (n) => (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

/** Largest single spends in the period. */
export const topSpends = (txns, range, limit = 5) =>
  txns
    .filter((t) => t.type === "Expense" && !t.exclude && within(t.date, range.start, range.end))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);

export { within };
