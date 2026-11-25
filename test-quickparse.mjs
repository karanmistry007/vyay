/* Quick add: one sentence into a draft. Every case here is something a person actually says. */
import { parseQuick, draftScore } from "./src/lib/quickParse.js";
let pass = 0, fail = 0;
const T = (l, c, e) => { c ? pass++ : fail++; console.log((c ? "  PASS  " : "  FAIL  ") + l + (c || e === undefined ? "" : "  -> " + e)); };

/* A book set up from the starter data, pinned to Wednesday 25 November 2026. */
const cat = (id, name, dir, extra = {}) => ({ id, name, dir, ...extra });
const CTX = {
  today: "2026-11-25", currency: "INR", dayFirst: true, fallbackType: "Expense",
  categories: [
    cat("c-gro", "Groceries", "Expense"), cat("c-res", "Restaurants", "Expense"), cat("c-fd", "Food delivery", "Expense"),
    cat("c-cafe", "Cafe", "Expense"), cat("c-fuel", "Fuel", "Expense"), cat("c-cab", "Cab & auto", "Expense"),
    cat("c-pt", "Public transport", "Expense"), cat("c-rent", "Rent", "Expense"), cat("c-elec", "Electricity", "Expense"),
    cat("c-mob", "Mobile", "Expense"), cat("c-clo", "Clothing", "Expense"), cat("c-ele", "Electronics", "Expense"),
    cat("c-sub", "Subscriptions", "Expense"), cat("c-ent", "Entertainment", "Expense"), cat("c-gift", "Gifts & donations", "Expense"),
    cat("c-set", "Settlement", "Expense"), cat("c-old", "Hobbies", "Expense", { archived: true }),
    cat("c-sal", "Salary", "Income"), cat("c-ref", "Refund", "Income"), cat("c-rin", "Rental income", "Income"),
    cat("c-gin", "Gift received", "Income"), cat("c-iset", "Settlement", "Income"),
  ],
  accounts: [
    { id: "a-hdfc", name: "HDFC Savings", type: "Bank" }, { id: "a-cash", name: "Cash", type: "Cash" },
    { id: "a-icici", name: "ICICI Credit Card", type: "Credit Card" }, { id: "a-paytm", name: "Paytm Wallet", type: "Wallet" },
  ],
  methods: [
    { id: "m-upi", name: "UPI" }, { id: "m-cash", name: "Cash" }, { id: "m-cc", name: "Credit card" },
    { id: "m-dc", name: "Debit card" }, { id: "m-nb", name: "Net banking" }, { id: "m-ad", name: "Auto-debit" },
  ],
  retailers: [
    { id: "r-swiggy", name: "Swiggy", defaultCat: "c-fd" }, { id: "r-amzn", name: "Amazon", defaultCat: "c-ele" },
    { id: "r-bb", name: "Big Bazaar", defaultCat: "c-gro" }, { id: "r-chai", name: "Chai Point" },
  ],
  rules: [{ match: "netflix", cat: "c-sub", ret: null, on: true }, { match: "jio", cat: "c-mob", ret: null, on: false }],
};
const P = (text, over = {}) => parseQuick(text, { ...CTX, ...over });
const show = (d) => JSON.stringify({ type: d.type, amount: d.amount, cat: d.cat, account: d.account, to: d.to, method: d.method, ret: d.ret, date: d.date, notes: d.notes, warnings: d.warnings });

