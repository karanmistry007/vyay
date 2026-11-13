import React, { useMemo, useState, useRef } from "react";
import {
  Eye, EyeOff, Bell, ChevronDown, ChevronRight, RefreshCw, AlertCircle, Users, Wallet,
  Plus, ArrowLeftRight, Target, Handshake, Sparkles, TrendingUp, TrendingDown,
} from "lucide-react";
import TxnRow from "../components/TxnRow.jsx";
import { Ring, Empty, AnimatedNumber, useToast } from "../components/ui.jsx";
import { Ic, ACCOUNT_ICON } from "../lib/icons.jsx";
import { tint } from "../lib/color.js";
import { fmt, buzz, clamp, sum, thisMonth, monthKey, addMonths, monthLabel, daysInMonth, MON } from "../lib/money.js";
import { spentIn, earnedIn, personBalances } from "../lib/ledger.js";

export default function Home({ s, nav }) {
  const toast = useToast();
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pull = useRef(0);
  const priv = s.settings.privacy;
  const cur = s.currency;
  const mk = thisMonth();

  const spent = spentIn(s.ledger, mk);
  const earned = earnedIn(s.ledger, mk);
  const netWorth = sum(s.activeAccounts.filter((a) => a.includeNet !== false).map((a) => s.balances[a.id] || 0));
  const rate = earned > 0 ? clamp((earned - spent) / earned, 0, 1) : 0;

  const dim = daysInMonth(mk);
  const dayNo = new Date().getDate();
  const budgetTotal = sum(s.budgets.map((b) => b.amount));
  const budgetSpent = sum(s.budgets.map((b) =>
    -sum(s.ledger.filter((r) => r.cat === b.cat && monthKey(r.date) === mk && r.kind === "Expense" && !r.ex).map((r) => r.amount))));
  const safeToday = budgetTotal > 0 ? Math.max(0, (budgetTotal - budgetSpent) / Math.max(1, dim - dayNo + 1)) : 0;

  const last6 = useMemo(() => {
    const out = [];
    for (let i = 5; i >= 0; i--) {
      const k = addMonths(mk, -i);
      out.push({ k, label: monthLabel(k), out: spentIn(s.ledger, k) });
    }
    return out;
  }, [s.ledger, mk]);
  const maxOut = Math.max(...last6.map((m) => m.out), 1);

  const topCats = useMemo(() => {
    const m = {};
    s.ledger.filter((r) => monthKey(r.date) === mk && r.kind === "Expense" && !r.ex)
      .forEach((r) => { m[r.cat] = (m[r.cat] || 0) - r.amount; });
    return Object.entries(m).map(([k, v]) => ({ cat: s.catById[k], v })).filter((x) => x.cat)
      .sort((a, b) => b.v - a.v).slice(0, 4);
  }, [s.ledger, s.catById, mk]);

  const overBudget = s.budgets.map((b) => {
    const spentCat = -sum(s.ledger.filter((r) => r.cat === b.cat && monthKey(r.date) === mk && r.kind === "Expense" && !r.ex).map((r) => r.amount));
    return { b, spentCat, pct: b.amount ? spentCat / b.amount : 0 };
  }).filter((x) => x.pct >= 0.8).sort((a, b) => b.pct - a.pct);

  const balances = personBalances(s.txns, s.peopleEntries);
  const owedToYou = sum(Object.values(balances).filter((v) => v > 0));
  const youOwe = -sum(Object.values(balances).filter((v) => v < 0));
  const upcoming = s.recurring
    .map((r) => ({ ...r, dd: r.day >= dayNo ? r.day - dayNo : r.day + dim - dayNo }))
    .sort((a, b) => a.dd - b.dd).slice(0, 3);

  const onStart = (e) => { pull.current = e.currentTarget.scrollTop === 0 ? e.touches[0].clientY : 0; };
  const onMove = (e) => { if (!pull.current) return; const d = e.touches[0].clientY - pull.current; if (d > 0) setPullY(Math.min(70, d * 0.5)); };
  const onEnd = () => {
    if (pullY > 45) { buzz(12); setRefreshing(true); setTimeout(() => { setRefreshing(false); toast("Up to date"); }, 600); }
    setPullY(0); pull.current = 0;
  };

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const daysLeft = dim - dayNo + 1;
  const prevSpent = spentIn(s.ledger, addMonths(mk, -1));
  const delta = prevSpent ? (spent - prevSpent) / prevSpent : 0;

  const Tile = ({ icon, title, sub, onClick }) => (
    <button className="vy-tile" onClick={() => { buzz(6); onClick(); }}>
      <span className="ic">{icon}</span>
      <span><b>{title}</b><span>{sub}</span></span>
    </button>
  );

  const noAccounts = s.activeAccounts.length === 0;
  const noTxns = s.txns.length === 0;

  return (
    <div className="vy-screen fade-enter">
      <div className="vy-nav">
        <button className="vy-iconbtn" aria-label="Hide amounts" onClick={() => { buzz(5); s.setSetting("privacy", !priv); }}>
          {priv ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
        <button onClick={() => { buzz(6); nav.sheet("books"); }}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, minWidth: 0,
            background: "var(--surface)", border: 0, borderRadius: 999, padding: "9px 16px", cursor: "pointer",
            boxShadow: "var(--shadow-soft)", color: "var(--ink)", fontFamily: "inherit" }}>
          <span className="vy-row-ic lg" style={{ width: 26, height: 26, borderRadius: 8,
            background: tint((s.book ? s.book.color : "#0B0B0C")), color: s.book ? s.book.color : "var(--ink)" }}>
            <Ic n={s.book ? s.book.icon : "Wallet"} size={14} />
          </span>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.028em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {s.book ? s.book.name : "Vyay"}
          </span>
          <ChevronDown size={16} style={{ color: "var(--muted)", flex: "0 0 auto" }} />
        </button>
        <button className="vy-iconbtn" aria-label="Alerts" onClick={() => { buzz(5); nav.push("alerts"); }}>
          <Bell size={19} />
          {overBudget.length > 0 && <span style={{ position: "absolute", marginLeft: 18, marginTop: -16, width: 9, height: 9, borderRadius: 9, background: "var(--out)" }} />}
        </button>
      </div>

      <div className="vy-body" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
        <div className="vy-ptr" style={{ height: refreshing ? 44 : pullY }}>
          <RefreshCw size={17} style={{ transform: `rotate(${pullY * 5}deg)`, opacity: refreshing ? 1 : pullY / 45 }} />
        </div>

        <div className="vy-pad">
          {noAccounts ? (
            <Empty icon={<Wallet size={24} />} title="Add your first account"
              body="Vyay needs somewhere for money to sit before you can log anything. A bank, a wallet, or just cash."
              cta="Add an account" onCta={() => nav.push("accounts")} />
          ) : (
            <>
              <div className="vy-hero">
                <div className="vy-lbl">Spent in {MON[+mk.slice(5, 7) - 1]}</div>
                <AnimatedNumber value={spent} format={(v) => fmt(v, { currency: cur })}
                  className={"vy-hero-amt" + (priv ? " vy-blur" : "")} style={{ marginTop: 10, display: "block" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10 }}>
                  {prevSpent > 0 && (
                    <span className="vy-pill" style={{
                      background: delta > 0 ? "var(--out-soft)" : "var(--in-soft)",
                      color: delta > 0 ? "var(--out)" : "var(--in)" }}>
                      {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {Math.abs(Math.round(delta * 100))}%
                    </span>
                  )}
                  <span className="vy-sub">
                    {prevSpent > 0 ? `vs ${MON[+addMonths(mk, -1).slice(5, 7) - 1]}` : "first month of records"}
                    {daysLeft > 0 ? ` · ${daysLeft} days left` : ""}
                  </span>
                </div>
                {budgetTotal > 0 && (
                  <>
                    <div className="vy-bar" style={{ marginTop: 18 }}>
                      <i style={{ width: `${clamp(budgetSpent / budgetTotal, 0, 1) * 100}%`,
                        background: budgetSpent > budgetTotal ? "var(--out)" : "var(--ink)" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9 }}>
                      <span className="vy-sub">
                        <b className={priv ? "vy-blur" : ""} style={{ color: "var(--ink)", fontWeight: 800 }}>{fmt(safeToday, { currency: cur })}</b> safe today
                      </span>
                      <span className="vy-sub vy-num">{Math.round((budgetSpent / budgetTotal) * 100)}% of budget</span>
                    </div>
                  </>
                )}
                {!noTxns && (
                  <div style={{ marginTop: 20 }}>
                    <div className="vy-spark">
                      {last6.map((m, i) => <i key={m.k} className={i === 5 ? "on" : ""} style={{ height: `${clamp((m.out / maxOut) * 100, 7, 100)}%` }} />)}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                      {last6.map((m) => <span key={m.k} style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", flex: 1, textAlign: "center" }}>{m.label.slice(0, 3)}</span>)}
                    </div>
                  </div>
                )}
              </div>

              <div className="vy-stat" style={{ marginTop: 12 }}>
                <div>
                  <span className="vy-lbl">Net worth</span>
                  <b className={priv ? "vy-blur" : ""}>{fmt(netWorth, { currency: cur, compact: true })}</b>
                </div>
                <div>
                  <span className="vy-lbl">Earned</span>
                  <b className={priv ? "vy-blur" : ""} style={{ color: "var(--in)" }}>{fmt(earned, { currency: cur, compact: true })}</b>
                </div>
                <div>
                  <span className="vy-lbl">Saved</span>
                  <b className={priv ? "vy-blur" : ""}>{fmt(earned - spent, { currency: cur, compact: true })}</b>
                </div>
              </div>

              <div className="vy-tiles" style={{ marginTop: 12 }}>
                <Tile icon={<Plus size={21} />} title="Add spend" sub="Log it in seconds"
                  onClick={() => nav.push("add", { type: "Expense" })} />
                <Tile icon={<ArrowLeftRight size={19} />} title="Transfer" sub="Between accounts"
                  onClick={() => nav.push("add", { type: "Transfer" })} />
                <Tile icon={<Target size={19} />} title="Budgets" sub={budgetTotal ? `${Math.round((budgetSpent / budgetTotal) * 100)}% used` : "Set a cap"} onClick={() => nav.push("budgets")} />
                <Tile icon={<Handshake size={19} />} title="Settle up"
                  sub={owedToYou || youOwe ? (owedToYou >= youOwe ? `${fmt(owedToYou, { currency: cur, compact: true })} owed to you` : `${fmt(youOwe, { currency: cur, compact: true })} to pay`) : "All square"}
                  onClick={() => nav.push("settle")} />
              </div>

              {overBudget.slice(0, 2).map(({ b, spentCat, pct }) => {
                const c = s.catById[b.cat];
                const over = pct > 1;
                return (
                  <div key={b.id} className="vy-card" onClick={() => nav.push("budgets")}
                    style={{ marginTop: 10, padding: 13, display: "flex", gap: 11, alignItems: "center", borderColor: over ? "var(--out)" : "var(--line)" }}>
                    <div className="vy-row-ic" style={{ background: over ? "var(--out-soft)" : "var(--accent-soft)", color: over ? "var(--out)" : "var(--accent)" }}>
                      <AlertCircle size={18} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <b style={{ fontSize: 14, fontWeight: 590 }}>{c ? c.name : "Budget"} {over ? "is over budget" : "is nearly spent"}</b>
                      <div className="vy-sub" style={{ marginTop: 2 }}>
                        <span className={priv ? "vy-blur" : ""}>{fmt(spentCat, { currency: cur })} of {fmt(b.amount, { currency: cur })}</span> · {Math.round(pct * 100)}%
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="vy-sec"><h3>Accounts</h3><button className="vy-link" onClick={() => nav.push("accounts")}>Manage</button></div>
              <div style={{ display: "flex", gap: 10, overflowX: "auto", margin: "0 -18px", padding: "0 18px 4px" }}>
                {s.activeAccounts.map((a) => (
                  <div key={a.id} className="vy-card" style={{ flex: "0 0 auto", width: 152, padding: 14, cursor: "pointer" }}
                    onClick={() => { buzz(5); nav.push("account", { id: a.id }); }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div className="vy-row-ic lg" style={{ width: 32, height: 32, borderRadius: 10, background: tint((a.color || "#4A5BE8")), color: a.color || "#4A5BE8" }}>
                        <Ic n={ACCOUNT_ICON[a.type] || "Wallet"} size={16} />
                      </div>
                      {a.last4 && <span style={{ fontSize: 11, color: "var(--muted)" }} className="vy-num">••{String(a.last4).slice(-2)}</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                    <div className={"vy-num" + (priv ? " vy-blur" : "")} style={{ fontSize: 17, marginTop: 3, color: (s.balances[a.id] || 0) < 0 ? "var(--out)" : "var(--ink)" }}>
                      {fmt(s.balances[a.id] || 0, { currency: cur, compact: true })}
                    </div>
                  </div>
                ))}
              </div>

              {noTxns ? (
                <div style={{ marginTop: 8 }}>
                  <Empty icon={<Sparkles size={24} />} title="Log your first spend"
                    body={s.categories.length === 0
                      ? "Set up a few categories first, then tap the plus button to record where your money went."
                      : "Tap the plus button and put in what you spent. Reports fill in as you go."}
                    cta={s.categories.length === 0 ? "Set up categories" : "Add a transaction"}
                    onCta={() => nav.push(s.categories.length === 0 ? "categories" : "add")} />
                </div>
              ) : (
                <>
                  {topCats.length > 0 && (
                    <>
                      <div className="vy-sec"><h3>Where it went this month</h3><button className="vy-link" onClick={() => nav.tab("reports")}>Reports</button></div>
                      <div className="vy-card" style={{ padding: 16 }}>
                        {topCats.map((x, i) => (
                          <div key={x.cat.id} style={{ marginTop: i ? 14 : 0 }} onClick={() => nav.push("category", { id: x.cat.id })}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                              <Ic n={x.cat.icon} size={14} style={{ color: x.cat.color }} />
                              <span style={{ fontSize: 13.5, fontWeight: 550, flex: 1 }}>{x.cat.name}</span>
                              <span className={"vy-num" + (priv ? " vy-blur" : "")} style={{ fontSize: 13.5 }}>{fmt(x.v, { currency: cur })}</span>
                            </div>
                            <div className="vy-bar"><i style={{ width: `${(x.v / topCats[0].v) * 100}%`, background: x.cat.color }} /></div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

              {(owedToYou > 0 || youOwe > 0) && (
                    <div className="vy-card" style={{ marginTop: 12, padding: 15, display: "flex", alignItems: "center", gap: 12 }}
                      onClick={() => nav.push("settle")}>
                      <div className="vy-row-ic" style={{
                        background: owedToYou >= youOwe ? "var(--in-soft)" : "var(--out-soft)",
                        color: owedToYou >= youOwe ? "var(--in)" : "var(--out)",
                      }}><Users size={18} /></div>
                      <div style={{ flex: 1 }}>
                        <b style={{ fontSize: 14.5, fontWeight: 590 }}>
                          {owedToYou > 0 && <>You're owed <span className={priv ? "vy-blur" : ""}>{fmt(owedToYou, { currency: cur })}</span></>}
                          {owedToYou > 0 && youOwe > 0 && " · "}
                          {youOwe > 0 && <>You owe <span className={priv ? "vy-blur" : ""}>{fmt(youOwe, { currency: cur })}</span></>}
                        </b>
                        <div className="vy-sub" style={{ marginTop: 2 }}>Tap to settle up</div>
                      </div>
                      <ChevronRight size={18} style={{ color: "var(--muted)" }} />
                    </div>
                  )}

                  {upcoming.length > 0 && (
                    <>
                      <div className="vy-sec"><h3>Coming up</h3><button className="vy-link" onClick={() => nav.push("recurring")}>All</button></div>
                      <div className="vy-group">
                        {upcoming.map((r) => {
                          const c = s.catById[r.cat];
                          return (
                            <div key={r.id} className="vy-row" onClick={() => nav.push("recurring")}>
                              <div className="vy-row-ic" style={{ background: tint((c ? c.color : "#8A8D9C")), color: c ? c.color : "var(--muted)" }}>
                                <Ic n={c ? c.icon : "Repeat"} size={18} />
                              </div>
                              <div className="vy-row-m">
                                <b>{r.name}</b>
                                <span>{r.dd === 0 ? "Due today" : `in ${r.dd} day${r.dd > 1 ? "s" : ""}`} · {r.auto ? "auto-pays" : "needs confirming"}</span>
                              </div>
                              <div className="vy-row-a"><b className={priv ? "vy-blur" : ""}>{fmt(r.amount, { currency: cur })}</b></div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <div className="vy-sec"><h3>Recent</h3><button className="vy-link" onClick={() => nav.tab("txns")}>See all</button></div>
                  <div className="vy-group">
                    {s.txns.slice(0, 6).map((t) => <TxnRow key={t.id} t={t} s={s} onClick={() => nav.push("txn", { id: t.id })} />)}
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
