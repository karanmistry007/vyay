/**
 * Quick add: turn one spoken or typed sentence into a draft transaction.
 *
 * "Spent 450 on groceries yesterday by UPI" has to become an amount, a type, a category, a
 * date and a payment method, and it has to come out the same way every time, on a phone with
 * no network. So this is plain rules over the person's own master data, not a model. A field
 * the sentence does not mention comes back null and the form keeps what it already had; and
 * whenever the parser had to choose between two readings it says so in `warnings`, because a
 * draft that is quietly wrong is worse than one that admits it was unsure.
 *
 * The old quick add took the first number it saw ("2 coffees 300" saved 2), matched payment
 * methods on their first word (so "credited" picked "Credit card"), and set the type after the
 * category without reconciling them. Each of those has a case in test-quickparse.mjs.
 *
 * Pure: no React, no storage, no clock. `ctx.today` is passed in so tests can pin the date.
 */
import { round2, fmt } from "./money.js";

/* ── vocabulary ──────────────────────────────────────────────────────────── */

const UNITS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = {
  hundred: 100, thousand: 1e3, k: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5,
  million: 1e6, millions: 1e6, crore: 1e7, crores: 1e7,
};
const ORDINALS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9,
  tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
  sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30,
};
const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const CURRENCY_WORDS = new Set([
  "rs", "inr", "rupee", "rupees", "rupaye", "rupay", "rupaiya", "bucks",
  "dollar", "dollars", "usd", "euro", "euros", "eur", "pound", "pounds", "gbp",
]);
const PAISE = new Set(["paise", "paisa"]);

/* Verbs only. Nouns such as "salary" or "refund" point at a category, and the category says the direction. */
const EXPENSE_WORDS = new Set(["spent", "spend", "paid", "pay", "paying", "bought", "buy", "purchased", "purchase", "debited", "gave", "sent", "lost", "expense"]);
const INCOME_WORDS = new Set(["received", "receive", "recieved", "credited", "earned", "earn", "reimbursed", "sold", "won", "income", "deposited"]);
const INCOME_PAIRS = [["paid", "me"], ["sent", "me"], ["gave", "me"], ["transferred", "me"], ["got", "paid"], ["got", "back"]];
/*
 * Money that clears an IOU is a settlement, and a settlement recorded as plain income or
 * expense leaves the IOU open: settle it later and the money is counted twice. Quick add
 * cannot pick the person and the debt, so it says so and points at Settle up.
 */
const DEBT_WORDS = new Set(["settle", "settled", "settling", "owe", "owed", "owes", "owing", "repaid", "repay", "repaying", "lent", "borrowed", "iou"]);
const BACK_VERBS = new Set(["paid", "pay", "gave", "give", "sent", "send", "returned", "return", "got"]);
/* The word in front of a number that makes it an identifier rather than a price. */
const ID_WORDS = new Set(["order", "no", "number", "num", "id", "ref", "reference", "invoice", "txn", "transaction", "pnr", "ticket", "mobile", "phone", "ending", "utr", "otp", "pin"]);
const TRANSFER_WORDS = new Set(["transfer", "transferred", "transfered", "moved", "move"]);
const WITHDRAW_WORDS = new Set(["withdrew", "withdraw", "withdrawn", "withdrawal", "atm"]);

/* Words that carry no meaning in a note when they sit at its edge. */
const FILLER = new Set([
  "on", "for", "at", "via", "using", "by", "from", "to", "into", "in", "the", "a", "an", "of", "my",
  "i", "me", "was", "is", "it", "and", "towards", "just", "some", "worth", "total",
]);

/* A single word of an account name only stands for the account when it is not one of these. */
const GENERIC_ACCOUNT = new Set([
  "bank", "account", "acct", "ac", "savings", "saving", "current", "salary", "card", "credit", "debit",
  "wallet", "cash", "my", "main", "personal", "joint", "primary", "secondary", "new", "old",
  "the", "of", "ltd", "limited", "pvt", "home", "loan", "investment", "investments", "fund",
  "deposit", "fixed", "family", "business",
]);
const GENERIC_CATEGORY = new Set([
  "other", "others", "misc", "personal", "public", "received", "income", "expense", "expenses",
  "general", "bill", "bills", "the", "of", "my", "and", "settlement",
]);

/* An account type everyone calls by one word, when the book has exactly one of them. */
const ACCOUNT_TYPE_ALIASES = { Cash: ["cash"], "Credit Card": ["credit card"], Wallet: ["wallet"] };

/* What people actually say for a payment method, keyed by words in the method's own name. */
const METHOD_ALIASES = [
  [["upi"], ["upi", "gpay", "g pay", "google pay", "phonepe", "phone pe", "paytm", "bhim"]],
  [["credit", "card"], ["credit card"]],
  [["debit", "card"], ["debit card", "atm card"]],
  [["net", "banking"], ["net banking", "netbanking", "neft", "imps", "rtgs", "online banking"]],
  [["cash"], ["cash"]],
  [["auto", "debit"], ["auto debit", "autodebit", "autopay", "auto pay", "standing instruction", "mandate"]],
  [["cheque"], ["cheque", "chq"]],
];

/*
 * Everyday words for the starter categories. A keyword only ever resolves to a category the
 * person actually has, matched by name, so renaming "Restaurants" to "Eating out" simply
 * turns that line into a no-op rather than inventing a category. The direction on each line
 * still hints at income versus expense when no category matches.
 */
