import { COLLECTIONS } from "./db.js";
import { fmt } from "./money.js";
import { myShareOf } from "./ledger.js";

export const APP_EXPORT_VERSION = 2;

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

/** Complete backup. This file can be restored back into the app. */
export function exportJSON(state) {
  const payload = { app: "vyay", exportVersion: APP_EXPORT_VERSION, exportedAt: new Date().toISOString(), meta: state.meta };
  COLLECTIONS.forEach((c) => { payload[c] = state[c]; });
  download(`vyay-backup-${stamp()}.json`, JSON.stringify(payload, null, 2), "application/json");
  return payload;
}

const esc = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** Flat transaction rows with names resolved, one line per split leg. */
export function exportTransactionsCSV(state, bookId, range) {
  const name = (list, id) => { const x = list.find((i) => i.id === id); return x ? x.name : ""; };
  const book = state.books.find((b) => b.id === bookId);
  const rows = [[
    "Date", "Type", "Amount", "Currency", "Category", "Account", "To account",
    "Merchant", "Payment method", "Tags", "Paid by", "Your share", "Status", "Excluded", "Note", "Split note", "Shared with", "Transaction ID",
  ]];
  const inRange = (t) => !range || (t.date >= range.start && t.date <= range.end);
  state.txns.filter((t) => t.book === bookId && inRange(t)).forEach((t) => {
    const shared = (t.shares || [])
      .map((s) => `${name(state.people, s.person)}:${s.amount}${s.settled ? " (settled)" : ""}`).join(" | ");
    const legs = t.splits && t.splits.length ? t.splits : [{ cat: t.cat, amount: t.amount, note: "" }];
    legs.forEach((leg) => rows.push([
      t.date, t.type, leg.amount, book ? book.currency : "",
      t.type === "Transfer" ? "" : name(state.categories, leg.cat),
      name(state.accounts, t.account), t.to ? name(state.accounts, t.to) : "",
      name(state.retailers, t.ret), name(state.methods, t.method),
      (t.tags || []).map((id) => name(state.tags || [], id)).filter(Boolean).join(" | "),
      t.payer ? name(state.people, t.payer) : "Me",
      t.shares && t.shares.length ? myShareOf(t) : "",
      t.status || "Cleared", t.exclude ? "yes" : "no", t.notes || "", leg.note || "", shared, t.id,
    ]));
  });
  const suffix = range && range.type !== "all" ? `-${range.label.replace(/\s+/g, "-").toLowerCase()}` : "";
  download(`vyay-transactions${suffix}-${stamp()}.csv`, rows.map((r) => r.map(esc).join(",")).join("\n"), "text/csv;charset=utf-8");
  return rows.length - 1;
}

/** Master data in one CSV so it can be reviewed or re-keyed elsewhere. */
export function exportMastersCSV(state, bookId) {
  const rows = [["Type", "Name", "Detail 1", "Detail 2", "Detail 3"]];
  state.accounts.filter((a) => a.book === bookId).forEach((a) =>
    rows.push(["Account", a.name, a.type, a.opening, a.archived ? "archived" : "active"]));
  state.categories.filter((c) => c.book === bookId).forEach((c) =>
    rows.push(["Category", c.name, c.dir, c.group || "", c.icon || ""]));
  state.retailers.filter((r) => r.book === bookId).forEach((r) =>
    rows.push(["Merchant", r.name, r.defaultCat || "", (r.aliases || []).join(" | "), ""]));
  state.methods.filter((m) => m.book === bookId).forEach((m) => rows.push(["Payment method", m.name, m.icon || "", "", ""]));
  state.people.filter((p) => p.book === bookId).forEach((p) => rows.push(["Person", p.name, "", "", ""]));
  (state.tags || []).filter((t) => t.book === bookId).forEach((t) => rows.push(["Tag", t.name, "", "", ""]));
  (state.peopleEntries || []).filter((e) => e.book === bookId).forEach((e) => {
    const person = state.people.find((p) => p.id === e.person);
    rows.push(["Outstanding", person ? person.name : "(removed)", e.date, e.amount, e.note || e.kind || ""]);
  });
  download(`vyay-masters-${stamp()}.csv`, rows.map((r) => r.map(esc).join(",")).join("\n"), "text/csv;charset=utf-8");
  return rows.length - 1;
}

/** Validate a backup file before it is allowed anywhere near the database. */
export function validateBackup(parsed) {
  if (!parsed || typeof parsed !== "object") return "That file isn't valid JSON.";
  if (parsed.app !== "vyay") return "This doesn't look like a Vyay backup.";
  const v = parsed.exportVersion;
  if (v !== undefined && (typeof v !== "number" || v > APP_EXPORT_VERSION)) {
    return "That backup came from a newer version of Vyay than this one.";
  }
  if (!Array.isArray(parsed.books)) return "The backup has no books in it.";
  for (const c of COLLECTIONS) {
    if (parsed[c] !== undefined && !Array.isArray(parsed[c])) return `The "${c}" section is malformed.`;
  }
  return null;
}

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read that file."));
    r.readAsText(file);
  });
}