console.log("— amounts —");
{
  const d = P("450 groceries upi");
  T("the plain case", d.amount === 450 && d.cat === "c-gro" && d.method === "m-upi" && d.type === "Expense", show(d));
  T("nothing said about the date leaves it alone", d.date === null && d.account === null, show(d));
}
{ const d = P("spent ₹1,250.50 on dinner"); T("rupee sign, Indian commas and paise", d.amount === 1250.5, show(d)); }
{ const d = P("paid 1,25,000 rent"); T("lakh grouping", d.amount === 125000 && d.cat === "c-rent", show(d)); }
{ const d = P("450rs lunch"); T("currency glued to the number", d.amount === 450, show(d)); }
{ const d = P("rs.450 lunch"); T("rs. before the number", d.amount === 450, show(d)); }
{ const d = P("2.5k on clothes"); T("2.5k is 2500", d.amount === 2500 && d.cat === "c-clo", show(d)); }
{ const d = P("1.5 lakh electronics"); T("1.5 lakh is 150000", d.amount === 150000, show(d)); }
{ const d = P("spent two thousand five hundred on clothes"); T("spoken thousands", d.amount === 2500, show(d)); }
{ const d = P("one lakh twenty thousand bonus received"); T("spoken lakhs", d.amount === 120000 && d.type === "Income", show(d)); }
{ const d = P("two hundred and fifty for coffee"); T("hundred and fifty", d.amount === 250, show(d)); }
{ const d = P("four fifty for coffee"); T("'four fifty' is how 450 is said", d.amount === 450, show(d)); }
{ const d = P("twelve fifty fuel"); T("'twelve fifty' is 1250", d.amount === 1250 && d.cat === "c-fuel", show(d)); }
{ const d = P("fifty point five chai"); T("spoken decimals", d.amount === 50.5, show(d)); }
{ const d = P("50 rupees and 20 paise chai"); T("rupees and paise add up", d.amount === 50.2, show(d)); }
{
  const d = P("2 coffees 300");
  T("old bug: the first number won — now the price does", d.amount === 300, show(d));
  T("…and says it had to choose", d.warnings.some((w) => w.includes("more than one number")), show(d));
  T("…and keeps the count in the note", d.notes === "2 coffees", show(d));
}
{ const d = P("rs 300 for 2 coffees"); T("a currency-marked number is the amount, no doubt about it", d.amount === 300 && d.warnings.length === 0, show(d)); }
{ const d = P("33.333 tea"); T("stored amounts are rounded to paise", d.amount === 33.33, show(d)); }
{ const d = P("99999999999 groceries"); T("an eleven-digit number is refused as an amount, with a reason", d.amount === null && d.warnings.length === 1, show(d)); }
{ const d = P("rs 99999999999 groceries"); T("…and a currency-marked one is refused as too large", d.amount === null && d.warnings.some((w) => w.includes("too large")), show(d)); }
{ const d = P("movie at 4:30 rs 600"); T("a time is not an amount", d.amount === 600 && d.cat === "c-ent", show(d)); }

console.log("\n— direction —");
{ const d = P("received salary 85000 in hdfc"); T("income said out loud", d.type === "Income" && d.cat === "c-sal" && d.account === "a-hdfc" && d.amount === 85000, show(d)); }
{ const d = P("salary 85000"); T("an income category makes it income", d.type === "Income" && d.cat === "c-sal", show(d)); }
{ const d = P("450 groceries", { fallbackType: "Income" }); T("an expense category wins over the form's income tab", d.type === "Expense" && d.cat === "c-gro", show(d)); }
{ const d = P("5000", { fallbackType: "Income" }); T("with nothing to go on, the form's type stays", d.type === "Income" && d.amount === 5000, show(d)); }
{ const d = P("ravi paid me 500"); T("'paid me' is money coming in", d.type === "Income" && d.amount === 500 && d.notes === "Ravi", show(d)); }
{ const d = P("credited 1200 refund amazon"); T("income with a merchant still picks the income category", d.type === "Income" && d.cat === "c-ref" && d.ret === "r-amzn", show(d)); }
{ const d = P("credited 5000"); T("old bug: 'credited' chose the Credit card method", d.method === null && d.type === "Income", show(d)); }
{ const d = P("paid salary 20000"); T("an income category under an expense verb is left blank, with a reason", d.type === "Expense" && d.cat === null && d.warnings.length === 1, show(d)); }
{ const d = P("rent received 20000"); T("'rent received' is rental income, not rent", d.type === "Income" && d.cat === "c-rin", show(d)); }
{ const d = P("got a gift 1000 received"); T("the same word picks the category of the right direction", d.type === "Income" && d.cat === "c-gin", show(d)); }

