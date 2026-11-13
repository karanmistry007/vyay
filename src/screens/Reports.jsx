import React, { useMemo, useState } from "react";
import {
  ChevronLeft, ChevronRight, ChevronDown, Share, BarChart3, TrendingUp, TrendingDown, Minus,
  Lightbulb, CalendarDays, Receipt, Check,
} from "lucide-react";
import { Nav, Empty, Seg, Sheet, AnimatedNumber, useToast } from "../components/ui.jsx";
import { Donut, SeriesBars, FlowChart, DayBars } from "../components/charts.jsx";
import TxnRow from "../components/TxnRow.jsx";
import { Ic } from "../lib/icons.jsx";
import { tint } from "../lib/color.js";
import { fmt, buzz, sum, isoToday, MON, DAYS } from "../lib/money.js";
import {
  PERIODS, buildRange, stepRange, canStepForward, summarise, breakdown, series, weekdays,
  calendar, insights, topSpends, availableYears, monthsWithActivity,
} from "../lib/analytics.js";
import { exportTransactionsCSV } from "../lib/exporter.js";

const DIMENSIONS = [
  ["cats", "Categories", "Tag"],
  ["merchants", "Merchants", "Building2"],
  ["methods", "Payment", "CreditCard"],
  ["accounts", "Accounts", "Wallet"],
  ["tags", "Tags", "Tag"],
];

function Change({ value, size = "sm" }) {
  if (value === null || value === undefined || !isFinite(value)) {
    return <span className="vy-sub" style={{ fontSize: size === "sm" ? 12 : 13 }}>—</span>;
  }
  const up = value > 0;
  const Icon = Math.abs(value) < 0.005 ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span className="vy-pill" style={{
      background: tint(up ? "var(--out)" : "var(--in)"),
      color: up ? "var(--out)" : "var(--in)",
      fontSize: size === "sm" ? 11.5 : 12.5,
    }}>
      <Icon size={size === "sm" ? 11 : 12} />{Math.abs(Math.round(value * 100))}%
    </span>
  );
}

/**
 * Where you were last looking.
 *
 * Pushing a screen unmounts this one, so drilling into a list and coming back
 * used to dump you on the current month with the breakdown reset. Holding it
 * outside the component keeps your place across that, and across tab switches.
 */
const lastView = { periodType: "month", anchor: null, dim: "cats", flow: "Expense" };

