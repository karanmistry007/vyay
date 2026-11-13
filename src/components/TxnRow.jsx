import React from "react";
import { ArrowLeftRight, ArrowDownLeft } from "lucide-react";
import { Ic } from "../lib/icons.jsx";
import { tint } from "../lib/color.js";
import { fmt, buzz, MON } from "../lib/money.js";

export default function TxnRow({ t, s, onClick }) {
  const isTransfer = t.type === "Transfer";
  const cat = isTransfer ? null : s.catById[t.cat];
  const retailer = s.retById[t.ret];
  const account = s.accById[t.account];
  const color = isTransfer ? "var(--tr)" : t.type === "Income" ? "var(--in)" : (cat && cat.color) || "var(--muted)";
  const priv = s.settings.privacy;

  const title = isTransfer
    ? `${account ? account.name : "?"} → ${s.accById[t.to] ? s.accById[t.to].name : "?"}`
    : retailer ? retailer.name : cat ? cat.name : t.notes || "Transaction";

  const bits = [];
  if (!isTransfer && cat && retailer) bits.push(cat.name);
  if (t.splits && t.splits.length > 1) bits.push(`${t.splits.length} categories`);
  if (!isTransfer && account) bits.push(account.name);
  if (s.methById[t.method]) bits.push(s.methById[t.method].name);
  if (t.shares && t.shares.length) bits.push(`split with ${t.shares.length}`);

  /* Tags are appended after the trimmed detail bits so they are never the thing that gets cut. */
  const tagNames = (t.tags || []).map((id) => s.tagById[id]).filter(Boolean).map((tag) => "#" + tag.name);
  const subtitle = [...bits.slice(0, 2), ...tagNames].join(" · ");

  return (
    <div className="vy-row" onClick={() => { buzz(5); onClick(); }}>
      <div className="vy-row-ic" style={{ background: tint(color), color }}>
        {isTransfer ? <ArrowLeftRight size={18} /> : t.type === "Income" ? <ArrowDownLeft size={18} /> : <Ic n={cat ? cat.icon : "Tag"} size={18} />}
      </div>
      <div className="vy-row-m">
        <b>{title}</b><span>{subtitle}</span>
      </div>
      <div className="vy-row-a">
        <b className={priv ? "vy-blur" : ""} style={{ color: isTransfer ? "var(--ink2)" : t.type === "Income" ? "var(--in)" : "var(--ink)" }}>
          {t.type === "Income" ? "+" : isTransfer ? "" : "−"}{fmt(t.amount, { currency: s.currency })}
        </b>
        <span>{t.status && t.status !== "Cleared" ? t.status : `${t.date.slice(8)} ${MON[+t.date.slice(5, 7) - 1]}`}</span>
      </div>
    </div>
  );
}