const KEYWORDS = [
  ["Expense", ["grocery", "groceries", "vegetables", "veggies", "sabzi", "fruits", "milk", "kirana", "bigbasket", "blinkit", "zepto", "dmart", "instamart"], ["Groceries", "Grocery", "Food"]],
  ["Expense", ["swiggy", "zomato", "food delivery", "takeaway"], ["Food delivery", "Restaurants", "Food"]],
  ["Expense", ["breakfast", "lunch", "dinner", "restaurant", "dining", "meal", "biryani", "pizza", "burger"], ["Restaurants", "Food", "Dining", "Eating out"]],
  ["Expense", ["coffee", "tea", "chai", "cafe", "starbucks", "snacks"], ["Cafe", "Restaurants", "Food"]],
  ["Expense", ["petrol", "diesel", "fuel", "cng"], ["Fuel", "Transport"]],
  ["Expense", ["uber", "ola", "rapido", "taxi", "cab", "auto", "rickshaw"], ["Cab & auto", "Cab", "Taxi", "Transport"]],
  ["Expense", ["metro", "bus", "train", "toll", "parking"], ["Public transport", "Transport"]],
  ["Expense", ["rent"], ["Rent", "Housing"]],
  ["Expense", ["electricity", "light bill", "power bill", "current bill"], ["Electricity", "Utilities", "Bills"]],
  ["Expense", ["wifi", "broadband", "internet"], ["Internet", "Utilities", "Bills"]],
  ["Expense", ["recharge", "mobile bill", "phone bill", "postpaid", "prepaid"], ["Mobile", "Utilities", "Bills"]],
  ["Expense", ["clothes", "clothing", "shirt", "jeans", "shoes", "dress", "kurta", "myntra"], ["Clothing", "Shopping"]],
  ["Expense", ["laptop", "headphones", "charger", "gadget", "electronics"], ["Electronics", "Shopping"]],
  ["Expense", ["medicine", "medicines", "pharmacy", "chemist", "tablets"], ["Pharmacy", "Health", "Medical"]],
  ["Expense", ["doctor", "clinic", "hospital", "consultation", "dentist"], ["Doctor", "Health", "Medical"]],
  ["Expense", ["gym", "yoga", "fitness"], ["Fitness", "Health"]],
  ["Expense", ["netflix", "spotify", "hotstar", "subscription", "youtube premium"], ["Subscriptions", "Entertainment"]],
  ["Expense", ["movie", "cinema", "pvr", "concert"], ["Entertainment", "Fun"]],
  ["Expense", ["flight", "hotel", "trip", "vacation", "holiday"], ["Travel"]],
  ["Expense", ["course", "tuition", "books", "school fees", "college fees"], ["Education"]],
  ["Expense", ["haircut", "salon", "barber", "spa"], ["Personal care"]],
  ["Expense", ["gift", "gifts", "donation", "charity"], ["Gifts & donations", "Gifts"]],
  ["Expense", ["sip", "mutual fund", "stocks"], ["Investments"]],
  ["Income", ["salary", "payslip", "paycheck"], ["Salary"]],
  ["Income", ["bonus", "incentive"], ["Bonus", "Salary"]],
  ["Income", ["freelance", "invoice"], ["Freelance", "Business"]],
  ["Income", ["interest"], ["Interest"]],
  ["Income", ["dividend", "dividends"], ["Dividends", "Dividend"]],
  ["Income", ["cashback"], ["Cashback"]],
  ["Income", ["refund", "refunded"], ["Refund", "Refunds"]],
  ["Income", ["rent received", "rental income"], ["Rental income"]],
  ["Income", ["gift"], ["Gift received"]],
];

/* ── tokens ──────────────────────────────────────────────────────────────── */

/*
 * Order matters: a time (4:30) and a numeric date (12/11) must be claimed before the plain
 * number branch splits them into two amounts.
 */
/*
 * The date branch accepts only real date shapes: 2026-11-20, 12/11/2026, 12-11-26, 12/11, and
 * a month/year such as 12/2026 so it can be set aside. "1-2" is a range and "12/2026" is not
 * "20 December, ₹26", which is how a looser pattern once read it.
 */