export default function Reports({ s, nav }) {
  const toast = useToast();
  const [periodType, setPeriodTypeState] = useState(lastView.periodType);
  const [anchor, setAnchorState] = useState(lastView.anchor || isoToday());
  const [dim, setDimState] = useState(lastView.dim);
  const [flow, setFlowState] = useState(lastView.flow);

  const setPeriodType = (v) => { lastView.periodType = v; setPeriodTypeState(v); };
  const setAnchor = (v) => { lastView.anchor = v; setAnchorState(v); };
  const setDim = (v) => { lastView.dim = v; setDimState(v); };
  const setFlow = (v) => { lastView.flow = v; setFlowState(v); };
  const [picking, setPicking] = useState(false);
  const priv = s.settings.privacy;
  const cur = s.currency;
  const inbound = flow === "Income";

  const range = useMemo(() => buildRange(periodType, anchor, s.txns), [periodType, anchor, s.txns]);
  const stats = useMemo(() => summarise(s.ledger, s.txns, range), [s.ledger, s.txns, range]);
  const chart = useMemo(() => series(s.ledger, range), [s.ledger, range]);
  const week = useMemo(() => weekdays(s.ledger, range), [s.ledger, range]);
  const notes = useMemo(
    () => insights(s.ledger, s.txns, range, { catById: s.catById, retById: s.retById, tagById: s.tagById }),
    [s.ledger, s.txns, range, s.catById, s.retById, s.tagById]
  );
  const cal = useMemo(() => (range.type === "month" ? calendar(s.ledger, range) : null), [s.ledger, range]);

  const opts = { kind: flow };
  const byCat = useMemo(() => breakdown(s.ledger, range, (r) => r.cat, s.catById, opts), [s.ledger, range, s.catById, flow]);
  const lists = {
    cats: byCat,
    merchants: useMemo(() => breakdown(s.ledger, range, (r) => r.ret, s.retById, opts), [s.ledger, range, s.retById, flow]),
    methods: useMemo(() => breakdown(s.ledger, range, (r) => r.method, s.methById, opts), [s.ledger, range, s.methById, flow]),
    accounts: useMemo(() => breakdown(s.ledger, range, (r) => r.account, s.accById, opts), [s.ledger, range, s.accById, flow]),
    tags: useMemo(() => breakdown(s.ledger, range, (r) => r.tags, s.tagById, { ...opts, multi: true }), [s.ledger, range, s.tagById, flow]),
  };
  const list = lists[dim];
  const flowTotal = inbound ? stats.earned : stats.spent;

  const pie = byCat.slice(0, 5).map((x) => ({
    name: x.item ? x.item.name : "Uncategorised", value: x.value, fill: x.item ? x.item.color : "#8E8E93",
  }));
  const rest = sum(byCat.slice(5).map((x) => x.value));
  if (rest > 0) pie.push({ name: "Everything else", value: rest, fill: "#C4C4C8" });

  /** Every figure on this page is a sum of something, so every figure opens its list. */
  const openList = (extra, title) => {
    buzz(6);
    nav.push("txnList", { rangeType: periodType, anchor: range.anchor, title, ...extra });
  };

  const step = (delta) => { buzz(5); setAnchor(stepRange(range, delta, s.txns).anchor); };
  const switchPeriod = (type) => { buzz(5); setPeriodType(type); if (type === "all") setAnchor(isoToday()); };

  const years = useMemo(() => availableYears(s.txns), [s.txns]);
  const pickYear = anchor.slice(0, 4);
  const activeMonths = useMemo(() => monthsWithActivity(s.txns, pickYear), [s.txns, pickYear]);

  if (s.txns.length === 0) {
    return (
      <div className="vy-screen fade-enter">
        <Nav title="Reports" />
        <div className="vy-body"><div className="vy-pad">
          <Empty icon={<BarChart3 size={26} />} title="Reports need data"
            body="Log a few transactions and this fills in: where the money went, how the months compare, your heaviest day of the week, and what changed."
            cta="Add a transaction" onCta={() => nav.push("add")} />
        </div></div>
      </div>
    );
  }

  const emptyPeriod = stats.spent === 0 && stats.earned === 0;

  return (
    <div className="vy-screen fade-enter">
      <div className="vy-nav">
        {range.type === "all"
          ? <span style={{ width: 44 }} />
          : <button className="vy-iconbtn" aria-label="Earlier" onClick={() => step(-1)}><ChevronLeft size={19} /></button>}

        <button onClick={() => { buzz(5); setPicking(true); }}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            background: "none", border: 0, cursor: "pointer", color: "var(--ink)", fontFamily: "inherit",
            fontSize: 19, fontWeight: 800, letterSpacing: "-.03em" }}>
          {range.label}
          <ChevronDown size={17} style={{ color: "var(--muted)" }} />
        </button>

        {range.type !== "all" && canStepForward(range)
          ? <button className="vy-iconbtn" aria-label="Later" onClick={() => step(1)}><ChevronRight size={19} /></button>
          : (
            <button className="vy-iconbtn" aria-label="Export this period" onClick={() => {
              buzz(8);
              const n = exportTransactionsCSV(s.state, s.activeBook, range);
              toast(n ? `Exported ${n} rows from ${range.label}` : "Nothing to export in this period");
            }}><Share size={18} /></button>
          )}
      </div>

      <div className="vy-pad">
        <Seg value={periodType} onChange={switchPeriod} options={PERIODS} />
      </div>

      <div className="vy-body vy-fade-top">
        <div className="vy-pad">
          {/* headline, tappable like everything else */}
          <div className="vy-hero tappable" style={{ marginTop: 14, cursor: "pointer" }}
            onClick={() => openList({ kind: "Expense" }, `Spending · ${range.label}`)}>
            <div className="vy-lbl">Spent {range.type === "all" ? "in total" : `in ${range.label}`}</div>
            <AnimatedNumber value={stats.spent} format={(v) => fmt(v, { currency: cur })}
              className={"vy-hero-amt" + (priv ? " vy-blur" : "")} style={{ marginTop: 10, display: "block" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {range.prev && <Change value={stats.change} size="lg" />}
              <span className="vy-sub">
                {range.prev ? `vs ${range.prev.label} · ` : ""}{fmt(stats.perDay, { currency: cur })} a day
              </span>
            </div>
          </div>

          <div className="vy-stat" style={{ marginTop: 12 }}>
            <div onClick={() => openList({ kind: "Income" }, `Income · ${range.label}`)} style={{ cursor: "pointer" }}>
              <span className="vy-lbl">Earned</span>
              <b className={priv ? "vy-blur" : ""} style={{ color: "var(--in)" }}>{fmt(stats.earned, { currency: cur, compact: true })}</b>
            </div>
            <div>
              <span className="vy-lbl">Saved</span>
              <b className={priv ? "vy-blur" : ""} style={{ color: stats.saved < 0 ? "var(--out)" : "var(--ink)" }}>
                {fmt(stats.saved, { currency: cur, compact: true })}
              </b>
            </div>
            <div onClick={() => openList({ kind: "All" }, `Everything · ${range.label}`)} style={{ cursor: "pointer" }}>
              <span className="vy-lbl">{stats.savingsRate === null ? "Entries" : "Saved %"}</span>
              <b>{stats.savingsRate === null ? stats.entries : `${Math.round(stats.savingsRate * 100)}%`}</b>
            </div>
          </div>

          {emptyPeriod ? (
            <Empty icon={<CalendarDays size={26} />} title={`Nothing in ${range.label}`}
              body={range.type === "all" ? "No transactions recorded yet." : "Pick another period, or switch to a wider view."}
              cta="Choose a period" onCta={() => setPicking(true)} />
          ) : (
            <>
              <div className="vy-sec">
                <h3>{range.bucket === "day" ? "Day by day" : range.bucket === "month" ? "Month by month" : "Year by year"}</h3>
                {chart.length > 1 && (() => {
                  const peak = chart.reduce((a, b) => (b.spent > a.spent ? b : a));
                  if (!peak.spent) return null;
                  return <span className="vy-sub">
                    busiest {range.bucket === "day" ? `${peak.name} ${range.shortLabel}` : peak.name}
                  </span>;
                })()}
              </div>
              <div className="vy-card" style={{ padding: 20 }}>
                {range.bucket === "day" ? (
                  <SeriesBars
                    data={chart.map((b) => ({
                      key: b.key, name: b.name, v: b.spent,
                      highlight: b.spent === Math.max(...chart.map((x) => x.spent)) && b.spent > 0,
                    }))}
                    currency={cur} height={190} />
                ) : (
                  <FlowChart data={chart} height={210} />
                )}
              </div>

              {notes.length > 0 && (
                <>
                  <div className="vy-sec"><h3>Worth noticing</h3></div>
                  <div className="vy-group">
                    {notes.map((n, i) => {
                      const hue = n.color || (n.tone === "good" ? "var(--in)" : n.tone === "warn" ? "var(--warn)" : "var(--accent)");
                      return (
                        <div key={i} className="vy-row" style={{ cursor: "default" }}>
                          <div className="vy-row-ic" style={{ background: tint(hue), color: hue }}><Lightbulb size={18} /></div>
                          <div className="vy-row-m">
                            <b style={{ whiteSpace: "normal" }}>{n.title}</b>
                            <span>{n.detail}</span>
                          </div>
                          {n.value !== undefined && (
                            <div className="vy-row-a">
                              <b className={priv ? "vy-blur" : ""}>{fmt(n.value, { currency: cur, compact: true })}</b>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* spending or income, the same analysis either way */}
              <div className="vy-sec">
                <h3>{inbound ? "Where it came from" : "Where it went"}</h3>
                {range.prev && <span className="vy-sub">vs {range.prev.label}</span>}
              </div>
              <div className="vy-pad" style={{ padding: 0, marginBottom: 14 }}>
                <Seg value={flow} onChange={(v) => { buzz(5); setFlow(v); }}
                  options={[{ v: "Expense", l: "Spending" }, { v: "Income", l: "Income" }]} />
              </div>

              {byCat.length > 0 && (
                <div className="vy-card" style={{ padding: 20, marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                    <Donut data={pie} size={124} thickness={26} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {pie.map((p) => (
                        <div key={p.name} className="vy-legend">
                          <i style={{ background: p.fill }} /><b>{p.name}</b>
                          <span>{Math.round((p.value / Math.max(flowTotal, 1)) * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="vy-chips" style={{ margin: "0 -18px", padding: "0 18px 4px" }}>
                {DIMENSIONS.map(([v, l]) => (
                  <button key={v} className={"vy-chip" + (dim === v ? " on" : "")} onClick={() => { buzz(5); setDim(v); }}>{l}</button>
                ))}
              </div>
              {list.length === 0 ? (
                <div className="vy-card" style={{ padding: 22, textAlign: "center", marginTop: 12 }}>
                  <span className="vy-sub">No {inbound ? "income" : "spending"} recorded against this in {range.label}.</span>
                </div>
              ) : (
                <div className="vy-group" style={{ marginTop: 12 }}>
                  {list.slice(0, 25).map((x) => {
                    const colour = (x.item && x.item.color) || "#8E8E93";
                    const fallbackIcon = DIMENSIONS.find(([v]) => v === dim)[2];
                    const name = x.item ? x.item.name
                      : dim === "tags" ? "Untagged" : dim === "accounts" ? "Paid by someone else" : "Not set";
                    return (
                      <div key={x.key} className="vy-row"
                        onClick={() => openList({ kind: flow, dim, key: x.key }, `${name} · ${range.label}`)}>
                        <div className="vy-row-ic" style={{ background: tint(colour), color: colour }}>
                          <Ic n={(x.item && x.item.icon) || fallbackIcon} size={18} />
                        </div>
                        <div className="vy-row-m">
                          <b>{name}</b>
                          <div className="vy-bar" style={{ marginTop: 7, height: 6 }}>
                            <i style={{ width: `${(x.value / list[0].value) * 100}%`, background: colour }} />
                          </div>
                        </div>
                        <div className="vy-row-a">
                          <b className={priv ? "vy-blur" : ""}>{fmt(x.value, { currency: cur, compact: true })}</b>
                          <span style={{ display: "flex", justifyContent: "flex-end", gap: 6, alignItems: "center", marginTop: 3 }}>
                            {Math.round(x.share * 100)}%
                            {range.prev && <Change value={x.change} />}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="vy-sec"><h3>Which days cost most</h3></div>
              <div className="vy-card" style={{ padding: 20 }}>
                <DayBars data={week} currency={cur} height={190} />
              </div>

              {cal && (
                <>
                  <div className="vy-sec"><h3>Every day</h3><span className="vy-sub">{cal.spentDays} active</span></div>
                  <div className="vy-card" style={{ padding: 20 }}>
                    <div className="vy-heat" style={{ marginBottom: 7 }}>
                      {DAYS.map((d, i) => (
                        <span key={i} style={{ textAlign: "center", fontSize: 10.5, color: "var(--muted)", fontWeight: 800 }}>{d[0]}</span>
                      ))}
                    </div>
                    <div className="vy-heat">
                      {Array.from({ length: cal.firstWeekday }).map((_, i) => <i key={"e" + i} style={{ background: "transparent" }} />)}
                      {Array.from({ length: cal.days }).map((_, i) => {
                        const v = cal.totals[i + 1] || 0;
                        return <i key={i} title={`${i + 1}: ${fmt(v, { currency: cur })}`}
                          style={{ background: v ? `rgba(232,134,60,${0.18 + (v / cal.max) * 0.8})` : "var(--surface2)" }} />;
                      })}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, gap: 14 }}>
                      <div>
                        <div className="vy-lbl">Heaviest day</div>
                        <b className="vy-num" style={{ fontSize: 16 }}>
                          {cal.busiest ? `${cal.busiest[0]} ${range.shortLabel} · ${fmt(cal.busiest[1], { currency: cur, compact: true })}` : "—"}
                        </b>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="vy-lbl">Quiet days</div>
                        <b className="vy-num" style={{ fontSize: 16 }}>{cal.quietDays}</b>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="vy-sec">
                <h3>Biggest single spends</h3>
                <button className="vy-link" onClick={() => openList({ kind: "Expense" }, `Spending · ${range.label}`)}>See all</button>
              </div>
              <div className="vy-group">
                {topSpends(s.txns, range, 6).map((t) => (
                  <TxnRow key={t.id} t={t} s={s} onClick={() => nav.push("txn", { id: t.id })} />
                ))}
              </div>

              <div className="vy-card tappable" style={{ marginTop: 12, padding: 16, display: "flex", gap: 13, alignItems: "center" }}
                onClick={() => {
                  buzz(8);
                  const n = exportTransactionsCSV(s.state, s.activeBook, range);
                  toast(n ? `Exported ${n} rows from ${range.label}` : "Nothing to export in this period");
                }}>
                <div className="vy-row-ic" style={{ background: tint("var(--accent)"), color: "var(--accent)" }}>
                  <Receipt size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "-.028em" }}>Export {range.label}</b>
                  <div className="vy-sub" style={{ marginTop: 2 }}>{stats.entries} transactions as a CSV</div>
                </div>
                <Share size={17} style={{ color: "var(--muted)" }} />
              </div>
            </>
          )}
        </div>
        <div className="vy-tabspace" />
      </div>

      {/* jump straight to any month or year instead of stepping there */}
      <Sheet open={picking} onClose={() => setPicking(false)} title="Choose a period">
        <Seg value={periodType} onChange={switchPeriod} options={PERIODS} />

        {periodType !== "all" && (
          <>
            <label className="vy-flabel">Year</label>
            <div className="vy-wrap">
              {years.map((y) => (
                <button key={y} className={"vy-chip" + (pickYear === y ? " on" : "")}
                  onClick={() => {
                    buzz(5);
                    const month = periodType === "month" ? anchor.slice(5, 7) : "01";
                    setAnchor(`${y}-${month}-01`);
                    if (periodType === "year") setPicking(false);
                  }}>{y}</button>
              ))}
            </div>
          </>
        )}

        {periodType === "month" && (
          <>
            <label className="vy-flabel">Month <span className="hint">dimmed months have nothing in them</span></label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 9 }}>
              {MON.map((m, i) => {
                const mm = String(i + 1).padStart(2, "0");
                const selected = anchor.slice(0, 7) === `${pickYear}-${mm}`;
                const has = activeMonths.has(i + 1);
                const future = `${pickYear}-${mm}` > isoToday().slice(0, 7);
                return (
                  <button key={m} className={"vy-chip" + (selected ? " on" : "")}
                    style={{ justifyContent: "center", opacity: has || selected ? 1 : future ? 0.3 : 0.5 }}
                    disabled={future}
                    onClick={() => { buzz(6); setAnchor(`${pickYear}-${mm}-01`); setPicking(false); }}>
                    {selected && <Check size={13} />}{m}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <button className="vy-btn soft" style={{ marginTop: 20 }}
          onClick={() => { buzz(6); setPeriodType("month"); setAnchor(isoToday()); setPicking(false); }}>
          Jump to this month
        </button>
      </Sheet>
    </div>
  );
}
