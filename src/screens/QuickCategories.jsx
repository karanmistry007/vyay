import React, { useMemo, useState } from "react";
import { ChevronUp, ChevronDown, Star, Layers, RotateCcw } from "lucide-react";
import { Nav, Seg, Empty, useToast } from "../components/ui.jsx";
import { Ic } from "../lib/icons.jsx";
import { tint } from "../lib/color.js";
import { buzz } from "../lib/money.js";
import { byOrder } from "../lib/ledger.js";

/**
 * Controls the horizontal chip row on the add screen: which categories appear
 * there and in what order. Until something is pinned the row falls back to
 * whatever you've used most recently.
 */
export default function QuickCategories({ s, nav }) {
  const toast = useToast();
  const [dir, setDir] = useState("Expense");

  const all = useMemo(
    () => s.categories.filter((c) => c.dir === dir && !c.archived).slice().sort(byOrder),
    [s.categories, dir]
  );
  const pinned = all.filter((c) => c.quick);
  const rest = all.filter((c) => !c.quick);

  const renumber = async (list) => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].order !== i) await s.update("categories", list[i].id, { order: i });
    }
  };

  const move = async (index, delta) => {
    const next = [...pinned];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    buzz(8);
    [next[index], next[target]] = [next[target], next[index]];
    await renumber([...next, ...rest]);
  };

  const pin = async (cat) => {
    buzz(8);
    await s.update("categories", cat.id, { quick: true, order: pinned.length });
    await renumber([...pinned, cat, ...rest.filter((c) => c.id !== cat.id)]);
  };

  const unpin = async (cat) => {
    buzz(8);
    await s.update("categories", cat.id, { quick: false });
    await renumber([...pinned.filter((c) => c.id !== cat.id), cat, ...rest]);
  };

  const clearAll = async () => {
    buzz(12);
    for (const c of pinned) await s.update("categories", c.id, { quick: false });
    toast("Back to showing your most recent categories");
  };

  return (
    <div className="vy-screen push-enter">
      <Nav title="Quick picks" onBack={nav.pop}
        right={pinned.length ? (
          <button className="vy-iconbtn" aria-label="Reset" onClick={clearAll}><RotateCcw size={17} /></button>
        ) : null} />

      <div className="vy-pad">
        <Seg value={dir} onChange={setDir}
          options={[{ v: "Expense", l: "Expense" }, { v: "Income", l: "Income" }]} />
      </div>

      <div className="vy-body">
        <div className="vy-pad">
          <div className="vy-note" style={{ marginTop: 12 }}>
            {pinned.length
              ? "These appear on the add screen in this order. Use the arrows to rearrange them."
              : "Nothing pinned yet, so the add screen shows whatever you used most recently. Star a few below to fix the order."}
          </div>

          {all.length === 0 ? (
            <Empty icon={<Layers size={24} />} title={`No ${dir.toLowerCase()} categories`}
              body="Add some categories first and they'll show up here." cta="Go to categories" onCta={() => nav.push("categories")} />
          ) : (
            <>
              {pinned.length > 0 && (
                <>
                  <div className="vy-sec"><h3>On the add screen</h3><span className="vy-sub">{pinned.length} pinned</span></div>
                  <div className="vy-group">
                    {pinned.map((c, i) => (
                      <div key={c.id} className="vy-row" style={{ cursor: "default" }}>
                        <div className="vy-row-ic" style={{ background: tint(c.color), color: c.color }}>
                          <Ic n={c.icon} size={18} />
                        </div>
                        <div className="vy-row-m"><b>{c.name}</b><span>position {i + 1}</span></div>
                        <button className="vy-iconbtn" aria-label="Move up" disabled={i === 0}
                          style={{ opacity: i === 0 ? 0.3 : 1, background: "var(--surface2)" }}
                          onClick={() => move(i, -1)}><ChevronUp size={17} /></button>
                        <button className="vy-iconbtn" aria-label="Move down" disabled={i === pinned.length - 1}
                          style={{ opacity: i === pinned.length - 1 ? 0.3 : 1, background: "var(--surface2)", marginLeft: 6 }}
                          onClick={() => move(i, 1)}><ChevronDown size={17} /></button>
                        <button className="vy-iconbtn" aria-label="Unpin" style={{ marginLeft: 6, color: "var(--accent)" }}
                          onClick={() => unpin(c)}><Star size={17} fill="currentColor" /></button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {rest.length > 0 && (
                <>
                  <div className="vy-sec"><h3>{pinned.length ? "Everything else" : "Your categories"}</h3></div>
                  <div className="vy-group">
                    {rest.map((c) => (
                      <div key={c.id} className="vy-row" onClick={() => pin(c)}>
                        <div className="vy-row-ic" style={{ background: tint(c.color), color: c.color }}>
                          <Ic n={c.icon} size={18} />
                        </div>
                        <div className="vy-row-m"><b>{c.name}</b><span>{c.group || "—"}</span></div>
                        <Star size={17} style={{ color: "var(--muted)" }} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <div className="vy-tabspace" />
      </div>
    </div>
  );
}