const TOKEN_RE = /(\d{1,2}:\d{2})|(\d{4}-\d{1,2}-\d{1,2}(?!\d)|\d{1,2}[/-]\d{1,2}[/-](?:\d{4}|\d{2})(?!\d)|\d{1,2}[/-]\d{4}(?!\d)|\d{1,2}\/\d{1,2}(?![\d/]))|(\d[\d,]*(?:\.\d+)?)(st|nd|rd|th|k)?(?![\p{L}\p{N}])|([₹$€£])|([\p{L}\p{N}][\p{L}\p{N}'’]*)/giu;

/** Every spelling a word could be matched under: "groceries" also meets "grocery". */
function forms(word) {
  const w = word.replace(/['’]s$/, "").replace(/['’]/g, "");
  const out = new Set([w]);
  if (w.length > 4 && w.endsWith("ies")) out.add(w.slice(0, -3) + "y");
  if (w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) out.add(w.slice(0, -2));
  if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) out.add(w.slice(0, -1));
  return [...out];
}
const overlaps = (a, b) => a.some((x) => b.includes(x));

function tokenize(input) {
  /* "450rs", "rs450" and "15kg" are three different things; give the digits room first. */
  const text = String(input || "")
    .normalize("NFKC")
    .replace(/(\d)(?!(?:st|nd|rd|th|k)(?!\p{L}))(?=\p{L})/giu, "$1 ")
    .replace(/(\p{L})(?=\d)/gu, "$1 ");
  const tokens = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0];
    const w = raw.toLowerCase();
    const t = { raw, w, used: null, forms: forms(w) };
    if (m[1]) t.kind = "time";
    else if (m[2]) t.kind = /^\d{1,2}[/-]\d{4}$/.test(raw) ? "monthyear" : "dmy";
    else if (m[3] !== undefined) {
      const v = parseFloat(m[3].replace(/,/g, ""));
      const suffix = (m[4] || "").toLowerCase();
      if (suffix === "k") { t.kind = "num"; t.val = v * 1000; t.k = true; }
      else if (suffix) { t.kind = "ordnum"; t.val = v; }
      else { t.kind = "num"; t.val = v; t.int = !m[3].includes("."); }
    } else if (m[5]) t.kind = "cur";
    else if (CURRENCY_WORDS.has(w)) t.kind = "cur";
    else if (w in UNITS) t.kind = "unit";
    else if (w in TENS) t.kind = "tens";
    else if (w in SCALES) t.kind = "scale";
    else if (w in ORDINALS) t.kind = "ordw";
    else if (w === "and") t.kind = "and";
    else if (w === "point") t.kind = "point";
    else if (w === "a" || w === "an") t.kind = "a";
    else t.kind = "word";
    tokens.push(t);
  }
  return tokens;
}

/** A name as a sequence of word-forms. "and" is dropped so "Cab & auto" meets "cab and auto". */
const nameSeq = (name) => tokenize(name).filter((t) => t.w !== "and").map((t) => t.forms);

/** Where `seq` occurs starting exactly at `i`, or -1. Connective "and" may sit between its words. */
function seqEnd(tokens, i, seq, blocked) {
  let j = i;
  for (let k = 0; k < seq.length; k++) {
    if (k > 0) while (tokens[j] && tokens[j].w === "and" && !blocked(tokens[j])) j++;
    const t = tokens[j];
    if (!t || blocked(t) || !overlaps(t.forms, seq[k])) return -1;
    j++;
  }
  return j - 1;
}

/** First occurrence of any of `seqs`; at the same start the longer one wins. */
function findFirst(tokens, seqs, blocked) {
  for (let i = 0; i < tokens.length; i++) {
    let best = null;
    for (const seq of seqs) {
      if (!seq.length) continue;
      const end = seqEnd(tokens, i, seq, blocked);
      if (end >= 0 && (!best || end > best.end)) best = { start: i, end };
    }
    if (best) return best;
  }
  return null;
}

const mark = (tokens, from, to, tag) => { for (let i = from; i <= to; i++) if (!tokens[i].used) tokens[i].used = tag; };

/* ── numbers ─────────────────────────────────────────────────────────────── */

/**
 * Read one number starting at `i`, in digits, words or a mix: "450", "1,25,000", "2.5k",
 * "two thousand five hundred", "one lakh twenty thousand", "2 crore 50 lakh".
 * Two plain numbers side by side ("450 2") stay two numbers.
 */
function readNumber(tokens, i) {
  let total = 0, cur = 0, maxScale = 0, last = null, end = -1, hasVal = false, words = false, scaled = false;
  for (let j = i; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.used) break;
    if (t.kind === "num") {
      if (last !== null && last !== "scale" && last !== "and") break;
      cur += t.val; last = t.k ? "scale" : "digit"; hasVal = true; end = j;
      if (t.k) scaled = true;
    } else if (t.kind === "unit" || t.kind === "tens") {
      const v = t.kind === "unit" ? UNITS[t.w] : TENS[t.w];
      const joins = last === null || last === "scale" || last === "and" || (last === "tens" && t.kind === "unit" && v < 10);
      if (!joins) break;
      cur += v; last = t.kind; hasVal = true; words = true; end = j;
    } else if (t.kind === "a") {
      const next = tokens[j + 1];
      if (last !== null || !next || next.used || next.kind !== "scale") break;
      cur = 1; last = "unit"; hasVal = true; words = true; end = j;
    } else if (t.kind === "scale") {
      if (!hasVal || last === "and") break;
      const mult = SCALES[t.w];
      if (mult === 100) cur = (cur || 1) * 100;
      else if (mult > maxScale) { total = (total + cur) * mult; cur = 0; maxScale = mult; }
      else { total += cur * mult; cur = 0; }
      last = "scale"; words = true; scaled = true; end = j;
    } else if (t.kind === "and") {
      const next = tokens[j + 1];
      if (last !== "scale" || !next || next.used || !["num", "unit", "tens"].includes(next.kind)) break;
      last = "and";
    } else if (t.kind === "point") {
      if (!hasVal || last === "and") break;
      let digits = "", q = j + 1;
      while (tokens[q] && !tokens[q].used && tokens[q].kind === "unit" && UNITS[tokens[q].w] < 10) { digits += UNITS[tokens[q].w]; q++; }
      if (!digits && tokens[q] && !tokens[q].used && tokens[q].kind === "num" && tokens[q].int) { digits = String(tokens[q].val); q++; }
      if (!digits) break;
      cur += parseFloat("0." + digits); end = q - 1; words = true;
      break;
    } else break;
  }
  if (!hasVal) return null;
  return { start: i, end, value: total + cur, words, scaled };
}

