import React from "react";
import { Wallet, Layers, Building2, CreditCard, Users, BookOpen, Target, PiggyBank, Repeat, Wand2, Tag as TagIcon } from "lucide-react";
import { Ic, ACCOUNT_TYPES, ACCOUNT_ICON } from "../lib/icons.jsx";
import { tint } from "../lib/color.js";
import { fmt, clamp, sum, thisMonth, daysInMonth, monthKey, round2 } from "../lib/money.js";
import { personBalances } from "../lib/ledger.js";
import { CURRENCIES } from "../lib/money.js";
import { Ring } from "../components/ui.jsx";
import { STARTER_EXPENSE_CATEGORIES, STARTER_INCOME_CATEGORIES, STARTER_METHODS } from "../lib/presets.js";

const nameTaken = (draft, list) =>
  list.some((r) => r.id !== draft.id && (r.name || "").trim().toLowerCase() === (draft.name || "").trim().toLowerCase());

const usedBy = (s, predicate, label) => {
  const n = s.state.txns.filter(predicate).length;
  return n ? `${n} transaction${n > 1 ? "s" : ""} still use this ${label}. Archive it instead.` : null;
};

/* ── accounts ────────────────────────────────────────────────────────────── */
export const accountsCfg = {
  collection: "accounts", title: "Accounts", singular: "account", archivable: true,
  icon: <Wallet size={24} />,
  emptyBody: "An account is anywhere your money sits — a bank, a wallet, cash in hand, or a credit card.",
  defaults: { name: "", type: "Bank", opening: "0", color: "#4A5BE8", includeNet: true },
  rowIcon: (r) => ACCOUNT_ICON[r.type] || "Wallet",
  subtitle: (r, s) => `${r.type}${r.last4 ? ` ••${r.last4}` : ""} · opening ${fmt(Number(r.opening) || 0, { currency: s.currency, compact: true })}`,
  rowRight: (r, s) => (
    <div className="vy-row-a">
      <b className={s.settings.privacy ? "vy-blur" : ""} style={{ color: (s.balances[r.id] || 0) < 0 ? "var(--out)" : "var(--ink)" }}>
        {fmt(s.balances[r.id] || 0, { currency: s.currency, compact: true })}
      </b>
    </div>
  ),
  fields: [
    { key: "name", label: "Account name", placeholder: "HDFC Savings" },
    { key: "type", label: "Type", type: "select", options: ACCOUNT_TYPES.map((t) => ({ value: t, label: t })), placeholder: "Bank" },
    { key: "opening", label: "Opening balance", type: "number", hint: "What is in this account right now, before you start logging." },
    { key: "last4", label: "Last 4 digits", placeholder: "Optional" },
    { key: "limit", label: "Credit limit", type: "number", when: (d) => d.type === "Credit Card" },
    { key: "statementDay", label: "Statement day of month", type: "number", when: (d) => d.type === "Credit Card" },
    { key: "dueDay", label: "Payment due day", type: "number", when: (d) => d.type === "Credit Card" },
    { key: "includeNet", label: "Count towards net worth", type: "switch" },
    { key: "color", label: "Colour", type: "color" },
  ],
  validate: (d, s, all) => {
    if (!d.name || !d.name.trim()) return "Give the account a name.";
    if (nameTaken(d, all)) return "You already have an account with that name.";
    return null;
  },
  serialize: (d) => ({ ...d, name: d.name.trim(), opening: round2(d.opening), limit: d.limit ? round2(d.limit) : null }),
  guard: (r, s) => usedBy(s, (t) => t.account === r.id || t.to === r.id, "account"),
};

