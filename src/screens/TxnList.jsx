import React, { useMemo } from "react";
import { Layers, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Nav, Empty } from "../components/ui.jsx";
import TxnRow from "../components/TxnRow.jsx";
import { tint } from "../lib/color.js";
import { fmt, relDay, sum, round2 } from "../lib/money.js";
import { buildRange, filterTxns, filteredTotal } from "../lib/analytics.js";

/**
 * The transactions behind a figure on the report.
 *
 * Every number in Reports is a sum of something, and the obvious question is
 * always "which ones?". This answers it, grouped by day like the Activity tab so
 * it reads the same way.
 */
export default function TxnList({ s, nav, params }) {
  const { rangeType = "month", anchor, dim, key, kind = "Expense", title } = params;
  const range = useMemo(() => buildRange(rangeType, anchor, s.txns), [rangeType, anchor, s.txns]);
  const filter = { kind, dim, key };

  const rows = useMemo(() => filterTxns(s.txns, range, filter), [s.txns, range, kind, dim, key]);
  const total = useMemo(() => filteredTotal(s.txns, range, filter), [s.txns, range, kind, dim, key]);
  const priv = s.settings.privacy;
  const cur = s.currency;
  const inbound = kind === "Income";

  const groups = useMemo(() => {
    const m = new Map();
    rows.forEach((t) => { if (!m.has(t.date)) m.set(t.date, []); m.get(t.date).push(t); });
    return [...m.entries()];
  }, [rows]);

  /* A split bill only partly belongs here, so say what the slice was. */
  const sliceOf = (t) => {
    if (dim !== "cats" || !key || key === "_none" || !t.splits || !t.splits.length) return null;
    const part = round2(sum(t.splits.filter((sp) => sp.cat === key).map((sp) => sp.amount)));
    return part && part !== t.amount ? part : null;
  };

  return (
    <div className="vy-screen push-enter">
      <Nav title={title || "Transactions"} onBack={nav.pop} />
      <div className="vy-body">
        <div className="vy-pad">
          <div className="vy-hero">
            <div className="vy-lbl">{inbound ? "Received" : kind === "All" ? "Total" : "Spent"} · {range.label}</div>
            <div className={"vy-hero-amt" + (priv ? " vy-blur" : "")}
              style={{ marginTop: 10, fontSize: 40, color: inbound ? "var(--in)" : "var(--ink)" }}>
              {fmt(total, { currency: cur })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 12 }}>
              <span className="vy-pill" style={{
                background: tint(inbound ? "var(--in)" : "var(--out)"),
                color: inbound ? "var(--in)" : "var(--out)",
              }}>
                {inbound ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                {rows.length} {rows.length === 1 ? "entry" : "entries"}
              </span>
              {rows.length > 0 && (
                <span className="vy-sub">
                  averaging {fmt(round2(total / rows.length), { currency: cur })}
                </span>
              )}
            </div>
          </div>

          {rows.length === 0 ? (
            <Empty icon={<Layers size={26} />} title="Nothing here"
              body={`No ${inbound ? "income" : "spending"} matching this in ${range.label}.`} />
          ) : (
            groups.map(([date, items]) => {
              const dayTotal = round2(sum(items.map((t) => sliceOf(t) || t.amount)));
              return (
                <div key={date}>
                  <div className="vy-daylabel">
                    <b>{relDay(date)}</b>
                    <span className={priv ? "vy-blur" : ""}>{fmt(dayTotal, { currency: cur })}</span>
                  </div>
                  <div className="vy-group">
                    {items.map((t) => (
                      <TxnRow key={t.id} t={t} s={s} onClick={() => nav.push("txn", { id: t.id })} />
                    ))}
                  </div>
                  {items.some(sliceOf) && (
                    <div className="vy-sub" style={{ margin: "8px 6px 0", fontSize: 12.5 }}>
                      Split bills count only the part filed here.
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="vy-tabspace" />
      </div>
    </div>
  );
}
