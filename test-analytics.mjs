/* The report maths, checked without rendering anything. */
import { buildRange, stepRange, canStepForward, summarise, breakdown, series, weekdays, calendar, insights, topSpends, elapsedDays } from "./src/lib/analytics.js";
import { buildLedger } from "./src/lib/ledger.js";
let pass = 0, fail = 0;
const T = (l, c, e) => { c ? pass++ : fail++; console.log((c ? "  PASS  " : "  FAIL  ") + l + (c || !e ? "" : "  -> " + e)); };

const cat = { food: { id: "food", name: "Food", color: "#E8863C" }, fuel: { id: "fuel", name: "Fuel", color: "#3A6EA5" } };
const ret = { dmart: { id: "dmart", name: "DMart" } };
const tag = { trip: { id: "trip", name: "Trip" } };
const tx = (id, date, amount, c, extra = {}) => ({
  id, book: "b1", type: "Expense", date, amount, account: "a1", cat: c, ret: null, method: null,
  exclude: false, splits: null, shares: null, tags: [], payer: null, ...extra,
});

const txns = [
  tx("1", "2026-08-10", 1000, "food", { ret: "dmart" }),
  tx("2", "2026-08-20", 500, "fuel"),
  tx("3", "2026-09-05", 2000, "food", { ret: "dmart", tags: ["trip"] }),
  tx("4", "2026-09-06", 300, "fuel", { tags: ["trip"] }),
  tx("5", "2026-09-28", 700, "food"),
  { ...tx("6", "2026-09-15", 50000, null), type: "Income", cat: "sal" },
  { ...tx("7", "2026-09-20", 900, "food"), exclude: true },          // hidden from reports
  tx("8", "2025-07-04", 4000, "food"),                                // a different year
];
const ledger = buildLedger(txns);
const lookup = { catById: cat, retById: ret, tagById: tag };

console.log("— periods —");
const sep = buildRange("month", "2026-09-17", txns);
T("a month runs first to last", sep.start === "2026-09-01" && sep.end === "2026-09-30", `${sep.start}..${sep.end}`);
T("and compares against the month before", sep.prev.start === "2026-08-01" && sep.prev.label === "Aug 2026");
const yr = buildRange("year", "2026-05-02", txns);
T("a year runs Jan to Dec", yr.start === "2026-01-01" && yr.end === "2026-12-31");
T("and compares against last year", yr.prev.label === "2025");
const all = buildRange("all", "2026-09-17", txns);
T("all time starts at the first transaction", all.start === "2025-07-04", all.start);
T("all time has nothing to compare with", all.prev === null);
T("a short history keeps monthly bars", all.bucket === "month", all.bucket);
T("stepping back a month works", stepRange(sep, -1, txns).label === "Aug 2026");
T("stepping back a year works", stepRange(yr, -1, txns).label === "2025");
T("all time cannot be stepped", stepRange(all, -1, txns) === all && canStepForward(all) === false);

console.log("\n— totals —");
const s = summarise(ledger, txns, sep);
T("spend excludes hidden transactions", s.spent === 3000, String(s.spent));
T("income is counted", s.earned === 50000, String(s.earned));
T("saved is the difference", s.saved === 47000);
T("savings rate is a fraction", Math.abs(s.savingsRate - 47000 / 50000) < 1e-9);
T("change against last month", Math.abs(s.change - (3000 - 1500) / 1500) < 1e-9, String(s.change));
T("counts only real spends for the average", s.spendCount === 3 && s.average === 1000, `${s.spendCount}/${s.average}`);
const yearStats = summarise(ledger, txns, yr);
T("a year rolls the months up", yearStats.spent === 4500, String(yearStats.spent));
T("and compares with the year before", yearStats.prevSpent === 4000, String(yearStats.prevSpent));
const allStats = summarise(ledger, txns, all);
T("all time totals everything", allStats.spent === 8500, String(allStats.spent));

console.log("\n— breakdowns —");
const byCat = breakdown(ledger, sep, (r) => r.cat, cat);
T("sorted biggest first", byCat[0].key === "food" && byCat[0].value === 2700, JSON.stringify(byCat.map(c => [c.key, c.value])));
T("shares add to one", Math.abs(sum(byCat.map((c) => c.share)) - 1) < 1e-9);
T("movement against the previous period", Math.abs(byCat[0].change - (2700 - 1000) / 1000) < 1e-9, String(byCat[0].change));
const byTag = breakdown(ledger, sep, (r) => r.tags, tag, { multi: true });
T("tagged spend is totalled", byTag.find((x) => x.key === "trip").value === 2300, JSON.stringify(byTag.map(t => [t.key, t.value])));
T("untagged spend is shown too", !!byTag.find((x) => x.key === "_none"));

