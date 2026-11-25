import React, { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X, Layers } from "lucide-react";
import TxnRow from "../components/TxnRow.jsx";
import { Nav, Seg, Sheet, Confirm, Empty, SwipeRow, useToast } from "../components/ui.jsx";
import { fmt, buzz, sum, relDay, iso } from "../lib/money.js";

const BLANK = { type: "All", cats: [], accs: [], methods: [], tags: [], range: "3m", min: "", max: "" };

export default function Txns({ s, nav, onDelete }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [f, setF] = useState(BLANK);
  const [showFilter, setShowFilter] = useState(false);
  // A swipe deletes with no tap after it, so a stray one must be caught here, not by Undo alone.
  const [confirming, setConfirming] = useState(null);
  const priv = s.settings.privacy;

  const cutoff = useMemo(() => {
    if (f.range === "all") return "0000-00-00";
    const n = { "1m": 1, "3m": 3, "6m": 6, "12m": 12 }[f.range];
    const d = new Date();
    return iso(new Date(d.getFullYear(), d.getMonth() - n + 1, 1));
  }, [f.range]);

  const list = useMemo(() => s.txns.filter((t) => {
    if (t.date < cutoff) return false;
    if (f.type !== "All" && t.type !== f.type) return false;
    if (f.cats.length && !f.cats.includes(t.cat) && !(t.splits || []).some((x) => f.cats.includes(x.cat))) return false;
    if (f.accs.length && !f.accs.includes(t.account) && !f.accs.includes(t.to)) return false;
    if (f.methods.length && !f.methods.includes(t.method)) return false;
    if (f.tags.length && !f.tags.some((id) => (t.tags || []).includes(id))) return false;
    if (f.min && t.amount < Number(f.min)) return false;
    if (f.max && t.amount > Number(f.max)) return false;
    if (q) {
      const hay = [
        s.retById[t.ret] && s.retById[t.ret].name,
        s.catById[t.cat] && s.catById[t.cat].name,
        s.accById[t.account] && s.accById[t.account].name,
        s.methById[t.method] && s.methById[t.method].name,
        ...(t.tags || []).map((id) => s.tagById[id] && s.tagById[id].name),
        t.notes, String(t.amount),
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [s.txns, q, f, cutoff, s.catById, s.retById, s.accById, s.methById]);

  const groups = useMemo(() => {
    const m = new Map();
    list.forEach((t) => { if (!m.has(t.date)) m.set(t.date, []); m.get(t.date).push(t); });
    return [...m.entries()];
  }, [list]);

  const totalOut = sum(list.filter((t) => t.type === "Expense").map((t) => t.amount));
  const activeFilters = (f.type !== "All" ? 1 : 0) + f.cats.length + f.accs.length + f.methods.length + f.tags.length
    + (f.min || f.max ? 1 : 0) + (f.range !== "3m" ? 1 : 0);

  return (
    <div className="vy-screen fade-enter">
      <Nav title="Activity" big right={
        <button className="vy-iconbtn" onClick={() => { buzz(5); setShowFilter(true); }} aria-label="Filters">
          <SlidersHorizontal size={18} />
          {activeFilters > 0 && (
            <span style={{ position: "absolute", marginLeft: 17, marginTop: -15, minWidth: 15, height: 15, borderRadius: 9,
              background: "var(--accent)", color: "#fff", fontSize: 9.5, fontWeight: 700, display: "grid", placeItems: "center" }}>
              {activeFilters}
            </span>
          )}
        </button>} />

      {s.txns.length > 0 && (
        <>
          <div className="vy-pad">
            <div className="vy-searchbar">
              <Search size={17} style={{ color: "var(--muted)" }} />
              <input placeholder="Search merchant, note, amount" value={q} onChange={(e) => setQ(e.target.value)} />
              {q && <button className="vy-iconbtn ghost" style={{ width: 22, height: 22 }} onClick={() => setQ("")}><X size={15} /></button>}
            </div>
          </div>
          <div className="vy-pad" style={{ marginTop: 12 }}>
            <Seg value={f.type} onChange={(v) => setF({ ...f, type: v })}
              options={[{ v: "All", l: "All" }, { v: "Expense", l: "Out" }, { v: "Income", l: "In" }, { v: "Transfer", l: "Moved" }]} />
          </div>
        </>
      )}

      <div className="vy-body" style={{ marginTop: 4 }}>
        <div className="vy-pad">
          {s.txns.length === 0 ? (
            <Empty icon={<Layers size={24} />} title="Nothing logged yet"
              body="Every transaction you add shows up here, newest first, grouped by day."
              cta="Add a transaction" onCta={() => nav.push("add")} />
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 4px 0" }}>
                <span className="vy-sub">{list.length} transaction{list.length === 1 ? "" : "s"}</span>
                <span className={"vy-sub vy-num" + (priv ? " vy-blur" : "")}>{fmt(totalOut, { currency: s.currency })} out</span>
              </div>

              {!groups.length && (
                <Empty icon={<Search size={24} />} title="No matches"
                  body="Nothing here fits this search. Try clearing a filter or widening the date range."
                  cta="Clear filters" onCta={() => { setQ(""); setF(BLANK); }} />
              )}

              {groups.map(([date, items]) => {
                const dayOut = sum(items.filter((t) => t.type === "Expense").map((t) => t.amount));
                return (
                  <div key={date}>
                    <div className="vy-daylabel">
                      <b>{relDay(date)}</b>
                      <span className={priv ? "vy-blur" : ""}>{dayOut ? fmt(dayOut, { currency: s.currency }) : "—"}</span>
                    </div>
                    <div className="vy-group">
                      {items.map((t) => (
                        <SwipeRow key={t.id} onEdit={() => nav.push("edit", { id: t.id })} onDelete={() => setConfirming(t)}>
                          <TxnRow t={t} s={s} onClick={() => nav.push("txn", { id: t.id })} />
                        </SwipeRow>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
        <div className="vy-tabspace" />
      </div>

      <Sheet open={showFilter} onClose={() => setShowFilter(false)} title="Filters"
        right={<button className="vy-link" onClick={() => setF(BLANK)}>Reset</button>}>
        <div className="vy-lbl" style={{ marginBottom: 8 }}>Period</div>
        <Seg value={f.range} onChange={(v) => setF({ ...f, range: v })}
          options={[{ v: "1m", l: "1M" }, { v: "3m", l: "3M" }, { v: "6m", l: "6M" }, { v: "12m", l: "1Y" }, { v: "all", l: "All" }]} />

        <div className="vy-lbl" style={{ margin: "20px 0 8px" }}>Amount between</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input className="vy-input" placeholder="Min" inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} />
          <input className="vy-input" placeholder="Max" inputMode="decimal" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} />
        </div>

        {[["Categories", "cats", s.categories], ["Accounts", "accs", s.accounts], ["Payment methods", "methods", s.methods], ["Tags", "tags", s.tags]].map(([label, key, items]) => (
          items.length > 0 && (
            <div key={key}>
              <div className="vy-lbl" style={{ margin: "20px 0 8px" }}>{label}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {items.map((i) => {
                  const on = f[key].includes(i.id);
                  return (
                    <button key={i.id} className={"vy-chip" + (on ? " on" : "")}
                      onClick={() => { buzz(5); setF({ ...f, [key]: on ? f[key].filter((x) => x !== i.id) : [...f[key], i.id] }); }}>
                      {i.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )
        ))}

        <button className="vy-btn" style={{ marginTop: 24 }} onClick={() => setShowFilter(false)}>
          Show {list.length} transaction{list.length === 1 ? "" : "s"}
        </button>
      </Sheet>

      <Confirm open={!!confirming} onClose={() => setConfirming(null)} onConfirm={() => onDelete(confirming)}
        title="Delete this transaction?"
        body={confirming ? `${(s.retById[confirming.ret] || s.catById[confirming.cat] || {}).name || confirming.type}, `
          + `${fmt(confirming.amount, { currency: s.currency })} (${relDay(confirming.date)}), will be removed. `
          + "You can undo it straight after." : ""} />
    </div>
  );
}
