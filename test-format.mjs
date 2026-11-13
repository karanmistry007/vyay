/* Formatting and rounding, where the inconsistency was visible. */
import { fmt, round2 } from "./src/lib/money.js";
import { tint } from "./src/lib/color.js";
let pass = 0, fail = 0;
const T = (l, c, e) => { c ? pass++ : fail++; console.log((c ? "  PASS  " : "  FAIL  ") + l + (c || !e ? "" : "  -> " + e)); };

console.log("— two decimals, always —");
T("a whole number still shows paise", fmt(339) === "₹339.00", fmt(339));
T("a real balance is not rounded away", fmt(19051.06) === "₹19,051.06", fmt(19051.06));
T("lakh grouping survives", fmt(380000) === "₹3,80,000.00", fmt(380000));
T("negatives keep the sign and the paise", fmt(-299.5) === "−₹299.50", fmt(-299.5));
T("explicit + sign works", fmt(182, { sign: true }) === "+₹182.00", fmt(182, { sign: true }));
T("thirds do not leak float dust", fmt(350 / 3) === "₹116.67", fmt(350 / 3));
T("bare drops the symbol only", fmt(1234.5, { bare: true }) === "1,234.50", fmt(1234.5, { bare: true }));
T("western grouping for other currencies", fmt(1234567.8, { currency: "USD" }) === "$1,234,567.80", fmt(1234567.8, { currency: "USD" }));

console.log("\n— compact stays a summary —");
T("compact is still short", fmt(380000, { compact: true }) === "₹3.8L", fmt(380000, { compact: true }));
T("compact thousands", fmt(5713, { compact: true }) === "₹5.7K", fmt(5713, { compact: true }));
T("compact crore", fmt(12500000, { compact: true }) === "₹1.3Cr", fmt(12500000, { compact: true }));
T("small amounts are exact even in compact", fmt(339, { compact: true }) === "₹339.00", fmt(339, { compact: true }));

console.log("\n— rounding on the way in —");
T("round2 kills the dust", round2(116.66666666666667) === 116.67, String(round2(116.66666666666667)));
T("round2 leaves clean values alone", round2(1250) === 1250);
T("round2 handles junk", round2(undefined) === 0 && round2("abc") === 0);
T("three-way split still totals the bill",
  round2(350 / 3) * 2 + round2(350 - round2(350 / 3) * 2) === 350,
  String(round2(350 / 3) * 2 + round2(350 - round2(350 / 3) * 2)));

console.log("\n— icon tints —");
T("a stored hex keeps the old appearance", tint("#E8863C") === "#E8863C1c", tint("#E8863C"));
T("a theme variable produces valid CSS", tint("var(--in)") === "color-mix(in srgb, var(--in) 11%, transparent)", tint("var(--in)"));
T("no colour falls back to the neutral tile", tint(null) === "var(--icon-neutral)", tint(null));
T("the old concatenation bug cannot recur", !tint("var(--tr)").includes("var(--tr)1c"));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
