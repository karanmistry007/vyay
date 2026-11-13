import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as db from "./db.js";
import { uid, round2 } from "./money.js";
import { buildLedger, balancesFor } from "./ledger.js";
import { migrateState, needsMigration, SCHEMA_VERSION } from "./migrate.js";
import { planRepair, applyPlan, findSettlementCategory, settlementCategoryRecord, settlementMarker } from "./settlements.js";

const StoreCtx = createContext(null);
export const useStore = () => useContext(StoreCtx);

const EMPTY = Object.fromEntries(db.COLLECTIONS.map((c) => [c, []]));
const DEFAULT_SETTINGS = { theme: "system", privacy: false, lock: false, pin: "", notif: false, onlyMyShare: false, defaults: {} };

export function StoreProvider({ children }) {
  const [state, setState] = useState({ ...EMPTY, meta: {} });
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const activeBookRef = useRef(null);

  /**
   * Mutations read and write through this ref, never through the `state`
   * closure. React may run a setState updater long after the call returns, so
   * computing the new record inside one and then persisting it lost writes when
   * several updates ran back to back — the second read a stale snapshot and
   * overwrote the first. Holding the latest value here makes every mutation
   * synchronous and ordered.
   */
  const stateRef = useRef(state);
  const commit = useCallback((next) => { stateRef.current = next; setState(next); }, []);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    db.loadAll()
      .then(async (data) => {
        if (!alive) return;
        let upgraded = migrateState(data);

        /*
         * Settlements recorded before the app tracked the money movement left the
         * account short. Put them right on the way in, dating each one to the bill
         * it clears and sending it back through the account that bill was paid
         * from. Only debts with no `clearedBy` at all are touched, so this is a
         * no-op on every load after the first.
         */
        const settings = upgraded.meta.settings || {};
        const bookDefault = (book) => ((settings.defaults || {})[book] || {}).account || null;
        const plan = planRepair(upgraded, {
          accountFor: (g) => g.suggested || bookDefault(g.book),
        });
        if (plan.count) upgraded = applyPlan(upgraded, plan);

        // Write the upgraded records back once, so older data stops being re-patched on every load.
        if (needsMigration(data) || plan.count) {
          await db.putMany("txns", upgraded.txns).catch(() => {});
          if (plan.categories.length) await db.putMany("categories", upgraded.categories).catch(() => {});
          await db.setMeta("schema", SCHEMA_VERSION).catch(() => {});
        }
        if (plan.count) {
          await db.setMeta("lastRepair", {
            at: new Date().toISOString(), count: plan.count, total: plan.total,
          }).catch(() => {});
          upgraded = { ...upgraded, meta: { ...upgraded.meta, lastRepair: { at: new Date().toISOString(), count: plan.count, total: plan.total } } };
          window.dispatchEvent(new CustomEvent("vyay:settlements-repaired", {
            detail: { count: plan.count, total: plan.total, skipped: plan.skipped.length },
          }));
        }

        stateRef.current = upgraded;
        setState(upgraded);
        setStatus("ready");
      })
      .catch((e) => { if (alive) { setError(e.message || String(e)); setStatus("error"); } });
    return () => { alive = false; };
  }, []);

  /* ── writes: update memory first so the UI is instant, then persist ── */
  const add = useCallback(async (collection, record) => {
    const row = { id: uid(collection.slice(0, 3)), createdAt: new Date().toISOString(), ...record };
    const now = stateRef.current;
    commit({ ...now, [collection]: [...now[collection], row] });
    await db.put(collection, row);
    return row;
  }, [commit]);

  const update = useCallback(async (collection, id, patch) => {
    const now = stateRef.current;
    const current = now[collection].find((r) => r.id === id);
    if (!current) return null;
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
    commit({ ...now, [collection]: now[collection].map((r) => (r.id === id ? updated : r)) });
    await db.put(collection, updated);
    return updated;
  }, [commit]);

  const upsert = useCallback(async (collection, record) => {
    const exists = record.id && stateRef.current[collection].some((r) => r.id === record.id);
    return exists ? update(collection, record.id, record) : add(collection, record);
  }, [add, update]);

  const remove = useCallback(async (collection, id) => {
    const now = stateRef.current;
    commit({ ...now, [collection]: now[collection].filter((r) => r.id !== id) });
    await db.remove(collection, id);
  }, [commit]);

  const restore = useCallback(async (collection, record) => {
    const now = stateRef.current;
    commit({ ...now, [collection]: [...now[collection], record] });
    await db.put(collection, record);
  }, [commit]);

  const addMany = useCallback(async (collection, records) => {
    const rows = records.map((r) => ({ id: uid(collection.slice(0, 3)), createdAt: new Date().toISOString(), ...r }));
    const now = stateRef.current;
    commit({ ...now, [collection]: [...now[collection], ...rows] });
    await db.putMany(collection, rows);
    return rows;
  }, [commit]);

  /**
   * Record a debt being paid off. Clears the IOU and, unless the caller says no
   * money moved, writes the matching transaction so the account balance is right.
   * Kept here so every settle button in the app behaves identically.
   */
  const settleDebt = useCallback(async ({ person, amount, direction, account, date, noMoney, links, clear }) => {
    let settlementId = "none";
    if (!noMoney && account && amount > 0) {
      const book = activeBookRef.current;

      // File it under the book's Settlement category, creating it the first time.
      let category = findSettlementCategory(stateRef.current.categories, book, direction);
      if (!category) {
        category = await add("categories", settlementCategoryRecord(book, direction));
      }

      const row = await add("txns", {
        book,
        type: direction === "in" ? "Income" : "Expense",
        date: date || new Date().toISOString().slice(0, 10),
        amount: round2(amount),
        account,
        to: null, cat: category.id, ret: null, method: null,
        notes: "",
        status: "Cleared",
        // The original bill is already in the reports at its full amount, so this
        // movement must not be counted again.
        exclude: true,
        splits: null, shares: null, tags: [],
        payer: null, mySettled: false, includeMe: true,
        settles: settlementMarker(person, direction, links),
      });
      settlementId = row.id;
    }
    await clear(settlementId);
    return settlementId;
  }, [add]);

  const setMeta = useCallback(async (k, v) => {
    const now = stateRef.current;
    commit({ ...now, meta: { ...now.meta, [k]: v } });
    await db.setMeta(k, v);
  }, [commit]);

  const setSetting = useCallback(async (k, v) => {
    const now = stateRef.current;
    const settings = { ...DEFAULT_SETTINGS, ...(now.meta.settings || {}), [k]: v };
    commit({ ...now, meta: { ...now.meta, settings } });
    await db.setMeta("settings", settings);
  }, [commit]);

  const replaceAll = useCallback(async (data) => {
    const next = { meta: data.meta || {} };
    db.COLLECTIONS.forEach((c) => { next[c] = data[c] || []; });
    // A backup can come from an older build, so bring it forward before it is written.
    const upgraded = migrateState(next);
    await db.replaceAll(upgraded);
    commit(upgraded);
  }, [commit]);

  const wipe = useCallback(async () => {
    await db.wipe();
    commit({ ...EMPTY, meta: {} });
  }, [commit]);

  const settings = { ...DEFAULT_SETTINGS, ...(state.meta.settings || {}) };
  const activeBook = state.meta.activeBook && state.books.some((b) => b.id === state.meta.activeBook)
    ? state.meta.activeBook
    : (state.books[0] ? state.books[0].id : null);

  /* ── derived views for the active book ── */
  activeBookRef.current = activeBook;

  const view = useMemo(() => {
    const inBook = (c) => state[c].filter((r) => r.book === activeBook);
    const accounts = inBook("accounts");
    const categories = inBook("categories");
    const retailers = inBook("retailers");
    const methods = inBook("methods");
    const people = inBook("people");
    const tags = inBook("tags");
    const txns = inBook("txns").slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));
    const ledger = buildLedger(txns, { onlyMyShare: !!settings.onlyMyShare });
    const index = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
    return {
      accounts, categories, retailers, methods, people, txns, ledger,
      peopleEntries: inBook("peopleEntries"),
      tags,
      budgets: inBook("budgets"), goals: inBook("goals"),
      recurring: inBook("recurring"), rules: inBook("rules"),
      accById: index(accounts), catById: index(categories),
      retById: index(retailers), methById: index(methods), personById: index(people),
      tagById: index(tags),
      balances: balancesFor(accounts, ledger),
      activeAccounts: accounts.filter((a) => !a.archived),
    };
  }, [state, activeBook, settings.onlyMyShare]);

  const book = state.books.find((b) => b.id === activeBook) || null;
  const currency = book ? book.currency : "INR";

  const value = {
    status, error, state, settings, book, activeBook, currency, ...view,
    add, update, upsert, remove, restore, addMany, setMeta, setSetting, replaceAll, wipe, settleDebt,
    needsOnboarding: status === "ready" && state.books.length === 0,
  };

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
