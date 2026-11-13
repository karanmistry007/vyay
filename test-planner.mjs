/* The upgrade patch, tested as a pure function: correctness and idempotency. */
import { planRepair, applyPlan, findUnrecorded, groupUnrecorded, findSettlementCategory } from "./src/lib/settlements.js";
let pass = 0, fail = 0;
const T = (l, c, e) => { c ? pass++ : fail++; console.log((c ? "  PASS  " : "  FAIL  ") + l + (c || !e ? "" : "  -> " + e)); };

const base = () => ({
  categories: [{ id: "c1", book: "b1", name: "Food", dir: "Expense" }],
  txns: [
    // two people on one bill, both settled long ago
    { id: "t1", book: "b1", type: "Expense", date: "2026-09-13", amount: 2488, account: "a1", cat: "c1",
      shares: [{ person: "p1", amount: 360, settled: true }, { person: "p2", amount: 1752, settled: true }] },
    // same person, different account
    { id: "t2", book: "b1", type: "Expense", date: "2026-09-14", amount: 1845, account: "a2", cat: "c1",
      shares: [{ person: "p3", amount: 275, settled: true }] },
    { id: "t3", book: "b1", type: "Expense", date: "2026-09-15", amount: 350, account: "a1", cat: "c1",
      shares: [{ person: "p3", amount: 116.67, settled: true }] },
    // deliberately settled with no money — must be left alone
    { id: "t4", book: "b1", type: "Expense", date: "2026-09-16", amount: 500, account: "a1", cat: "c1",
      shares: [{ person: "p1", amount: 250, settled: true, clearedBy: "none" }] },
    // already recorded — must be left alone
    { id: "t5", book: "b1", type: "Expense", date: "2026-09-17", amount: 600, account: "a1", cat: "c1",
      shares: [{ person: "p1", amount: 300, settled: true, clearedBy: "txn-existing" }] },
    // still open — not a settlement at all
    { id: "t6", book: "b1", type: "Expense", date: "2026-09-18", amount: 800, account: "a1", cat: "c1",
      shares: [{ person: "p2", amount: 400, settled: false }] },
    // somebody else paid for me, settled long ago, no account to infer
    { id: "t7", book: "b1", type: "Expense", date: "2026-09-19", amount: 900, account: null, cat: "c1",
      payer: "p1", mySettled: true, shares: [{ person: "p1", amount: 300, settled: false }] },
    // a settlement itself must never be re-processed
    { id: "t8", book: "b1", type: "Income", date: "2026-09-20", amount: 100, account: "a1", cat: null,
      exclude: true, settles: { person: "p1", direction: "in", links: [] } },
  ],
});

console.log("— what it finds —");
let state = base();
T("only genuinely unrecorded debts are found", findUnrecorded(state.txns).length === 5,
  String(findUnrecorded(state.txns).length));
T("deliberate no-money settles are skipped", !findUnrecorded(state.txns).some(i => i.txn.id === "t4"));
T("already-recorded ones are skipped", !findUnrecorded(state.txns).some(i => i.txn.id === "t5"));
T("open debts are skipped", !findUnrecorded(state.txns).some(i => i.txn.id === "t6"));
T("settlements themselves are skipped", !findUnrecorded(state.txns).some(i => i.txn.id === "t8"));

const groups = groupUnrecorded(state.txns);
T("grouped by person and source account", groups.length === 5, groups.map(g => `${g.person}/${g.suggested}:${g.amount}`).join(" "));
T("the same person on two accounts is two groups",
  groups.filter(g => g.person === "p3").length === 2);