/* ── categories ──────────────────────────────────────────────────────────── */
export const categoriesCfg = {
  collection: "categories", title: "Categories", singular: "category", archivable: true,
  icon: <Layers size={24} />,
  emptyBody: "Categories are how you'll slice every report. Start with the ten or so you actually spend on.",
  intro: "Group is just a label for reporting — several categories can share one, like Food or Bills.",
  defaults: { name: "", dir: "Expense", group: "", icon: "Tag", color: "#4A5BE8" },
  sort: (a, b) => (a.dir === b.dir ? (a.group || "").localeCompare(b.group || "") || a.name.localeCompare(b.name) : a.dir === "Expense" ? -1 : 1),
  subtitle: (r) => `${r.dir}${r.group ? ` · ${r.group}` : ""}`,
  fields: [
    { key: "name", label: "Category name", placeholder: "Groceries" },
    { key: "dir", label: "Used for", type: "select", options: [{ value: "Expense", label: "Expense" }, { value: "Income", label: "Income" }], placeholder: "Expense" },
    { key: "group", label: "Group", placeholder: "Food", hint: "Optional. Categories with the same group roll up together." },
    { key: "icon", label: "Icon", type: "icon" },
    { key: "color", label: "Colour", type: "color" },
  ],
  validate: (d, s, all) => {
    if (!d.name || !d.name.trim()) return "Give the category a name.";
    if (all.some((r) => r.id !== d.id && r.name.toLowerCase() === d.name.trim().toLowerCase() && r.dir === d.dir))
      return "That category already exists.";
    return null;
  },
  serialize: (d) => ({ ...d, name: d.name.trim(), group: (d.group || "").trim() }),
  guard: (r, s) => usedBy(s, (t) => t.cat === r.id || (t.splits || []).some((x) => x.cat === r.id), "category"),
  footer: (s, { toast, nav }) => s.categories.length > 0 ? (
    <button className="vy-btn soft" style={{ marginTop: 14 }} onClick={() => nav.push("quickCats")}>
      Arrange the quick-pick row
    </button>
  ) : (
    <button className="vy-btn soft" style={{ marginTop: 14 }} onClick={async () => {
      await s.addMany("categories", [
        ...STARTER_EXPENSE_CATEGORIES.map(([name, icon, color, group]) => ({ name, icon, color, group, dir: "Expense", book: s.activeBook })),
        ...STARTER_INCOME_CATEGORIES.map(([name, icon, color]) => ({ name, icon, color, group: "Income", dir: "Income", book: s.activeBook })),
      ]);
      toast("Starter categories added — edit or delete freely");
    }}>Add a starter set instead</button>
  ),
};

/* ── merchants ───────────────────────────────────────────────────────────── */
export const retailersCfg = {
  collection: "retailers", title: "Merchants", singular: "merchant",
  icon: <Building2 size={24} />,
  emptyBody: "Shops and services you pay often. Pick one while adding a spend and its category fills in for you.",
  defaults: { name: "", defaultCat: null, aliases: "" },
  subtitle: (r, s) => {
    const c = s.catById[r.defaultCat];
    return c ? `Defaults to ${c.name}` : "No default category";
  },
  rowIcon: () => "Building2",
  rowColor: () => "#8A8D9C",
  fields: [
    { key: "name", label: "Merchant name", placeholder: "Big Bazaar" },
    {
      key: "defaultCat", label: "Default category", type: "select", placeholder: "None",
      options: (s) => s.categories.filter((c) => c.dir === "Expense").map((c) => ({ value: c.id, label: c.name })),
    },
    {
      key: "aliases", label: "Also known as", type: "textarea", placeholder: "BIGBAZAAR RETAIL\nBB STORES",
      hint: "One per line. Used later when importing bank statements.",
    },
  ],
  validate: (d, s, all) => {
    if (!d.name || !d.name.trim()) return "Give the merchant a name.";
    if (nameTaken(d, all)) return "That merchant is already in your list.";
    return null;
  },
  serialize: (d) => ({
    ...d, name: d.name.trim(),
    aliases: typeof d.aliases === "string" ? d.aliases.split("\n").map((x) => x.trim()).filter(Boolean) : (d.aliases || []),
  }),
  guard: (r, s) => usedBy(s, (t) => t.ret === r.id, "merchant"),
};

