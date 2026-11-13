import { sum, monthKey } from "./money.js";

/** Everyone else's portions added up. */
export const sharesTotal = (t) => (t.shares || []).reduce((a, x) => a + (Number(x.amount) || 0), 0);

/** Your own portion of a bill. With no split recorded, the whole thing is yours. */
export function myShareOf(t) {
  if (!t.shares || !t.shares.length) return Number(t.amount) || 0;
  return Math.max(0, (Number(t.amount) || 0) - sharesTotal(t));
}

/** Who actually handed over the money: a person's id, or "me". */
export const payerOf = (t) => t.payer || "me";

/**
 * Single-leg ledger with dimensions.
 * Every transaction fans out into flat rows: one per split line, two for a transfer.
 * Balances, category totals, merchant totals and net worth are all one reduce over this.
 *
 * Two rows carry special meaning:
 *  - `account: null` rows never touch an account balance, only the reports. They exist
 *    for bills somebody else paid, where you owe a share but no money left your pocket.
 *  - `ex: true` rows are the mirror image: they move a balance but stay out of reports.
 */
export function buildLedger(txns, opts = {}) {
  const rows = [];
  for (const t of txns) {
    if (t.type === "Transfer") {
      rows.push({ t, date: t.date, account: t.account, amount: -t.amount, kind: "Transfer Out", cat: null, ret: t.ret, method: t.method, tags: t.tags || [], ex: true });
      rows.push({ t, date: t.date, account: t.to, amount: t.amount, kind: "Transfer In", cat: null, ret: t.ret, method: t.method, tags: t.tags || [], ex: true });
      continue;
    }
    const sign = t.type === "Income" ? 1 : -1;
    const legs = t.splits && t.splits.length ? t.splits : [{ cat: t.cat, amount: t.amount }];
    const base = { t, date: t.date, ret: t.ret, method: t.method, tags: t.tags || [] };

    if (t.payer) {
      // Somebody else paid. No account of yours moves, so only your share is your spending.
      const mine = myShareOf(t);
      if (mine <= 0) continue;
      const factor = t.amount ? mine / t.amount : 0;
      for (const leg of legs) {
        rows.push({ ...base, account: null, amount: sign * leg.amount * factor, kind: t.type,
          cat: leg.cat, ex: !!t.exclude, paidByOther: true });
      }
      continue;
    }

    if (opts.onlyMyShare && t.type === "Expense" && t.shares && t.shares.length) {
      // You paid the whole bill, so the whole bill leaves your account, but the part
      // you get back is not your spending. Two rows: one moves money, one reports.
      rows.push({ ...base, account: t.account, amount: -(Number(t.amount) || 0), kind: "Expense",
        cat: null, ex: true, cashLeg: true });
      const mine = myShareOf(t);
      const factor = t.amount ? mine / t.amount : 0;
      if (factor > 0) {
        for (const leg of legs) {
          rows.push({ ...base, account: null, amount: -leg.amount * factor, kind: "Expense",
            cat: leg.cat, ex: !!t.exclude, reportLeg: true });
        }
      }
      continue;
    }

    for (const leg of legs) {
      rows.push({ ...base, account: t.account, amount: sign * leg.amount, kind: t.type,
        cat: leg.cat, ex: !!t.exclude });
    }
  }
  return rows;
}

export function balancesFor(accounts, ledger) {
  const bal = {};
  accounts.forEach((a) => { bal[a.id] = Number(a.opening) || 0; });
  ledger.forEach((r) => { if (bal[r.account] !== undefined) bal[r.account] += r.amount; });
  return bal;
}

export const spentIn = (ledger, mk) =>
  -sum(ledger.filter((r) => monthKey(r.date) === mk && r.kind === "Expense" && !r.ex).map((r) => r.amount));

export const earnedIn = (ledger, mk) =>
  sum(ledger.filter((r) => monthKey(r.date) === mk && r.kind === "Income" && !r.ex).map((r) => r.amount));

/** Group expense rows by tag. A transaction with three tags counts once against each. */
export function groupByTag(ledger) {
  const m = {};
  ledger.filter((r) => r.kind === "Expense" && !r.ex).forEach((r) => {
    (r.tags && r.tags.length ? r.tags : ["_none"]).forEach((tag) => { m[tag] = (m[tag] || 0) - r.amount; });
  });
  return Object.entries(m).map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
}