function numberRuns(tokens) {
  const runs = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].used) continue;
    const r = readNumber(tokens, i);
    if (r) { runs.push(r); i = r.end; }
  }
  /*
   * "four fifty" and "twelve fifty" are how prices are spoken: 450 and 1250. Two adjacent
   * runs of plain words, the second a two-digit number, read as hundreds and the rest.
   */
  for (let k = 0; k < runs.length - 1; k++) {
    const a = runs[k], b = runs[k + 1];
    if (b.start === a.end + 1 && a.words && b.words && !a.scaled && !b.scaled
      && allWords(tokens, a) && allWords(tokens, b)
      && a.value >= 1 && a.value <= 99 && Number.isInteger(a.value) && b.value >= 10 && b.value <= 99 && Number.isInteger(b.value)) {
      runs.splice(k, 2, { start: a.start, end: b.end, value: a.value * 100 + b.value, words: true, scaled: false });
    }
  }
  return runs;
}
const allWords = (tokens, r) => tokens.slice(r.start, r.end + 1).every((t) => t.kind !== "num");

/* ── dates ───────────────────────────────────────────────────────────────── */

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, "0");
const toUTC = (d) => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); };
const fromUTC = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const addDays = (d, n) => fromUTC(toUTC(d) + n * DAY_MS);
/** A real calendar date or null: there is no 30 February. */
function makeDate(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2999)) return null;
  const r = new Date(Date.UTC(y, m - 1, d));
  return r.getUTCMonth() === m - 1 && r.getUTCDate() === d ? fromUTC(r.getTime()) : null;
}
const MON_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A day of the month written at `i`: "5", "5th", "fifth", "twenty first", "twenty five". */
function dayAt(tokens, i) {
  const t = tokens[i];
  if (!t || t.used) return null;
  const ok = (v) => v >= 1 && v <= 31;
  if ((t.kind === "num" && t.int) || t.kind === "ordnum") return ok(t.val) ? { val: t.val, start: i, end: i } : null;
  if (t.kind === "ordw") return { val: ORDINALS[t.w], start: i, end: i };
  if (t.kind === "unit") return ok(UNITS[t.w]) ? { val: UNITS[t.w], start: i, end: i } : null;
  if (t.kind === "tens") {
    const n = tokens[i + 1];
    if (n && !n.used && n.kind === "ordw" && ORDINALS[n.w] < 10 && ok(TENS[t.w] + ORDINALS[n.w])) return { val: TENS[t.w] + ORDINALS[n.w], start: i, end: i + 1 };
    if (n && !n.used && n.kind === "unit" && UNITS[n.w] < 10 && ok(TENS[t.w] + UNITS[n.w])) return { val: TENS[t.w] + UNITS[n.w], start: i, end: i + 1 };
    return ok(TENS[t.w]) ? { val: TENS[t.w], start: i, end: i } : null;
  }
  return null;
}
/** A day of the month that ends at `i` (for "5th of March"). */
function dayEndingAt(tokens, i) {
  const two = dayAt(tokens, i - 1);
  if (two && two.end === i) return two;
  const one = dayAt(tokens, i);
  return one && one.end === i ? one : null;
}

/** Month and day with no year: this year, unless that is still to come, then last year. */
function resolveMonthDay(today, m, d, y, warnings) {
  const thisYear = Number(today.slice(0, 4));
  if (y) {
    const date = makeDate(y, m, d);
    if (!date) { warnings.push(`There is no ${d} ${MON_NAMES[m - 1]} ${y}, so the date was left as it was.`); return null; }
    if (date > today) { warnings.push(`${d} ${MON_NAMES[m - 1]} ${y} is in the future, so the date was left as it was.`); return null; }
    return date;
  }
  let date = makeDate(thisYear, m, d);
  if (date && date > today) date = makeDate(thisYear - 1, m, d);
  if (!date) warnings.push(`There is no ${d} ${MON_NAMES[m - 1]}, so the date was left as it was.`);
  return date;
}

/** A bare day of the month: this month if it has come, otherwise last month. */
function resolveDayOfMonth(today, d, warnings) {
  let y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  if (d > Number(today.slice(8, 10))) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
  const date = makeDate(y, m, d);
  if (!date) warnings.push(`${MON_NAMES[m - 1]} has no ${d}th, so the date was left as it was.`);
  return date;
}

/** Take "on" or "dated" in front of a date with it, so it does not end up in the note. */
const leadIn = (tokens, start) => (tokens[start - 1] && !tokens[start - 1].used && ["on", "dated"].includes(tokens[start - 1].w) ? start - 1 : start);