console.log("\n— charts —");
const daily = series(ledger, sep);
T("a month charts every day", daily.length === 30, String(daily.length));
T("the right days carry the spend", daily.find((d) => d.key === "2026-09-05").spent === 2000);
const monthly = series(ledger, yr);
T("a year charts twelve months", monthly.length === 12);
T("September shows up in the year chart", monthly.find((m) => m.key === "2026-09").spent === 3000);
const yearly = series(ledger, all);
T("a short history charts month by month", yearly.length === 16 && yearly[0].key === "2025-07", JSON.stringify(yearly.map(y => y.key)));
const longHistory = [tx("old", "2021-03-02", 1200, "food"), ...txns];
const allLong = buildRange("all", "2026-09-17", longHistory);
const longLedger = buildLedger(longHistory);
T("a long history switches to yearly bars", allLong.bucket === "year", allLong.bucket);
const byYear = series(longLedger, allLong);
T("one bar per year", byYear.length === 6 && byYear[0].key === "2021", JSON.stringify(byYear.map(y => y.key)));
T("each year carries its own total", byYear.find((y) => y.key === "2026").spent === 4500, JSON.stringify(byYear.map(y => [y.key, y.spent])));
const wd = weekdays(ledger, sep);
T("weekdays start on Monday", wd[0].name === "Mon" && wd.length === 7);
T("one weekday is flagged heaviest", wd.filter((d) => d.highlight).length === 1);
const cal = calendar(ledger, sep);
T("the calendar knows its busiest day", cal.busiest[0] === "5" && cal.busiest[1] === 2000, JSON.stringify(cal.busiest));
T("and counts the quiet ones", cal.spentDays === 3 && cal.quietDays === elapsedDays(sep) - 3);

console.log("\n— insights —");
const notes = insights(ledger, txns, sep, lookup);
T("it names the biggest category", notes.some((n) => n.kind === "top-category" && /Food/.test(n.title)));
T("it names the busiest merchant", notes.some((n) => n.kind === "top-merchant" && /DMart/.test(n.title)));
T("it spots a category that rose", notes.some((n) => n.kind === "rising"), JSON.stringify(notes.map(n => n.kind)));
T("it counts quiet days", notes.some((n) => n.kind === "quiet-days"));
T("a year gets peak and lightest instead", insights(ledger, txns, yr, lookup).some((n) => n.kind === "peak"));
T("an empty period says nothing", insights(ledger, txns, buildRange("month", "2024-01-15", txns), lookup).length === 0);

console.log("\n— biggest spends —");
const top = topSpends(txns, sep);
T("largest first, hidden ones left out", top[0].id === "3" && !top.some((t) => t.id === "7"), top.map(t => t.id).join(","));

function sum(a) { return a.reduce((x, y) => x + y, 0); }

/* ── income breakdowns, period lists and drill-down ── */
import { breakdown as bd, filterTxns, filteredTotal, availableYears, monthsWithActivity } from "./src/lib/analytics.js";
console.log("\n— income and drill-down —");
const income = bd(ledger, sep, (r) => r.cat, { sal: { id: "sal", name: "Salary" } }, { kind: "Income" });
T2("income breaks down positively", income[0].key === "sal" && income[0].value === 50000, JSON.stringify(income.map(i => [i.key, i.value])));
const foodTxns = filterTxns(txns, sep, { kind: "Expense", dim: "cats", key: "food" });
T2("drill-down finds the right transactions", foodTxns.map((t) => t.id).join(",") === "5,3", foodTxns.map(t => t.id).join(","));
T2("hidden transactions stay out of the drill-down", !foodTxns.some((t) => t.id === "7"));
T2("totals match the breakdown", filteredTotal(txns, sep, { kind: "Expense", dim: "cats", key: "food" }) === 2700,
  String(filteredTotal(txns, sep, { kind: "Expense", dim: "cats", key: "food" })));
T2("income drill-down works too", filterTxns(txns, sep, { kind: "Income" }).map((t) => t.id).join(",") === "6");
T2("a tag drill-down picks up every tagged row",
  filterTxns(txns, sep, { kind: "Expense", dim: "tags", key: "trip" }).length === 2);
T2("untagged is its own selection",
  filterTxns(txns, sep, { kind: "Expense", dim: "tags", key: "_none" }).map((t) => t.id).join(",") === "5");
T2("years are listed newest first", availableYears(txns)[0] === "2026" && availableYears(txns).includes("2025"),
  availableYears(txns).join(","));
T2("months with activity are known", [...monthsWithActivity(txns, "2026")].sort((a, b) => a - b).join(",") === "8,9",
  [...monthsWithActivity(txns, "2026")].join(","));

function T2(l, c, e) { T(l, c, e); }

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