/* ── payment methods ─────────────────────────────────────────────────────── */
export const methodsCfg = {
  collection: "methods", title: "Payment methods", singular: "payment method",
  icon: <CreditCard size={24} />,
  emptyBody: "How the money actually moved — UPI, cash, card, net banking.",
  defaults: { name: "", icon: "Smartphone" },
  subtitle: () => "",
  rowColor: () => "#4A5BE8",
  fields: [
    { key: "name", label: "Method name", placeholder: "UPI" },
    { key: "icon", label: "Icon", type: "icon" },
  ],
  validate: (d, s, all) => {
    if (!d.name || !d.name.trim()) return "Give the method a name.";
    if (nameTaken(d, all)) return "That method already exists.";
    return null;
  },
  serialize: (d) => ({ ...d, name: d.name.trim() }),
  guard: (r, s) => usedBy(s, (t) => t.method === r.id, "payment method"),
  footer: (s, { toast }) => s.methods.length > 0 ? null : (
    <button className="vy-btn soft" style={{ marginTop: 14 }} onClick={async () => {
      await s.addMany("methods", STARTER_METHODS.map(([name, icon]) => ({ name, icon, book: s.activeBook })));
      toast("Starter payment methods added");
    }}>Add a starter set instead</button>
  ),
};

/* ── people ──────────────────────────────────────────────────────────────── */
export const peopleCfg = {
  collection: "people", title: "People", singular: "person",
  icon: <Users size={24} />,
  emptyBody: "Anyone you split bills with. Their share stays open until you mark it settled.",
  defaults: { name: "", color: "#4A5BE8" },
  intro: "Tap someone to see what's outstanding and record amounts either way.",
  onOpen: (r, nav) => nav.push("person", { id: r.id }),
  subtitle: (r, s) => {
    const bal = personBalances(s.txns, s.peopleEntries)[r.id] || 0;
    if (!bal) return "all settled";
    return bal > 0
      ? `owes you ${fmt(bal, { currency: s.currency })}`
      : `you owe ${fmt(-bal, { currency: s.currency })}`;
  },
  rowIcon: () => "Users",
  rowRight: (r, s) => {
    const bal = personBalances(s.txns, s.peopleEntries)[r.id] || 0;
    if (!bal) return null;
    return (
      <div className="vy-row-a">
        <b className={s.settings.privacy ? "vy-blur" : ""} style={{ color: bal > 0 ? "var(--in)" : "var(--out)" }}>
          {fmt(Math.abs(bal), { currency: s.currency, compact: true })}
        </b>
      </div>
    );
  },
  fields: [
    { key: "name", label: "Name", placeholder: "Ravi" },
    { key: "color", label: "Colour", type: "color" },
  ],
  validate: (d, s, all) => {
    if (!d.name || !d.name.trim()) return "Give them a name.";
    if (nameTaken(d, all)) return "That person is already in your list.";
    return null;
  },
  serialize: (d) => ({ ...d, name: d.name.trim() }),
  guard: (r, s) => {
    const paid = s.state.txns.filter((t) => t.payer === r.id).length;
    if (paid) return `${paid} transaction${paid > 1 ? "s" : ""} record this person as the payer.`;
    const n = s.state.txns.filter((t) => (t.shares || []).some((x) => x.person === r.id)).length;
    if (n) return `${n} split${n > 1 ? "s" : ""} still reference this person.`;
    const e = s.state.peopleEntries.filter((x) => x.person === r.id).length;
    return e ? `${e} outstanding entr${e > 1 ? "ies" : "y"} recorded against this person.` : null;
  },
};

/* ── tags ────────────────────────────────────────────────────────────────── */
export const tagsCfg = {
  collection: "tags", title: "Tags", singular: "tag",
  icon: <TagIcon size={24} />,
  emptyBody: "Tags cut across categories. A Goa trip, a house move, a semester — anything you want to total up separately.",
  intro: "A transaction can carry several tags at once, and each one gets its own total in Reports.",
  defaults: { name: "", color: "#4A5BE8" },
  rowIcon: () => "Tag",
  subtitle: (r, s) => {
    const n = s.state.txns.filter((t) => (t.tags || []).includes(r.id)).length;
    const spent = sum(s.ledger.filter((x) => (x.tags || []).includes(r.id) && x.kind === "Expense" && !x.ex).map((x) => -x.amount));
    return n ? `${n} transaction${n > 1 ? "s" : ""} · ${fmt(spent, { currency: s.currency, compact: true })}` : "not used yet";
  },
  fields: [
    { key: "name", label: "Tag name", placeholder: "Goa trip" },
    { key: "color", label: "Colour", type: "color" },
  ],
  validate: (d, s, all) => {
    if (!d.name || !d.name.trim()) return "Give the tag a name.";
    if (nameTaken(d, all)) return "That tag already exists.";
    return null;
  },
  serialize: (d) => ({ ...d, name: d.name.trim() }),
  guard: (r, s) => {
    const n = s.state.txns.filter((t) => (t.tags || []).includes(r.id)).length;
    return n ? `${n} transaction${n > 1 ? "s" : ""} still carry this tag.` : null;
  },
};