function findDates(tokens, ctx, warnings) {
  const { today } = ctx;
  const hits = [];
  const w = (i) => (tokens[i] && !tokens[i].used ? tokens[i].w : "");
  const take = (start, end, date) => {
    if (date) hits.push({ date, start });
    mark(tokens, leadIn(tokens, start), end, "date");
  };

  /* 1. Absolute: "5 Dec", "Dec 5th 2025", "5th of March", "12/11", "2026-11-12". */
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.used) continue;
    if (t.kind === "dmy" && w(i + 1) === "of") { mark(tokens, i, i, "fraction"); continue; }   // "1/3 of 900"
    if (t.kind === "dmy") {
      const parts = t.raw.split(/[/-]/).map(Number);
      let y = null, m, d;
      if (String(t.raw.split(/[/-]/)[0]).length === 4) [y, m, d] = parts;
      else {
        [d, m] = ctx.dayFirst === false ? [parts[1], parts[0]] : [parts[0], parts[1]];
        if (!(m >= 1 && m <= 12) && d >= 1 && d <= 12) [d, m] = [m, d];   // 11/25 can only be month first
        if (parts[2] !== undefined) y = parts[2] < 100 ? 2000 + parts[2] : parts[2];
      }
      take(i, i, resolveMonthDay(today, m, d, y, warnings));
      continue;
    }
    if (!(t.w in MONTHS)) continue;
    const m = MONTHS[t.w];
    let start = i, end = i, day = dayAt(tokens, w(i + 1) === "the" ? i + 2 : i + 1);
    if (day) end = day.end;
    else {
      day = dayEndingAt(tokens, w(i - 1) === "of" ? i - 2 : i - 1);
      if (day) { start = day.start; if (w(start - 1) === "the") start -= 1; }
    }
    if (!day) continue;   // a bare "may" or "march" is a word, not a date
    /* A year only when it is a recent one and not an amount: "Nov 3 2000 rupees" spent 2000. */
    let y = null;
    const yt = tokens[end + 1];
    const thisYear = Number(today.slice(0, 4));
    const followed = tokens[end + 2] && tokens[end + 2].kind === "cur";
    if (yt && !yt.used && yt.kind === "num" && yt.int && yt.val >= thisYear - 10 && yt.val <= thisYear && !followed) { y = yt.val; end += 1; }
    take(start, end, resolveMonthDay(today, m, day.val, y, warnings));
  }

  /* 2. Relative: "yesterday", "day before yesterday", "3 days ago", "last Friday". */
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].used) continue;
    const word = w(i);
    if (word === "day" && w(i + 1) === "before" && w(i + 2) === "yesterday") { take(i, i + 2, addDays(today, -2)); continue; }
    if (word === "yesterday" || word === "yday") { take(i, i, addDays(today, -1)); continue; }
    if (word === "today" || word === "tonight") { take(i, i, today); continue; }
    if (word === "last" && w(i + 1) === "night") { take(i, i + 1, addDays(today, -1)); continue; }
    if (word === "this" && ["morning", "afternoon", "evening"].includes(w(i + 1))) { take(i, i + 1, today); continue; }
    if (word in WEEKDAYS) {
      const todayDow = new Date(toUTC(today)).getUTCDay();
      let back = (todayDow - WEEKDAYS[word] + 7) % 7;
      const prev = w(i - 1);
      if (prev === "last" && back === 0) back = 7;
      take(["last", "this", "past"].includes(prev) ? i - 1 : i, i, addDays(today, -back));
      continue;
    }
    /* "3 days ago", "a week ago", "two weeks back" */
    let n = null, nEnd = i;
    if (tokens[i].kind === "a") n = 1;
    else { const r = readNumber(tokens, i); if (r && Number.isInteger(r.value)) { n = r.value; nEnd = r.end; } }
    if (n !== null) {
      const unit = w(nEnd + 1), ago = w(nEnd + 2);
      const per = unit === "day" || unit === "days" ? 1 : unit === "week" || unit === "weeks" ? 7 : 0;
      if (per && ["ago", "back", "before", "earlier"].includes(ago) && n * per <= 366) { take(i, nEnd + 2, addDays(today, -n * per)); i = nEnd + 2; }
    }
  }

  /* 3. A day of the month on its own: "on the 5th", "1st", "on the fifth". */
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.used) continue;
    let day = null, start = i;
    if (t.kind === "ordnum") day = t.val >= 1 && t.val <= 31 ? { val: t.val, end: i } : null;
    else if (w(i - 1) === "the" && (t.kind === "ordw" || t.kind === "tens" || (t.kind === "num" && w(i - 2) === "on"))) {
      day = dayAt(tokens, i); start = i - 1;
    }
    if (day) take(start, day.end, resolveDayOfMonth(today, day.val, warnings));
  }

  if (!hits.length) return null;
  hits.sort((a, b) => a.start - b.start);
  if (new Set(hits.map((h) => h.date)).size > 1) warnings.push("Heard more than one date; used the first.");
  return hits[0].date;
}

/* ── entities ────────────────────────────────────────────────────────────── */

/**
 * Words that belong to exactly one item in a list and are specific enough to name it alone:
 * "hdfc" for "HDFC Savings", "cab" for "Cab & auto".
 */
function distinctiveWords(items, generic) {
  const count = new Map();
  const seqs = items.map((it) => tokenize(it.name).map((t) => t.w).filter((x) => x !== "and"));
  seqs.forEach((ws) => new Set(ws).forEach((x) => count.set(x, (count.get(x) || 0) + 1)));
  return seqs.map((ws) => ws.length < 2 ? [] : ws.filter((x) => count.get(x) === 1 && x.length >= 3 && /\p{L}/u.test(x) && !generic.has(x)));
}

/** Best place each item is mentioned: full name beats an alias beats a single distinctive word. */
function mentions(tokens, items, optionsOf, blocked) {
  const found = [];
  items.forEach((item, idx) => {
    let best = null;
    for (const { seqs, q } of optionsOf(item, idx)) {
      const hit = findFirst(tokens, seqs, blocked);
      if (!hit) continue;
      const cand = { item, q, start: hit.start, end: hit.end, len: hit.end - hit.start + 1 };
      if (!best || cand.q > best.q || (cand.q === best.q && cand.len > best.len)) best = cand;
    }
    if (best) found.push(best);
  });
  return found.sort((a, b) => b.q - a.q || b.len - a.len || a.start - b.start);
}

