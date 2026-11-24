/**
 * Realistic demo data for development only. Never imported by the production
 * build — see the `import.meta.env.DEV` guard at every call site.
 *
 * Produces one book, four accounts (salary bank, savings bank, cash wallet,
 * credit card), the full starter categories/methods, a handful of merchants,
 * people and tags, plus 3-6 months of income/expense/transfer activity with
 * 5-10 transactions per account per month.
 */
import { uid, round2 } from "./money.js";
import { STARTER_EXPENSE_CATEGORIES, STARTER_INCOME_CATEGORIES, STARTER_METHODS } from "./presets.js";

const rnd = (min, max) => Math.random() * (max - min) + min;
const rndInt = (min, max) => Math.floor(rnd(min, max + 1));
const pick = (arr) => arr[rndInt(0, arr.length - 1)];
const amt = (min, max, step = 10) => round2(Math.round(rnd(min, max) / step) * step);
const pad = (n) => String(n).padStart(2, "0");

function monthList(count) {
  const now = new Date();
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() });
  }
  return out;
}
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

/** Fills a list up to a random 5-10 target using factories from `pool`, keeping any guaranteed entries already in `entries`. */
function topUp(entries, pool) {
  const target = rndInt(5, 10);
  const out = entries.slice(0, target);
  while (out.length < target) out.push(pick(pool)());
  return out;
}