/* ── books ───────────────────────────────────────────────────────────────── */
export const booksCfg = {
  collection: "books", title: "Books", singular: "book",
  icon: <BookOpen size={24} />,
  emptyBody: "A book is a separate set of accounts and categories — personal, household, a side business.",
  intro: "Each book keeps its own accounts, categories and reports. Nothing crosses between them.",
  defaults: { name: "", type: "Personal", currency: "INR", icon: "Wallet", color: "#C87A15" },
  subtitle: (r, s) => `${r.type} · ${r.currency}${r.id === s.activeBook ? " · active" : ""}`,
  fields: [
    { key: "name", label: "Book name", placeholder: "Personal" },
    { key: "type", label: "Type", type: "select", placeholder: "Personal",
      options: ["Personal", "Household", "Business", "Travel"].map((t) => ({ value: t, label: t })) },
    { key: "currency", label: "Currency", type: "select", placeholder: "INR",
      options: CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} ${c.symbol.trim()}` })) },
    { key: "icon", label: "Icon", type: "icon" },
    { key: "color", label: "Colour", type: "color" },
  ],
  validate: (d, s, all) => {
    if (!d.name || !d.name.trim()) return "Give the book a name.";
    if (nameTaken(d, all)) return "You already have a book with that name.";
    return null;
  },
  serialize: (d) => ({ ...d, name: d.name.trim() }),
  guard: (r, s) => {
    if (s.state.books.length === 1) return "This is your only book, so it can't be deleted.";
    const n = s.state.txns.filter((t) => t.book === r.id).length;
    return n ? `${n} transaction${n > 1 ? "s" : ""} live in this book.` : null;
  },
};

/* ── budgets ─────────────────────────────────────────────────────────────── */
export const budgetsCfg = {
  collection: "budgets", title: "Budgets", singular: "budget",
  icon: <Target size={24} />,
  emptyBody: "Cap the categories that tend to run away from you. Vyay then shows what's safe to spend each day.",
  defaults: { cat: null, amount: "", rollover: false },
  fields: [
    { key: "cat", label: "Category", type: "select", placeholder: "Choose a category",
      options: (s) => s.categories.filter((c) => c.dir === "Expense").map((c) => ({ value: c.id, label: c.name })) },
    { key: "amount", label: "Monthly cap", type: "number", placeholder: "10000" },
    { key: "rollover", label: "Roll unspent amount into next month", type: "switch" },
  ],
  validate: (d, s, all) => {
    if (!d.cat) return "Pick a category.";
    if (!(Number(d.amount) > 0)) return "Set an amount above zero.";
    if (all.some((b) => b.id !== d.id && b.cat === d.cat)) return "That category already has a budget.";
    return null;
  },
  serialize: (d) => ({ ...d, amount: round2(d.amount) }),
  renderItem: (b, s) => {
    const c = s.catById[b.cat];
    const mk = thisMonth();
    const spent = -sum(s.ledger.filter((r) => r.cat === b.cat && monthKey(r.date) === mk && r.kind === "Expense" && !r.ex).map((r) => r.amount));
    const pct = b.amount ? spent / b.amount : 0;
    const over = pct > 1;
    const left = new Date().getDate();
    const remainingDays = Math.max(1, daysInMonth(mk) - left + 1);
    return (
      <div className="vy-card" style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="vy-row-ic lg" style={{ width: 34, height: 34, borderRadius: 11, background: tint((c ? c.color : "#888")), color: c ? c.color : "var(--muted)" }}>
            <Ic n={c ? c.icon : "Target"} size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 14.5, fontWeight: 580 }}>{c ? c.name : "Category removed"}</b>
            {b.rollover && <span className="vy-pill" style={{ background: "var(--tr-soft)", color: "var(--tr)", marginLeft: 7 }}>rolls over</span>}
          </div>
          <span className={"vy-num" + (s.settings.privacy ? " vy-blur" : "")} style={{ fontSize: 14, color: over ? "var(--out)" : "var(--ink)" }}>
            {fmt(spent, { currency: s.currency, compact: true })}
            <span style={{ color: "var(--muted)", fontWeight: 500 }}> / {fmt(b.amount, { currency: s.currency, compact: true })}</span>
          </span>
        </div>
        <div className="vy-bar" style={{ marginTop: 10 }}>
          <i style={{ width: `${clamp(pct, 0, 1) * 100}%`, background: over ? "var(--out)" : (c ? c.color : "var(--accent)") }} />
        </div>
        <div className="vy-sub" style={{ marginTop: 7, fontSize: 12 }}>
          {over
            ? `${fmt(spent - b.amount, { currency: s.currency })} over`
            : `${fmt(b.amount - spent, { currency: s.currency })} left · ${fmt((b.amount - spent) / remainingDays, { currency: s.currency })}/day`}
        </div>
      </div>
    );
  },
};

/* ── goals ───────────────────────────────────────────────────────────────── */
export const goalsCfg = {
  collection: "goals", title: "Goals", singular: "goal",
  icon: <PiggyBank size={24} />,
  emptyBody: "Name something you're saving for and Vyay works out the monthly number to get there.",
  defaults: { name: "", target: "", saved: "0", due: "", color: "#0E8A63", icon: "PiggyBank" },
  fields: [
    { key: "name", label: "What are you saving for?", placeholder: "Emergency fund" },
    { key: "target", label: "Target amount", type: "number", placeholder: "500000" },
    { key: "saved", label: "Saved so far", type: "number" },
    { key: "due", label: "Target date", type: "date" },
    { key: "icon", label: "Icon", type: "icon" },
    { key: "color", label: "Colour", type: "color" },
  ],
  validate: (d) => {
    if (!d.name || !d.name.trim()) return "Give the goal a name.";
    if (!(Number(d.target) > 0)) return "Set a target above zero.";
    return null;
  },
  serialize: (d) => ({ ...d, name: d.name.trim(), target: round2(d.target), saved: round2(d.saved) }),
  renderItem: (g, s) => {
    const pct = g.target ? g.saved / g.target : 0;
    const months = g.due ? Math.max(1, Math.round((new Date(g.due) - new Date()) / 2592000000)) : 12;
    return (
      <div className="vy-card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
            <Ring pct={pct} size={56} w={6} color={g.color} />
            <span className="vy-num" style={{ position: "absolute", fontSize: 12.5 }}>{Math.round(pct * 100)}%</span>
          </div>
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 15.5, fontWeight: 620, letterSpacing: "-.02em" }}>{g.name}</b>
            <div className={"vy-sub" + (s.settings.privacy ? " vy-blur" : "")} style={{ marginTop: 3 }}>
              {fmt(g.saved, { currency: s.currency, compact: true })} of {fmt(g.target, { currency: s.currency, compact: true })}
            </div>
            {g.saved < g.target && (
              <div className="vy-sub" style={{ marginTop: 2, color: "var(--accent)" }}>
                {fmt((g.target - g.saved) / months, { currency: s.currency, compact: true })}/month to get there
              </div>
            )}
          </div>
        </div>
        <div className="vy-bar" style={{ marginTop: 13 }}><i style={{ width: `${clamp(pct, 0, 1) * 100}%`, background: g.color }} /></div>
      </div>
    );
  },
};

/* ── recurring ───────────────────────────────────────────────────────────── */
export const recurringCfg = {
  collection: "recurring", title: "Recurring", singular: "recurring item", archivable: false,
  icon: <Repeat size={24} />,
  emptyBody: "Rent, subscriptions, SIPs — anything that repeats. Vyay reminds you and shows the monthly commitment.",
  intro: "These are reminders and forecasts. Nothing is posted to your ledger until you add the transaction.",
  defaults: { name: "", amount: "", cat: null, account: null, method: null, day: "1", auto: false },
  sort: (a, b) => Number(a.day) - Number(b.day),
  rowIcon: (r, s) => { const c = s.catById[r.cat]; return c ? c.icon : "Repeat"; },
  rowColor: (r, s) => { const c = s.catById[r.cat]; return c ? c.color : "#8A8D9C"; },
  subtitle: (r, s) => {
    const a = s.accById[r.account];
    return `Day ${r.day}${a ? ` · ${a.name}` : ""} · ${r.auto ? "auto-pays" : "needs confirming"}`;
  },
  rowRight: (r, s) => (
    <div className="vy-row-a"><b className={s.settings.privacy ? "vy-blur" : ""}>{fmt(r.amount, { currency: s.currency })}</b></div>
  ),
  fields: [
    { key: "name", label: "What is it?", placeholder: "Rent" },
    { key: "amount", label: "Amount", type: "number", placeholder: "20000" },
    { key: "cat", label: "Category", type: "select", placeholder: "Choose",
      options: (s) => s.categories.map((c) => ({ value: c.id, label: `${c.name} (${c.dir})` })) },
    { key: "account", label: "Account", type: "select", placeholder: "Choose",
      options: (s) => s.activeAccounts.map((a) => ({ value: a.id, label: a.name })) },
    { key: "method", label: "Payment method", type: "select", placeholder: "Choose",
      options: (s) => s.methods.map((m) => ({ value: m.id, label: m.name })) },
    { key: "day", label: "Day of month", type: "number", placeholder: "1", hint: "1 to 31." },
    { key: "auto", label: "Pays automatically", type: "switch" },
  ],
  validate: (d) => {
    if (!d.name || !d.name.trim()) return "Give it a name.";
    if (!(Number(d.amount) > 0)) return "Set an amount above zero.";
    const day = Number(d.day);
    if (!(day >= 1 && day <= 31)) return "Day of month must be between 1 and 31.";
    return null;
  },
  serialize: (d) => ({ ...d, name: d.name.trim(), amount: round2(d.amount), day: Number(d.day) || 1 }),
};

/* ── auto-categorise rules ───────────────────────────────────────────────── */
export const rulesCfg = {
  collection: "rules", title: "Auto-categorise", singular: "rule",
  icon: <Wand2 size={24} />,
  emptyBody: "Rules match text in a note or merchant name and fill the category for you.",
  intro: "Rules run when you use quick add. First match wins, so put the specific ones first.",
  defaults: { match: "", cat: null, ret: null, on: true },
  searchText: (r) => r.match,
  rowIcon: () => "Wand2",
  rowColor: (r, s) => { const c = s.catById[r.cat]; return c ? c.color : "#8A8D9C"; },
  title_of: (r) => `Contains "${r.match}"`,
  subtitle: (r, s) => {
    const c = s.catById[r.cat];
    return `→ ${c ? c.name : "no category"}${r.on ? "" : " · off"}`;
  },
  fields: [
    { key: "match", label: "When the text contains", placeholder: "swiggy" },
    { key: "cat", label: "Set category to", type: "select", placeholder: "Choose",
      options: (s) => s.categories.map((c) => ({ value: c.id, label: `${c.name} (${c.dir})` })) },
    { key: "ret", label: "Set merchant to", type: "select", placeholder: "None",
      options: (s) => s.retailers.map((r) => ({ value: r.id, label: r.name })) },
    { key: "on", label: "Rule is active", type: "switch" },
  ],
  validate: (d) => {
    if (!d.match || !d.match.trim()) return "Enter some text to match on.";
    if (!d.cat) return "Pick the category to apply.";
    return null;
  },
  serialize: (d) => ({ ...d, match: d.match.trim().toLowerCase() }),
};