console.log("\n— categories, merchants, rules —");
{ const d = P("netflix 649"); T("auto-categorise rules still run", d.cat === "c-sub", show(d)); }
{ const d = P("jio recharge 299"); T("a rule that is switched off does not", d.cat === "c-mob", show(d)); }
{ const d = P("swiggy 320 dinner"); T("the merchant's own category beats the everyday word", d.ret === "r-swiggy" && d.cat === "c-fd" && d.notes === "Dinner", show(d)); }
{ const d = P("lunch at swiggy with team 450 upi"); T("the note keeps what the shortcuts did not say", d.notes === "Lunch with team" && d.method === "m-upi", show(d)); }
{ const d = P("chai point 80"); T("a merchant with no default still lets the words choose", d.ret === "r-chai" && d.cat === "c-cafe", show(d)); }
{ const d = P("big bazaar 2300"); T("two-word merchant names", d.ret === "r-bb" && d.cat === "c-gro", show(d)); }
{ const d = P("cab and auto 200"); T("'&' in a name matches a spoken 'and'", d.cat === "c-cab", show(d)); }
{ const d = P("auto 120"); T("one distinctive word names the category", d.cat === "c-cab", show(d)); }
{ const d = P("emi auto debit 5000"); T("…but not when it belongs to the method", d.method === "m-ad" && d.cat === null, show(d)); }
{ const d = P("settlement 500"); T("never the Settlement category — that goes through settleDebt", d.cat === null, show(d)); }
{ const d = P("hobbies 500"); T("never an archived category", d.cat === null, show(d)); }

console.log("\n— accounts and methods —");
{ const d = P("netflix 649 credit card"); T("'credit card' is the method and the only card account", d.method === "m-cc" && d.account === "a-icici", show(d)); }
{ const d = P("credit card bill 3000"); T("a card bill is an expense", d.type === "Expense" && d.amount === 3000, show(d)); }
{ const d = P("paid 200 cash for vegetables"); T("cash is both the account and the method", d.account === "a-cash" && d.method === "m-cash" && d.cat === "c-gro", show(d)); }
{ const d = P("200 by gpay"); T("what people call UPI", d.method === "m-upi", show(d)); }
{ const d = P("paid via paytm 150"); T("a word that named an account is not also the method", d.account === "a-paytm" && d.method === null, show(d)); }
{ const d = P("hdfc 900 electricity"); T("one distinctive word names the account", d.account === "a-hdfc" && d.cat === "c-elec", show(d)); }

console.log("\n— transfers —");
{ const d = P("transfer 5000 from hdfc to paytm"); T("from and to", d.type === "Transfer" && d.account === "a-hdfc" && d.to === "a-paytm" && d.cat === null && d.amount === 5000, show(d)); }
{ const d = P("moved 5000 to paytm from hdfc"); T("in either order", d.account === "a-hdfc" && d.to === "a-paytm", show(d)); }
{ const d = P("withdrew 2000 from hdfc"); T("an ATM withdrawal moves money into cash", d.type === "Transfer" && d.account === "a-hdfc" && d.to === "a-cash" && d.amount === 2000, show(d)); }
{ const d = P("transfer 500 to hdfc"); T("one account is not a transfer, and it says so", d.type === "Expense" && d.warnings.length === 1, show(d)); }

console.log("\n— dates —");
{ const d = P("fuel 2000 yesterday"); T("yesterday", d.date === "2026-11-24", show(d)); }
{ const d = P("day before yesterday chai 40"); T("day before yesterday", d.date === "2026-11-23" && d.amount === 40, show(d)); }
{ const d = P("fuel 2000 3 days ago"); T("n days ago, and the 3 is not the amount", d.date === "2026-11-22" && d.amount === 2000, show(d)); }
{ const d = P("a week ago rent 15000"); T("a week ago", d.date === "2026-11-18", show(d)); }
{ const d = P("last friday movie 600"); T("last Friday is the most recent one", d.date === "2026-11-20" && d.cat === "c-ent", show(d)); }
{ const d = P("on monday 300 lunch"); T("a weekday means this week's, already past", d.date === "2026-11-23" && d.notes === "Lunch", show(d)); }
{ const d = P("last wednesday 100"); T("'last' on the same weekday means a week back", d.date === "2026-11-18", show(d)); }
{ const d = P("paid rent 15000 on 1st"); T("an ordinal is a day this month", d.date === "2026-11-01" && d.amount === 15000 && d.notes === "", show(d)); }
{ const d = P("28th electricity 1200"); T("a day still to come this month means last month", d.date === "2026-10-28", show(d)); }
{ const d = P("30th 500", { today: "2026-03-05" }); T("there is no 30 February: refused, not rolled into March", d.date === null && d.warnings.length === 1, show(d)); }
{ const d = P("on the fifth 900"); T("spoken ordinal", d.date === "2026-11-05" && d.amount === 900, show(d)); }
{ const d = P("nov 3 rs 200"); T("month then day", d.date === "2026-11-03" && d.amount === 200, show(d)); }
{ const d = P("500 on 5 dec"); T("a month still to come is last year's", d.date === "2025-12-05" && d.amount === 500, show(d)); }
{ const d = P("5th of march groceries 700"); T("day of month", d.date === "2026-03-05", show(d)); }
{ const d = P("nov 3 2000 rupees"); T("an amount after a date is not a year", d.date === "2026-11-03" && d.amount === 2000, show(d)); }
{ const d = P("dec 5 2025 lunch 450"); T("an explicit year", d.date === "2025-12-05" && d.amount === 450, show(d)); }
{ const d = P("12/11 lunch 250"); T("day first by default", d.date === "2026-11-12" && d.amount === 250, show(d)); }
{ const d = P("12/11 lunch 250", { dayFirst: false }); T("month first when the locale says so", d.date === "2025-12-11", show(d)); }
{ const d = P("11/25 lunch 250"); T("a date that can only be month first is read that way", d.date === "2026-11-25", show(d)); }
{ const d = P("2026-11-20 fuel 900"); T("ISO dates", d.date === "2026-11-20", show(d)); }
{ const d = P("may i pay 300"); T("'may' alone is a word, not a month", d.date === null && d.amount === 300, show(d)); }

