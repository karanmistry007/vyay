/**
 * Settlements: recording the money that changes hands when a debt is paid off.
 *
 * A settlement is an ordinary transaction with three extras:
 *   - it is filed under a "Settlement" category, so it is identifiable at a glance
 *   - it is excluded from reports, because the original bill is already counted
 *   - it carries `settles`, linking it back to the person and the exact bills it clears
 *
 * Everything here is pure. The planner is what makes the upgrade patch safe: it
 * only ever looks at debts marked settled with no `clearedBy` recorded, so running
 * it twice is a no-op.
 */
import { uid, iso } from "./money.js";
import { myShareOf } from "./ledger.js";

export const SETTLEMENT_CATEGORY = "Settlement";

/** Settlements in are income, settlements out are an expense. */
export const settlementDir = (direction) => (direction === "in" ? "Income" : "Expense");

export function findSettlementCategory(categories, bookId, direction) {
  const want = settlementDir(direction);
  return categories.find(
    (c) => c.book === bookId && c.dir === want && (c.name || "").trim().toLowerCase() === SETTLEMENT_CATEGORY.toLowerCase()
  ) || null;
}

/** The record used when one has to be created. Same shape as any other category. */
export function settlementCategoryRecord(bookId, direction) {
  const income = direction === "in";
  return {
    id: uid("cat"),
    book: bookId,
    name: SETTLEMENT_CATEGORY,
    dir: settlementDir(direction),
    group: "Settlements",
    icon: income ? "Handshake" : "HandCoins",
    color: income ? "#4FBF7B" : "#E8863C",
    quick: false,
    order: 900,
    createdAt: new Date().toISOString(),
  };
}

/** Shape of the marker that makes a transaction a settlement. */
export const settlementMarker = (person, direction, links) => ({
  person,
  direction,
  links: (links || []).map((l) => ({ txn: l.txn, share: l.share || null })),
});

/**
 * Debts marked settled where no money was ever recorded.
 *
 * `clearedBy` undefined means the settle happened before settlements recorded a
 * movement. `"none"` means somebody deliberately said no money changed hands, and
 * an id means it is already accounted for — both are left alone.
 */
export function findUnrecorded(txns, bookId) {
  const out = [];
  for (const t of txns) {
    if (bookId && t.book !== bookId) continue;
    if (t.settles) continue;
    if (!t.payer) {
      for (const sh of t.shares || []) {
        if (sh.settled && sh.clearedBy === undefined && (Number(sh.amount) || 0) > 0) {
          out.push({ txn: t, person: sh.person, amount: Number(sh.amount) || 0, direction: "in", share: sh.person });
        }
      }
    } else if (t.mySettled && t.myClearedBy === undefined) {
      const mine = myShareOf(t);
      if (mine > 0) out.push({ txn: t, person: t.payer, amount: mine, direction: "out", share: null });
    }
  }
  return out;
}

/**
 * Group by person, direction and the account the bill was paid from — money
 * usually comes back the way it went out, so each account is put right on its own.
 */
export function groupUnrecorded(txns, bookId) {
  const grouped = {};
  for (const item of findUnrecorded(txns, bookId)) {
    const suggested = item.direction === "in" ? (item.txn.account || null) : null;
    const key = `${item.txn.book}|${item.person}|${item.direction}|${suggested || "none"}`;
    if (!grouped[key]) {
      grouped[key] = {
        key, book: item.txn.book, person: item.person, direction: item.direction,
        suggested, amount: 0, items: [],
      };
    }
    grouped[key].amount += item.amount;
    grouped[key].items.push(item);
  }
  return Object.values(grouped).sort((a, b) => b.amount - a.amount);
}

/**
 * Work out exactly what to write, without writing anything.
 *
 * `accountFor(group)` decides where the money went; returning null skips that
 * group and leaves it for the person to handle by hand. Nothing here mutates,
 * so the same plan can be previewed, tested, or applied.
 */
export function planRepair(state, { accountFor, dateFor, bookId } = {}) {
  const groups = groupUnrecorded(state.txns, bookId);
  const newCategories = [];
  const newTxns = [];
  const updates = new Map();
  const skipped = [];

  // One category per book and direction, created at most once per plan.
  const categoryCache = {};
  const categoryFor = (book, direction) => {
    const cacheKey = `${book}|${direction}`;
    if (categoryCache[cacheKey]) return categoryCache[cacheKey];
    const existing = findSettlementCategory(state.categories, book, direction);
    if (existing) { categoryCache[cacheKey] = existing.id; return existing.id; }
    const created = settlementCategoryRecord(book, direction);
    newCategories.push(created);
    categoryCache[cacheKey] = created.id;
    return created.id;
  };

  for (const group of groups) {
    const account = accountFor ? accountFor(group) : group.suggested;
    if (!account) { skipped.push(group); continue; }

    // Date it with the most recent bill it covers, so balances read correctly
    // back through history rather than all landing on the day of the upgrade.
    const latest = group.items.map((i) => i.txn.date).sort().pop();
    const date = dateFor ? dateFor(group) : latest || iso(new Date());

    const settlement = {
      id: uid("txn"),
      book: group.book,
      type: settlementDir(group.direction),
      date,
      amount: Math.round(group.amount * 100) / 100,
      account,
      to: null,
      cat: categoryFor(group.book, group.direction),
      ret: null,
      method: null,
      notes: "",
      status: "Cleared",
      exclude: true,
      splits: null,
      shares: null,
      tags: [],
      payer: null,
      mySettled: false,
      includeMe: true,
      settles: settlementMarker(group.person, group.direction,
        group.items.map((i) => ({ txn: i.txn.id, share: i.share }))),
      createdAt: new Date().toISOString(),
    };
    newTxns.push(settlement);

    // Stamp every share this settlement covers, collected per transaction so two
    // people on one bill cannot overwrite each other.
    for (const item of group.items) {
      const current = updates.get(item.txn.id) || { id: item.txn.id, patch: {} };
      if (item.direction === "out") {
        current.patch.mySettled = true;
        current.patch.myClearedBy = settlement.id;
      } else {
        const base = current.patch.shares || item.txn.shares || [];
        current.patch.shares = base.map((sh) =>
          sh.person === item.person && sh.settled && sh.clearedBy === undefined
            ? { ...sh, clearedBy: settlement.id }
            : sh);
      }
      updates.set(item.txn.id, current);
    }
  }

  return {
    categories: newCategories,
    txns: newTxns,
    updates: [...updates.values()],
    skipped,
    total: newTxns.reduce((a, t) => a + t.amount, 0),
    count: newTxns.length,
  };
}

/** Apply a plan to a plain state object. Used by the upgrade patch and by tests. */
export function applyPlan(state, plan) {
  if (!plan.count && !plan.updates.length) return state;
  const patched = new Map(plan.updates.map((u) => [u.id, u.patch]));
  return {
    ...state,
    categories: [...state.categories, ...plan.categories],
    txns: [
      ...state.txns.map((t) => (patched.has(t.id) ? { ...t, ...patched.get(t.id) } : t)),
      ...plan.txns,
    ],
  };
}