export function buildSampleData(monthsBack = 6) {
  const bookId = uid("bok");
  const now = new Date();

  const categories = [
    ...STARTER_EXPENSE_CATEGORIES.map(([name, icon, color, group]) => ({
      id: uid("cat"), book: bookId, name, icon, color, group, dir: "Expense",
    })),
    ...STARTER_INCOME_CATEGORIES.map(([name, icon, color]) => ({
      id: uid("cat"), book: bookId, name, icon, color, group: "Income", dir: "Income",
    })),
  ];
  const cat = (name) => categories.find((c) => c.name === name);

  const methods = STARTER_METHODS.map(([name, icon]) => ({ id: uid("met"), book: bookId, name, icon }));
  const method = (name) => methods.find((m) => m.name === name);

  const retailers = [
    ["Big Bazaar", "Groceries"], ["Reliance Fresh", "Groceries"],
    ["Zomato", "Food delivery"], ["Swiggy", "Food delivery"],
    ["Domino's Pizza", "Restaurants"], ["Starbucks", "Cafe"],
    ["Uber", "Cab & auto"], ["Ola", "Cab & auto"], ["Indian Oil", "Fuel"],
    ["Amazon", "Electronics"], ["Myntra", "Clothing"], ["Apollo Pharmacy", "Pharmacy"],
    ["Netflix", "Subscriptions"], ["Spotify", "Subscriptions"], ["PVR Cinemas", "Entertainment"],
    ["MakeMyTrip", "Travel"], ["Cult.fit", "Fitness"], ["Airtel", "Mobile"],
  ].map(([name, catName]) => ({ id: uid("ret"), book: bookId, name, defaultCat: (cat(catName) || {}).id || null, aliases: [] }));
  const ret = (name) => (retailers.find((r) => r.name === name) || {}).id || null;

  const accDefs = [
    { key: "salary", name: "HDFC Salary", type: "Bank", opening: amt(5000, 15000, 100), color: "#4A5BE8" },
    { key: "savings", name: "SBI Savings", type: "Bank", opening: amt(40000, 90000, 500), color: "#0E8A63" },
    { key: "cash", name: "Cash Wallet", type: "Cash", opening: amt(500, 3000, 50), color: "#C87A15" },
    { key: "card", name: "HDFC Credit Card", type: "Credit Card", opening: 0, color: "#CE3D57", limit: 150000, statementDay: 3, dueDay: 20 },
  ];
  const accounts = accDefs.map((a) => ({
    id: uid("acc"), book: bookId, name: a.name, type: a.type, opening: a.opening, color: a.color,
    includeNet: true, limit: a.limit || null, statementDay: a.statementDay || null, dueDay: a.dueDay || null,
  }));
  const accId = {};
  accDefs.forEach((a, i) => { accId[a.key] = accounts[i].id; });

  const people = [
    { id: uid("ppl"), book: bookId, name: "Riya", color: "#C8459B" },
    { id: uid("ppl"), book: bookId, name: "Aman", color: "#2F7FE0" },
  ];
  const tags = [
    { id: uid("tag"), book: bookId, name: "Goa trip", color: "#1FA0C8" },
    { id: uid("tag"), book: bookId, name: "Home", color: "#8B5E34" },
  ];

  const base = (over) => ({
    id: uid("txn"), book: bookId, to: null, cat: null, ret: null, method: null, notes: "",
    status: "Cleared", exclude: false, splits: null, shares: null, tags: [],
    payer: null, mySettled: false, includeMe: true, settles: null, ...over,
  });

  const txns = [];
  const months = monthList(monthsBack);

  months.forEach(({ year, month }, idx) => {
    const lastDay = idx === months.length - 1 ? now.getDate() : daysIn(year, month);
    const d = (day) => `${year}-${pad(month + 1)}-${pad(Math.min(Math.max(day, 1), lastDay))}`;

    /* ── salary account: payday, a sweep into savings, small auto-debits ── */
    const salary = [
      base({ type: "Income", date: d(1), amount: amt(42000, 58000, 100), account: accId.salary,
        cat: cat("Salary").id, method: method("Net banking").id, notes: "Monthly salary" }),
      base({ type: "Transfer", date: d(2), amount: amt(18000, 32000, 500), account: accId.salary,
        to: accId.savings, method: method("Net banking").id }),
    ];
    if (Math.random() < 0.75) {
      salary.push(base({ type: "Transfer", date: d(rndInt(3, 9)), amount: amt(1000, 4000, 100),
        account: accId.salary, to: accId.cash, method: method("Net banking").id }));
    }
    salary.push(base({ type: "Expense", date: d(rndInt(8, 16)), amount: amt(199, 599, 10),
      account: accId.salary, cat: cat("Mobile").id, method: method("Auto-debit").id, ret: ret("Airtel") }));
    txns.push(...topUp(salary, [
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(149, 799, 10),
        account: accId.salary, cat: cat("Subscriptions").id, method: method("Auto-debit").id, ret: ret("Netflix") }),
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(100, 500, 10),
        account: accId.salary, cat: cat("Miscellaneous").id, method: method("UPI").id }),
      () => base({ type: "Income", date: d(rndInt(1, lastDay)), amount: amt(50, 350, 10),
        account: accId.salary, cat: cat("Cashback").id, method: method("UPI").id }),
    ]));

    /* ── savings: rent, SIP, utilities, bill payments, groceries ── */
    const savings = [
      base({ type: "Expense", date: d(rndInt(3, 6)), amount: amt(12000, 19000, 500),
        account: accId.savings, cat: cat("Rent").id, method: method("Net banking").id, notes: "Monthly rent" }),
      base({ type: "Expense", date: d(rndInt(5, 9)), amount: amt(2000, 6000, 100),
        account: accId.savings, cat: cat("Investments").id, method: method("Auto-debit").id, notes: "SIP" }),
      base({ type: "Transfer", date: d(rndInt(10, 16)), amount: amt(3000, 9000, 100),
        account: accId.savings, to: accId.card, method: method("Net banking").id, notes: "Credit card bill" }),
    ];
    if (idx === Math.max(0, months.length - 3)) {
      savings.push(base({ type: "Expense", date: d(14), amount: amt(15000, 45000, 500),
        account: accId.savings, cat: cat("Travel").id, method: method("Debit card").id, ret: ret("MakeMyTrip"),
        notes: "Weekend trip", tags: [tags[0].id] }));
      savings.push(base({ type: "Income", date: d(20), amount: amt(5000, 20000, 500),
        account: accId.savings, cat: cat("Freelance").id, method: method("Net banking").id, notes: "Side project payout" }));
    }
    txns.push(...topUp(savings, [
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(400, 2400, 10),
        account: accId.savings, cat: cat("Groceries").id, method: method("Debit card").id, ret: pick([ret("Big Bazaar"), ret("Reliance Fresh")]) }),
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(800, 2500, 10),
        account: accId.savings, cat: cat("Electricity").id, method: method("Net banking").id }),
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(500, 1200, 10),
        account: accId.savings, cat: cat("Internet").id, method: method("Auto-debit").id }),
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(300, 1500, 10),
        account: accId.savings, cat: cat("Household").id, method: method("Debit card").id }),
      () => base({ type: "Income", date: d(rndInt(1, lastDay)), amount: amt(80, 600, 10),
        account: accId.savings, cat: cat("Interest").id, method: method("Net banking").id }),
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(150, 900, 10),
        account: accId.savings, cat: cat("Pharmacy").id, method: method("Debit card").id, ret: ret("Apollo Pharmacy") }),
    ]));

    /* ── cash wallet: everyday small spends ── */
    txns.push(...topUp([], [
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(80, 400, 10),
        account: accId.cash, cat: cat("Public transport").id, method: method("Cash").id }),
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(100, 500, 10),
        account: accId.cash, cat: cat("Restaurants").id, method: method("Cash").id, ret: ret("Domino's Pizza") }),
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(60, 250, 10),
        account: accId.cash, cat: cat("Cafe").id, method: method("Cash").id, ret: ret("Starbucks") }),
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(150, 700, 10),
        account: accId.cash, cat: cat("Cab & auto").id, method: method("Cash").id, ret: pick([ret("Uber"), ret("Ola")]) }),
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(100, 600, 10),
        account: accId.cash, cat: cat("Personal care").id, method: method("Cash").id }),
    ]));

    /* ── credit card: shopping, dining out, subscriptions ── */
    txns.push(...topUp([
      base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(149, 649, 10),
        account: accId.card, cat: cat("Subscriptions").id, method: method("Credit card").id, ret: ret("Spotify") }),
    ], [
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(800, 6000, 50),
        account: accId.card, cat: cat("Electronics").id, method: method("Credit card").id, ret: ret("Amazon") }),
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(500, 3500, 50),
        account: accId.card, cat: cat("Clothing").id, method: method("Credit card").id, ret: ret("Myntra") }),
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(300, 1800, 10),
        account: accId.card, cat: cat("Food delivery").id, method: method("Credit card").id, ret: pick([ret("Zomato"), ret("Swiggy")]) }),
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(300, 1500, 10),
        account: accId.card, cat: cat("Entertainment").id, method: method("Credit card").id, ret: ret("PVR Cinemas") }),
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(500, 1500, 10),
        account: accId.card, cat: cat("Fitness").id, method: method("Credit card").id, ret: ret("Cult.fit") }),
      () => base({ type: "Expense", date: d(rndInt(1, lastDay)), amount: amt(500, 2500, 50),
        account: accId.card, cat: cat("Fuel").id, method: method("Credit card").id, ret: ret("Indian Oil") }),
    ]));
  });

  /* ── a few bills shared with people, some already settled ── */
  const splittable = txns.filter((t) => t.type === "Expense" && t.account === accId.savings && t.amount > 800);
  splittable.slice(0, 3).forEach((t, i) => {
    const person = i % 2 === 0 ? people[0].id : people[1].id;
    const theirShare = round2(t.amount * pick([0.3, 0.4, 0.5]));
    t.shares = [{ person, amount: theirShare, settled: i === 0 }];
    t.tags = t.tags && t.tags.length ? t.tags : [tags[1].id];
  });

  /* ── one bill somebody else covered for us ── */
  const owedTxn = txns.find((t) => t.type === "Expense" && t.cat === cat("Restaurants").id);
  if (owedTxn) {
    owedTxn.payer = people[0].id;
    owedTxn.account = null;
    owedTxn.shares = [{ person: people[0].id, amount: round2(owedTxn.amount * 0.5), settled: false }];
  }

  const budgets = [
    { id: uid("bud"), book: bookId, cat: cat("Groceries").id, amount: 8000, rollover: false },
    { id: uid("bud"), book: bookId, cat: cat("Restaurants").id, amount: 4000, rollover: false },
    { id: uid("bud"), book: bookId, cat: cat("Fuel").id, amount: 3000, rollover: true },
  ];

  const goalDue = new Date(now.getFullYear(), now.getMonth() + 8, 1);
  const goals = [
    { id: uid("gol"), book: bookId, name: "Emergency fund", target: 300000, saved: amt(40000, 120000, 1000),
      due: `${goalDue.getFullYear()}-${pad(goalDue.getMonth() + 1)}-01`, color: "#0E8A63", icon: "PiggyBank" },
  ];

  const recurring = [
    { id: uid("rec"), book: bookId, name: "Rent", amount: 15000, cat: cat("Rent").id,
      account: accId.savings, method: method("Net banking").id, day: 5, auto: false },
    { id: uid("rec"), book: bookId, name: "Netflix", amount: 499, cat: cat("Subscriptions").id,
      account: accId.salary, method: method("Auto-debit").id, day: 10, auto: true },
  ];

  /* ── what a new entry starts with: the account, method and categories used most ── */
  const defaults = {
    account: accId.cash, method: method("UPI").id,
    expenseCat: cat("Groceries").id, incomeCat: cat("Salary").id,
  };

  return {
    meta: { activeBook: bookId, settings: { defaults: { [bookId]: defaults } } },
    books: [{ id: bookId, name: "Personal", type: "Personal", currency: "INR", icon: "Wallet", color: "#C87A15" }],
    accounts, categories, retailers, methods, people, peopleEntries: [], tags,
    txns, budgets, goals, recurring, rules: [],
  };
}
