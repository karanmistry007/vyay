export const CURRENCIES = [
  { code: "INR", symbol: "₹", grouping: "indian" },
  { code: "USD", symbol: "$", grouping: "western" },
  { code: "EUR", symbol: "€", grouping: "western" },
  { code: "GBP", symbol: "£", grouping: "western" },
  { code: "AED", symbol: "AED ", grouping: "western" },
  { code: "SGD", symbol: "S$", grouping: "western" },
  { code: "AUD", symbol: "A$", grouping: "western" },
  { code: "CAD", symbol: "C$", grouping: "western" },
  { code: "JPY", symbol: "¥", grouping: "western" },
];
export const currencyOf = (code) => CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];

function groupIndian(intPart) {
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  return (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," : "") + last3;
}
const groupWestern = (intPart) => intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Format an amount.
 *
 * Exact figures always carry two decimals, so a balance of 19051.06 never reads
 * as 19,051 in one place and 19,051.06 in another. `compact` is a different
 * thing — a rounded summary like 3.8L — and keeps its short form.
 */
export function fmt(n, opts = {}) {
  const { currency = "INR", compact = false, sign = false, dec = true, bare = false } = opts;
  const cur = currencyOf(currency);
  const indian = cur.grouping === "indian";
  const neg = n < 0;
  const v = Math.abs(Number(n) || 0);
  let body;

  if (compact && indian && v >= 1e7) body = trim(v / 1e7) + "Cr";
  else if (compact && indian && v >= 1e5) body = trim(v / 1e5) + "L";
  else if (compact && !indian && v >= 1e9) body = trim(v / 1e9) + "B";
  else if (compact && !indian && v >= 1e6) body = trim(v / 1e6) + "M";
  else if (compact && v >= 1000) body = trim(v / 1000) + "K";
  else {
    const fixed = dec ? v.toFixed(2) : Math.round(v).toString();
    const [i, d] = fixed.split(".");
    body = (indian ? groupIndian(i) : groupWestern(i)) + (d ? "." + d : "");
  }
  const prefix = sign ? (neg ? "−" : "+") : neg ? "−" : "";
  return prefix + (bare ? "" : cur.symbol) + body;
}
const trim = (x) => (x >= 100 ? Math.round(x).toString() : x.toFixed(1).replace(/\.0$/, ""));

/* ── dates ───────────────────────────────────────────────────────────────── */
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const today = () => new Date();
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const isoToday = () => iso(new Date());
export const parseISO = (s) => new Date(s + "T00:00:00");
export const monthKey = (s) => s.slice(0, 7);
export const thisMonth = () => isoToday().slice(0, 7);
export const monthLabel = (k) => MON[+k.slice(5, 7) - 1] + " " + k.slice(2, 4);
export const daysInMonth = (k) => new Date(+k.slice(0, 4), +k.slice(5, 7), 0).getDate();
export const addMonths = (k, n) => iso(new Date(+k.slice(0, 4), +k.slice(5, 7) - 1 + n, 1)).slice(0, 7);

export function relDay(s) {
  const d = parseISO(s);
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((t - d) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  if (diff > 0 && diff < 7) return DAYS[d.getDay()];
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`;
}

/* ── misc ────────────────────────────────────────────────────────────────── */
export const uid = (p = "id") =>
  p + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
export const buzz = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* unsupported */ } };
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/**
 * Round to the smallest unit of currency.
 *
 * Splitting 350 three ways leaves 116.66666666666667 in memory; storing that
 * makes every later total drift. Everything written to the database goes
 * through here first.
 */
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const sum = (arr) => arr.reduce((a, b) => a + b, 0);