console.log("\n— the plan —");
const plan = planRepair(state, { accountFor: (g) => g.suggested });
T("one settlement per group that has an account", plan.count === 4, String(plan.count));
T("the one with no account is skipped, not guessed", plan.skipped.length === 1 && plan.skipped[0].person === "p1");
T("totals are right", Math.abs(plan.total - (360 + 1752 + 275 + 116.67)) < 0.01, plan.total.toFixed(2));
T("a Settlement category is created once", plan.categories.length === 1 && plan.categories[0].name === "Settlement");
T("settlements are income and excluded", plan.txns.every(t => t.type === "Income" && t.exclude === true));
T("every settlement is categorised", plan.txns.every(t => t.cat === plan.categories[0].id));
T("each links back to the bills it clears", plan.txns.every(t => t.settles.links.length > 0));
const forA1 = plan.txns.find(t => t.account === "a1" && t.settles.person === "p3");
T("dated from the bill it clears", forA1 && forA1.date === "2026-09-15", forA1 && forA1.date);
const p1p2 = plan.txns.filter(t => t.account === "a1" && ["p1", "p2"].includes(t.settles.person));
T("two people on one bill get separate settlements", p1p2.length === 2);

console.log("\n— applying it —");
state = applyPlan(state, plan);
const t1 = state.txns.find(t => t.id === "t1");
T("both shares on the shared bill are stamped",
  t1.shares.every(sh => !!sh.clearedBy), JSON.stringify(t1.shares.map(sh => sh.clearedBy)));
T("the two stamps differ, one per settlement", t1.shares[0].clearedBy !== t1.shares[1].clearedBy);
T("untouched rows stay untouched",
  state.txns.find(t => t.id === "t4").shares[0].clearedBy === "none" &&
  state.txns.find(t => t.id === "t5").shares[0].clearedBy === "txn-existing" &&
  state.txns.find(t => t.id === "t6").shares[0].settled === false);
T("the category is now findable", !!findSettlementCategory(state.categories, "b1", "in"));

console.log("\n— idempotency —");
const second = planRepair(state, { accountFor: (g) => g.suggested });
T("running the patch again does nothing", second.count === 0 && second.categories.length === 0, `${second.count} txns`);
const third = applyPlan(state, second);
T("state is unchanged by a second pass", third.txns.length === state.txns.length);

/* now give the skipped one an account, as the book default would */
const withFallback = planRepair(state, { accountFor: (g) => g.suggested || "a1" });
T("the skipped one is picked up once an account is known", withFallback.count === 1, String(withFallback.count));
T("it is an expense, because you were paying them back",
  withFallback.txns[0].type === "Expense" && withFallback.txns[0].settles.direction === "out");
T("an expense Settlement category is created for it",
  withFallback.categories.length === 1 && withFallback.categories[0].dir === "Expense");
const after = applyPlan(state, withFallback);
T("my own share is stamped", after.txns.find(t => t.id === "t7").myClearedBy === withFallback.txns[0].id);
T("and then it too is idempotent", planRepair(after, { accountFor: (g) => g.suggested || "a1" }).count === 0);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

/* Regression: the migration must not drop fields it was not written for. */
import { migrateState } from "./src/lib/migrate.js";
console.log("\n— migration preserves unknown share fields —");
const stamped = {
  categories: [], accounts: [], books: [], retailers: [], methods: [], people: [],
  peopleEntries: [], tags: [], budgets: [], goals: [], recurring: [], rules: [], meta: {},
  txns: [{
    id: "z1", book: "b1", type: "Expense", date: "2026-09-01", amount: 100, account: "a1",
    myClearedBy: "txn-mine",
    shares: [{ person: "p1", amount: 50, settled: true, clearedBy: "txn-abc" }],
    splits: [{ cat: "c1", amount: 100, note: "x", tagAlong: "keep me" }],
  }],
};
const out = migrateState(stamped);
const ok1 = out.txns[0].shares[0].clearedBy === "txn-abc";
const ok2 = out.txns[0].myClearedBy === "txn-mine";
const ok3 = out.txns[0].splits[0].tagAlong === "keep me";
console.log((ok1 ? "  PASS  " : "  FAIL  ") + "clearedBy survives migration");
console.log((ok2 ? "  PASS  " : "  FAIL  ") + "myClearedBy survives migration");
console.log((ok3 ? "  PASS  " : "  FAIL  ") + "unknown split fields survive migration");
if (!(ok1 && ok2 && ok3)) process.exit(1);