/** Greedily keep the strongest mentions that do not share words. */
function pickDistinct(cands, max) {
  const out = [];
  for (const c of cands) {
    if (out.length >= max) break;
    if (out.some((o) => o.item.id === c.item.id || (c.start <= o.end && o.start <= c.end))) continue;
    out.push(c);
  }
  return out;
}

const isSettlement = (c) => (c.name || "").trim().toLowerCase() === "settlement";

/* ── the parser ──────────────────────────────────────────────────────────── */

/**
 * @param {string} text  what was said or typed
 * @param {object} ctx   { today, currency, dayFirst, fallbackType, categories, accounts, methods, retailers, rules }
 *                       `accounts` should be the active ones; archived categories are ignored here anyway.
 * @returns a draft: { type, amount, date, account, to, cat, ret, method, notes, catFrom, typeFrom, warnings }
 *          Every field the sentence did not settle is null.
 */
export function parseQuick(text, ctx) {
  const warnings = [];
  const fallbackType = ["Expense", "Income", "Transfer"].includes(ctx.fallbackType) ? ctx.fallbackType : "Expense";
  const draft = {
    type: fallbackType, typeFrom: "form", amount: null, date: null, account: null, to: null,
    cat: null, catFrom: null, ret: null, method: null, notes: "", debt: false, warnings,
  };
  const tokens = tokenize(text);
  if (!tokens.length) return draft;

  const categories = (ctx.categories || []).filter((c) => !c.archived && !isSettlement(c) && (c.dir === "Expense" || c.dir === "Income"));
  const catIds = new Set(categories.map((c) => c.id));
  const accounts = ctx.accounts || [];
  const methods = ctx.methods || [];
  const retailers = ctx.retailers || [];

  /* Dates first, so "on the 5th" and "3 days ago" are not read as amounts. */
  draft.date = findDates(tokens, ctx, warnings);

  const notDate = (t) => t.used === "date";

  /* Accounts: full name, then "cash" / "credit card" / "wallet" when the book has one, then one distinctive word. */
  const accWords = distinctiveWords(accounts, GENERIC_ACCOUNT);
  const accCands = mentions(tokens, accounts, (a, idx) => {
    const opts = [{ seqs: [nameSeq(a.name)], q: 3 }];
    const aliases = ACCOUNT_TYPE_ALIASES[a.type];
    if (aliases && accounts.filter((x) => x.type === a.type).length === 1) opts.push({ seqs: aliases.map(nameSeq), q: 2 });
    if (accWords[idx].length) opts.push({ seqs: accWords[idx].map((x) => [forms(x)]), q: 1 });
    return opts;
  }, notDate);

  /* Payment methods: full name, then the words people use for it. Never the first word alone. */
  const methodCands = mentions(tokens, methods, (m) => {
    const own = tokenize(m.name).map((t) => t.w);
    const opts = [{ seqs: [nameSeq(m.name)], q: 3 }];
    for (const [key, aliases] of METHOD_ALIASES) {
      if (key.every((k) => own.includes(k))) opts.push({ seqs: aliases.map(nameSeq), q: 2 });
    }
    return opts;
  }, notDate);

  const retCands = mentions(tokens, retailers, (r) => [{ seqs: [nameSeq(r.name)], q: 3 }], notDate);

  /* The auto-categorise rules keep their own meaning: "the text contains". First match wins. */
  const lower = String(text || "").toLowerCase();
  const rule = (ctx.rules || []).find((r) => r.on && r.match && lower.includes(String(r.match).toLowerCase()));

  const accPicked = pickDistinct(accCands, 2);
  /* "paytm" names both a wallet and a UPI app; when it named an account, it is not also the method. */
  const method = methodCands.find((m) => m.q === 3 || !accPicked.some((a) => m.start <= a.end && a.start <= m.end)) || null;
  const ret = retCands[0] || null;
  accPicked.forEach((c) => mark(tokens, c.start, c.end, "account"));
  if (method) mark(tokens, method.start, method.end, "method");
  if (ret) mark(tokens, ret.start, ret.end, "merchant");

  /* Categories: rule, then the merchant's default, then the name, then everyday words, then one distinctive word. */
  const catCands = [];
  /* Everyday words may not reuse an account's or a method's words ("auto" in "auto debit"), but may reuse a merchant's. */
  const byEntity = (t) => t.used === "date" || t.used === "account" || t.used === "method";
  if (rule && catIds.has(rule.cat)) catCands.push({ id: rule.cat, pri: 5, len: 0, pos: -1, from: "rule" });
  if (ret && ret.item.defaultCat && catIds.has(ret.item.defaultCat)) catCands.push({ id: ret.item.defaultCat, pri: 4, len: 0, pos: ret.start, from: "merchant" });
  const catWords = distinctiveWords(categories, GENERIC_CATEGORY);
  categories.forEach((c, idx) => {
    const full = findFirst(tokens, [nameSeq(c.name)], notDate);
    if (full) {
      catCands.push({ id: c.id, pri: 3, len: full.end - full.start + 1, pos: full.start, from: "name", span: full });
      return;
    }
    const part = catWords[idx].length ? findFirst(tokens, catWords[idx].map((x) => [forms(x)]), byEntity) : null;
    if (part) catCands.push({ id: c.id, pri: 1, len: 1, pos: part.start, from: "word", span: part });
  });
  const catSeqs = categories.map((c) => ({ c, seq: nameSeq(c.name) }));
  const sameName = (a, b) => a.length === b.length && a.every((f, k) => overlaps(f, b[k]));
  const keywordDirs = [];
  for (const [dir, words, names] of KEYWORDS) {
    const hit = findFirst(tokens, words.map(nameSeq), byEntity);
    if (!hit) continue;
    keywordDirs.push({ dir, pos: hit.start });
    for (const name of names) {
      const want = nameSeq(name);
      const c = catSeqs.find((x) => x.c.dir === dir && sameName(x.seq, want));
      if (c) { catCands.push({ id: c.c.id, pri: 2, len: hit.end - hit.start + 1, pos: hit.start, from: "keyword" }); break; }
    }
  }
  catCands.sort((a, b) => b.pri - a.pri || b.len - a.len || a.pos - b.pos);

  /* Direction words, read only from what no name has claimed: "credit" in "Credit card" says nothing. */
  const said = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.used) continue;
    const pair = INCOME_PAIRS.find(([a, b]) => t.w === a && tokens[i + 1] && !tokens[i + 1].used && tokens[i + 1].w === b);
    if (pair) { said.push({ type: "Income", pos: i, end: i + 1 }); i += 1; continue; }
    if (INCOME_WORDS.has(t.w)) said.push({ type: "Income", pos: i, end: i });
    else if (EXPENSE_WORDS.has(t.w)) said.push({ type: "Expense", pos: i, end: i });
  }
  const moveWord = tokens.findIndex((t) => !t.used && TRANSFER_WORDS.has(t.w));
  const withdrawWord = tokens.findIndex((t) => !t.used && WITHDRAW_WORDS.has(t.w));

  /* ── type ── */
  const cashAccounts = accounts.filter((a) => a.type === "Cash");
  let transfer = null;
  if ((moveWord >= 0 || withdrawWord >= 0) && accPicked.length >= 2) {
    const roleOf = (c) => {
      let k = c.start - 1;
      while (tokens[k] && ["my", "the"].includes(tokens[k].w)) k--;
      const w = tokens[k] ? tokens[k].w : "";
      return ["to", "into", "in"].includes(w) ? "to" : ["from", "out"].includes(w) ? "from" : null;
    };
    const byPos = [...accPicked].sort((a, b) => a.start - b.start);
    const dest = byPos.find((c) => roleOf(c) === "to") || byPos.find((c) => roleOf(c) !== "from" && c !== byPos[0]) || byPos[1];
    const src = byPos.find((c) => c !== dest);
    transfer = { from: src.item.id, to: dest.item.id };
  } else if (withdrawWord >= 0 && accPicked.length === 1 && accPicked[0].item.type !== "Cash" && cashAccounts.length === 1) {
    transfer = { from: accPicked[0].item.id, to: cashAccounts[0].id };   // cash out of an ATM
  }

  const strong = said.filter((x) => x.type);
  const strongTypes = new Set(strong.map((x) => x.type));
  if (transfer) {
    draft.type = "Transfer"; draft.typeFrom = "said";
    draft.account = transfer.from; draft.to = transfer.to;
    mark(tokens, moveWord >= 0 ? moveWord : withdrawWord, moveWord >= 0 ? moveWord : withdrawWord, "type");
  } else {
    if (strong.length) {
      draft.type = strong[0].type; draft.typeFrom = "said";
      if (strongTypes.size > 1) warnings.push(`Heard both "${tokens[strong[0].pos].raw}" and "${tokens[strong.find((x) => x.type !== strong[0].type).pos].raw}"; treated it as ${strong[0].type.toLowerCase()}.`);
    } else if (catCands.length) {
      draft.type = categories.find((c) => c.id === catCands[0].id).dir; draft.typeFrom = "category";
    } else if (keywordDirs.length) {
      draft.type = keywordDirs.sort((a, b) => a.pos - b.pos)[0].dir; draft.typeFrom = "category";
    }
    strong.forEach((x) => mark(tokens, x.pos, x.end, "type"));
    if (moveWord >= 0 && accPicked.length) warnings.push("A transfer needs two of your accounts; only one was heard, so this was not made a transfer.");
  }

  /* ── category: the strongest candidate that points the same way as the type ── */
  if (draft.type !== "Transfer") {
    const fit = catCands.find((c) => categories.find((x) => x.id === c.id).dir === draft.type);
    if (fit) {
      draft.cat = fit.id; draft.catFrom = fit.from;
      if (fit.span && (fit.from === "name" || fit.from === "word")) mark(tokens, fit.span.start, fit.span.end, "category");
    } else if (catCands.length) {
      const other = categories.find((x) => x.id === catCands[0].id);
      warnings.push(`"${other.name}" is ${other.dir === "Income" ? "an income" : "an expense"} category, so the category was left blank.`);
    }
    if (rule && rule.ret && retailers.some((r) => r.id === rule.ret)) draft.ret = rule.ret;
    else if (ret) draft.ret = ret.item.id;
    if (accPicked.length) {
      const first = [...accPicked].sort((a, b) => a.start - b.start)[0];
      draft.account = first.item.id;
      if (accPicked.length > 1) warnings.push(`Heard two accounts; used ${first.item.name}.`);
    }
  }
  if (method) draft.method = method.item.id;

  /* ── debts: flagged before anything else, so the warning leads the list ── */
  const debtAt = tokens.findIndex((t, i) => DEBT_WORDS.has(t.w)
    || (t.w === "back" && [i - 1, i - 2, i - 3].some((k) => tokens[k] && BACK_VERBS.has(tokens[k].w))));
  if (debtAt >= 0) {
    draft.debt = true;
    warnings.unshift("This sounds like a debt being paid back. Use Settle up on the person instead, so the IOU is cleared along with the money.");
  }

  /* ── amount: last, from whatever no name or date has claimed ── */
  const runs = numberRuns(tokens);
  const isCur = (i) => tokens[i] && !tokens[i].used && tokens[i].kind === "cur";
  const paiseAfter = (r) => tokens[r.end + 1] && !tokens[r.end + 1].used && PAISE.has(tokens[r.end + 1].w);
  const isTagged = (r) => isCur(r.start - 1) || isCur(r.end + 1);
  const bareDigits = (r) => !r.words && r.start === r.end && tokens[r.start].kind === "num" && tokens[r.start].int && !tokens[r.start].k;
  const before = (r) => (tokens[r.start - 1] ? tokens[r.start - 1].w : "");
  /* A phone number or an order number is never the price, however large; only a currency word overrides that. */
  const isId = (r) => !isTagged(r) && ((bareDigits(r) && tokens[r.start].raw.replace(/,/g, "").length >= 10) || ID_WORDS.has(before(r)));
  const thisYear = Number(ctx.today.slice(0, 4));
  const isYear = (r) => !isTagged(r) && bareDigits(r) && /^\d{4}$/.test(tokens[r.start].raw)
    && r.value >= thisYear - 10 && r.value <= thisYear && ["for", "in", "of", "year", "since", "fy"].includes(before(r));

  const cands = runs.filter((r) => r.value > 0 && !paiseAfter(r) && !isId(r));
  const tagged = cands.filter(isTagged);
  const notYears = cands.filter((r) => !isYear(r));
  const pool = tagged.length ? tagged : notYears.length ? notYears : cands;
  let value = null;
  if (pool.length) {
    const pick = pool.reduce((a, b) => (b.value > a.value ? b : a));
    value = pick.value;
    let end = pick.end;
    if (isCur(pick.end + 1)) end = pick.end + 1;
    /* "50 rupees and 20 paise", "50 rupees 150 paise" */
    const paise = runs.find((r) => paiseAfter(r) && r.start > end && r.start <= end + 2);
    if (paise) {
      value += paise.value / 100;
      mark(tokens, paise.start, paise.end + 1, "amount");
      if (tokens[end + 1] && tokens[end + 1].w === "and") mark(tokens, end + 1, end + 1, "amount");
    }
    mark(tokens, isCur(pick.start - 1) ? pick.start - 1 : pick.start, end, "amount");
    if (pool.length > 1) warnings.push(`Heard more than one number; used ${fmt(round2(value), { currency: ctx.currency })}.`);
  } else {
    const paise = runs.find(paiseAfter);   // "50 paise" on its own
    if (paise) { value = paise.value / 100; mark(tokens, paise.start, paise.end + 1, "amount"); }
  }
  if (value !== null) {
    const amount = round2(value);
    if (amount >= 1e10) warnings.push("That amount is too large for one entry, so it was left out.");
    else if (amount <= 0) warnings.push("That amount rounds to nothing, so it was left out.");
    else draft.amount = amount;
  }
  if (draft.amount === null && runs.some((r) => r.value > 0 && isId(r))) {
    warnings.push("The only number heard looks like a phone, order or reference number, so it was not used as the amount.");
  }

  draft.notes = buildNote(tokens, draft, categories);
  return draft;
}