console.log("\n— what the ledger audit found —");
{
  const d = P("rahul paid me back 500");
  T("a repayment is flagged as a debt, so it goes through Settle up instead", d.debt === true && d.warnings.some((w) => w.includes("Settle up")), show(d));
}
{ const d = P("settle 500 with rahul"); T("'settle' is a debt too", d.debt === true, show(d)); }
{ const d = P("got a refund 800"); T("a refund is not a debt", !d.debt && d.type === "Income" && d.cat === "c-ref", show(d)); }
{ const d = P("recharge 299 for 9876543210"); T("a phone number is never the amount", d.amount === 299, show(d)); }
{ const d = P("recharge 9876543210"); T("…not even when it is the only number, and it says why", d.amount === null && d.warnings.length === 1, show(d)); }
{ const d = P("groceries 300 order 12345678"); T("an order number is not the amount", d.amount === 300, show(d)); }
{ const d = P("paid 500 rent for 2025"); T("a year after 'for' is not the amount", d.amount === 500, show(d)); }
{ const d = P("groceries 12/2026 300"); T("month/year is not a date, nor an amount", d.date === null && d.amount === 300, show(d)); }
{ const d = P("paid 1/3 of 900 groceries"); T("a fraction is not a date", d.date === null && d.amount === 900, show(d)); }
{ const d = P("1-2 groceries 300"); T("a range is not a date", d.date === null && d.amount === 300, show(d)); }
{ const d = P("0.004 rupees groceries"); T("an amount that rounds to nothing is left out", d.amount === null, show(d)); }
{ const d = P("50 rupees 150 paise"); T("paise over 100 still count", d.amount === 51.5, show(d)); }
{ const d = P("50 paise toffee"); T("paise alone", d.amount === 0.5, show(d)); }

console.log("\n— the edges —");
{ const d = P(""); T("empty says nothing and does not throw", d.amount === null && d.cat === null && d.notes === "" && d.type === "Expense"); }
{ const d = P("   ...  "); T("punctuation alone says nothing", d.amount === null && d.notes === ""); }
{ const d = P("groceries"); T("no amount is reported as missing, not invented", d.amount === null && d.cat === "c-gro"); }
{
  const a = JSON.stringify(P("spent 450 on lunch yesterday by upi"));
  const b = JSON.stringify(P("spent 450 on lunch yesterday by upi"));
  T("the same words give the same draft every time", a === b);
}
{ const d = P("SPENT 450 ON LUNCH BY UPI"); T("case does not matter", d.amount === 450 && d.method === "m-upi" && d.cat === "c-res", show(d)); }
{ const d = P("450 groceries", { categories: [], accounts: [], methods: [], retailers: [], rules: [] }); T("an empty book still gets an amount", d.amount === 450 && d.cat === null, show(d)); }
{
  const good = draftScore(P("450 groceries upi")), poor = draftScore(P("groceries"));
  T("the scorer prefers the alternative that heard an amount", good > poor, `${good} vs ${poor}`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