/** Categories the user pinned to the quick row, in their chosen order. */
export const byOrder = (a, b) =>
  (a.order === undefined ? 999 : a.order) - (b.order === undefined ? 999 : b.order)
  || (a.name || "").localeCompare(b.name || "");

/** Group expense rows by a dimension and return a sorted [{ key, value }] list. */
export function groupExpenses(ledger, keyFn) {
  const m = {};
  ledger.filter((r) => r.kind === "Expense" && !r.ex).forEach((r) => {
    const k = keyFn(r) || "_none";
    m[k] = (m[k] || 0) - r.amount;
  });
  return Object.entries(m).map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
}

/** Total still owed to you across unsettled shares. */
export function openBalances(txns) {
  const owed = {};
  txns.forEach((t) => (t.shares || []).forEach((s) => {
    if (!s.settled) owed[s.person] = (owed[s.person] || 0) + s.amount;
  }));
  return owed;
}

/**
 * Net outstanding per person, combining unsettled bill splits with any amounts
 * recorded by hand. Positive means they owe you, negative means you owe them.
 */
export function personBalances(txns, entries) {
  const net = {};
  txns.forEach((t) => {
    if (t.payer) {
      // They paid for you, so you owe them your share.
      const mine = myShareOf(t);
      if (mine > 0 && !t.mySettled) net[t.payer] = (net[t.payer] || 0) - mine;
      return;
    }
    (t.shares || []).forEach((sh) => {
      if (!sh.settled) net[sh.person] = (net[sh.person] || 0) + (Number(sh.amount) || 0);
    });
  });
  (entries || []).forEach((e) => {
    net[e.person] = (net[e.person] || 0) + (Number(e.amount) || 0);
  });
  return net;
}

/** True when this transaction exists only to record a debt being paid off. */
export const isSettlement = (t) => !!t.settles;

/**
 * Every open debt in the group, including ones you are not part of.
 * On a shared trip Pradip may have paid for Babu as well as for you; that debt is
 * Babu's to Pradip, it never passes through your balance, but you still want to see it.
 * Returns netted pairs: { from, to, amount } where ids are a person id or "me".
 */
export function groupDebts(txns, opts = {}) {
  const pairs = {};
  const add = (from, to, amount) => {
    if (!amount || from === to) return;
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    const forward = from < to ? amount : -amount;
    pairs[key] = (pairs[key] || 0) + forward;
  };

  txns.forEach((t) => {
    if (opts.tag && !(t.tags || []).includes(opts.tag)) return;
    if (!t.shares || !t.shares.length) return;
    const payer = payerOf(t);

    t.shares.forEach((sh) => {
      if (sh.person === payer || sh.settled) return;
      add(sh.person, payer, Number(sh.amount) || 0);
    });

    if (t.payer) {
      const mine = myShareOf(t);
      if (mine > 0 && !t.mySettled) add("me", t.payer, mine);
    }
  });

  return Object.entries(pairs)
    .map(([key, value]) => {
      const [a, b] = key.split("|");
      return value >= 0 ? { from: a, to: b, amount: value } : { from: b, to: a, amount: -value };
    })
    .filter((x) => Math.abs(x.amount) > 0.005)
    .sort((a, b) => b.amount - a.amount);
}

/** One person's running history: hand-recorded amounts plus their share of split bills. */
export function personHistory(personId, txns, entries) {
  const rows = (entries || [])
    .filter((e) => e.person === personId)
    .map((e) => ({ kind: e.kind || "Manual", id: e.id, date: e.date, amount: Number(e.amount) || 0, note: e.note || "", entry: e }));

  txns.forEach((t) => {
    if (t.payer === personId) {
      const mine = myShareOf(t);
      if (mine > 0) {
        rows.push({ kind: "PaidForYou", id: t.id + ":mine", date: t.date, amount: t.mySettled ? 0 : -mine,
          gross: -mine, settled: !!t.mySettled, note: t.notes || "", txn: t });
      }
      return;
    }
    if (t.payer) return; // their debt is to whoever paid, not to you
    (t.shares || []).forEach((sh) => {
      if (sh.person !== personId) return;
      rows.push({ kind: "Split", id: t.id + ":" + personId, date: t.date, amount: sh.settled ? 0 : sh.amount,
        gross: sh.amount, settled: !!sh.settled, note: t.notes || "", txn: t });
    });
  });

  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