/**
 * What is left once the amount, date, names and direction words are taken out, so "lunch with
 * the team at Swiggy 450" keeps "Lunch with the team". Everyday words such as "lunch" are
 * kept even when they chose the category, because they say more than the category does.
 */
function buildNote(tokens, draft, categories) {
  const groups = [];
  let cur = [];
  for (const t of tokens) {
    if (t.used || t.kind === "cur") { if (cur.length) groups.push(cur); cur = []; continue; }
    cur.push(t);
  }
  if (cur.length) groups.push(cur);
  const words = [];
  for (const g of groups) {
    let a = 0, b = g.length - 1;
    while (a <= b && FILLER.has(g[a].w)) a++;
    while (b >= a && (FILLER.has(g[b].w) || g[b].w === "with")) b--;
    if (a <= b) words.push(...g.slice(a, b + 1).map((t) => t.raw));
  }
  let note = words.join(" ").trim();
  const cat = draft.cat && categories.find((c) => c.id === draft.cat);
  if (cat && note.toLowerCase() === cat.name.toLowerCase()) note = "";
  if (note.length > 140) note = note.slice(0, 140).trim();
  return note ? note[0].toUpperCase() + note.slice(1) : "";
}

/** How much of a draft was understood; picks the best of a recogniser's alternatives. */
export function draftScore(d) {
  return (d.amount != null ? 4 : 0) + (d.cat ? 2 : 0) + (d.account ? 1 : 0) + (d.method ? 1 : 0)
    + (d.date ? 1 : 0) + (d.ret ? 1 : 0) + (d.typeFrom === "said" ? 1 : 0) - d.warnings.length * 0.5;
}
