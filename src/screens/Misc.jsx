import React, { useMemo, useState } from "react";
import {
  Users, CheckCircle2, Bell, AlertCircle, Target, Repeat, Lock, Pencil, Wallet, Layers,
  ArrowRight, Tag as TagIcon, AlertCircle as AlertIcon,
} from "lucide-react";
import { Nav, Empty, Switch, Confirm, useToast } from "../components/ui.jsx";
import { Bars } from "../components/charts.jsx";
import TxnRow from "../components/TxnRow.jsx";
import { Ic, ACCOUNT_ICON } from "../lib/icons.jsx";
import { tint } from "../lib/color.js";
import { fmt, buzz, clamp, sum, thisMonth, monthKey, addMonths, monthLabel, daysInMonth, MON } from "../lib/money.js";
import { openBalances, personBalances, groupDebts } from "../lib/ledger.js";
import { findUnrecorded } from "../lib/settlements.js";

/* ── account detail ──────────────────────────────────────────────────────── */
export function AccountDetail({ s, nav, id }) {
  const a = s.accById[id];
  if (!a) return <div className="vy-screen push-enter"><Nav title="Not found" onBack={nav.pop} /></div>;
  const priv = s.settings.privacy;
  const cur = s.currency;
  const bal = s.balances[id] || 0;
  const mk = thisMonth();
  const rows = s.ledger.filter((r) => r.account === id && monthKey(r.date) === mk);
  const inM = sum(rows.filter((r) => r.amount > 0).map((r) => r.amount));
  const outM = -sum(rows.filter((r) => r.amount < 0).map((r) => r.amount));
  const used = a.limit ? Math.abs(Math.min(0, bal)) / a.limit : 0;
  const list = s.txns.filter((t) => t.account === id || t.to === id);

  return (
    <div className="vy-screen push-enter">
      <Nav title={a.name} onBack={nav.pop}
        right={<button className="vy-iconbtn" onClick={() => nav.push("accounts")} aria-label="Edit"><Pencil size={17} /></button>} />
      <div className="vy-body"><div className="vy-pad">
        <div className="vy-hero" style={{ borderColor: (a.color || "#4A5BE8") + "50" }}>
          <div className="vy-lbl">{a.type}{a.last4 ? ` ••••${a.last4}` : ""}</div>
          <div className={"vy-hero-amt" + (priv ? " vy-blur" : "")} style={{ marginTop: 6, color: bal < 0 ? "var(--out)" : "var(--ink)" }}>
            {fmt(bal, { currency: cur })}
          </div>
          {a.limit ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span className="vy-sub">{fmt(Math.abs(Math.min(0, bal)), { currency: cur })} of {fmt(a.limit, { currency: cur, compact: true })} used</span>
                <span className="vy-sub vy-num">{Math.round(used * 100)}%</span>
              </div>
              <div className="vy-bar"><i style={{ width: `${clamp(used, 0, 1) * 100}%`, background: used > 0.6 ? "var(--out)" : "var(--accent)" }} /></div>
              {(a.statementDay || a.dueDay) && (
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  {a.statementDay ? <div style={{ flex: 1 }}><div className="vy-lbl">Statement</div><b className="vy-num" style={{ fontSize: 14 }}>Day {a.statementDay}</b></div> : null}
                  {a.dueDay ? <div style={{ flex: 1 }}><div className="vy-lbl">Payment due</div><b className="vy-num" style={{ fontSize: 14, color: "var(--warn)" }}>Day {a.dueDay}</b></div> : null}
                </div>
              )}
            </div>
          ) : (
            <div className="vy-sub" style={{ marginTop: 10 }}>Opening balance {fmt(Number(a.opening) || 0, { currency: cur })}</div>
          )}
        </div>

        <div className="vy-stat" style={{ marginTop: 12 }}>
          <div><span className="vy-lbl">In this month</span><b className={priv ? "vy-blur" : ""} style={{ color: "var(--in)" }}>{fmt(inM, { currency: cur, compact: true })}</b></div>
          <div><span className="vy-lbl">Out this month</span><b className={priv ? "vy-blur" : ""}>{fmt(outM, { currency: cur, compact: true })}</b></div>
        </div>

        <div className="vy-sec"><h3>Activity</h3><span className="vy-sub">{list.length} entries</span></div>
        {list.length === 0
          ? <Empty icon={<Wallet size={24} />} title="Nothing yet" body="Transactions using this account will appear here." />
          : <div className="vy-group">{list.slice(0, 60).map((t) => <TxnRow key={t.id} t={t} s={s} onClick={() => nav.push("txn", { id: t.id })} />)}</div>}
      </div><div className="vy-tabspace" /></div>
    </div>
  );
}

/* ── category detail ─────────────────────────────────────────────────────── */
export function CategoryDetail({ s, nav, id }) {
  const c = s.catById[id];
  if (!c) return <div className="vy-screen push-enter"><Nav title="Not found" onBack={nav.pop} /></div>;
  const priv = s.settings.privacy;
  const cur = s.currency;
  const mine = s.txns.filter((t) => t.cat === id || (t.splits || []).some((x) => x.cat === id));

  const series = useMemo(() => {
    const out = [];
    for (let i = 5; i >= 0; i--) {
      const k = addMonths(thisMonth(), -i);
      out.push({
        name: monthLabel(k).slice(0, 3),
        v: -sum(s.ledger.filter((r) => r.cat === id && monthKey(r.date) === k && !r.ex).map((r) => r.amount)),
      });
    }
    return out;
  }, [s.ledger, id]);

  const current = series[series.length - 1].v;
  const prior = series.slice(0, -1).filter((x) => x.v > 0);
  const avg = prior.length ? sum(prior.map((x) => x.v)) / prior.length : 0;

  return (
    <div className="vy-screen push-enter">
      <Nav title={c.name} onBack={nav.pop} />
      <div className="vy-body"><div className="vy-pad">
        <div className="vy-hero">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="vy-row-ic lg" style={{ width: 44, height: 44, borderRadius: 15, background: tint(c.color), color: c.color }}>
              <Ic n={c.icon} size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="vy-lbl">This month</div>
              <div className={"vy-hero-amt" + (priv ? " vy-blur" : "")} style={{ fontSize: 30, marginTop: 3 }}>{fmt(current, { currency: cur })}</div>
            </div>
          </div>
          <div className="vy-sub" style={{ marginTop: 12 }}>
            {avg
              ? `${current > avg ? "Up" : "Down"} ${Math.abs(Math.round((current / avg - 1) * 100))}% against your average of ${fmt(avg, { currency: cur, compact: true })}.`
              : "Not enough history to compare yet."}
          </div>
          <div style={{ marginTop: 14 }}><Bars data={series} color={c.color} height={120} currency={cur} /></div>
        </div>
        <div className="vy-sec"><h3>{mine.length} transaction{mine.length === 1 ? "" : "s"}</h3></div>
        {mine.length === 0
          ? <Empty icon={<Layers size={24} />} title="Nothing yet" body="Spending in this category will show up here." />
          : <div className="vy-group">{mine.slice(0, 60).map((t) => <TxnRow key={t.id} t={t} s={s} onClick={() => nav.push("txn", { id: t.id })} />)}</div>}
      </div><div className="vy-tabspace" /></div>
    </div>
  );
}

/* ── settle up ───────────────────────────────────────────────────────────── */
export function Settle({ s, nav }) {
  const priv = s.settings.privacy;
  const cur = s.currency;
  const net = personBalances(s.txns, s.peopleEntries);
  const owedToYou = sum(s.people.map((p) => Math.max(0, net[p.id] || 0)));
  const youOwe = sum(s.people.map((p) => Math.max(0, -(net[p.id] || 0))));
  const overall = owedToYou - youOwe;
  const missing = findUnrecorded(s.txns, s.activeBook);
  const missingTotal = sum(missing.map((m) => m.amount));

  const Row = ({ p }) => {
    const bal = net[p.id] || 0;
    return (
      <div className="vy-row" onClick={() => { buzz(5); nav.push("person", { id: p.id }); }}>
        <div className="vy-row-ic" style={{ background: tint((p.color || "#4A5BE8")), color: p.color || "#4A5BE8", fontWeight: 700, fontSize: 15 }}>
          {p.name[0]}
        </div>
        <div className="vy-row-m">
          <b>{p.name}</b>
          <span>{bal === 0 ? "all settled" : bal > 0 ? "owes you" : "you owe them"}</span>
        </div>
        {bal === 0 ? <CheckCircle2 size={19} style={{ color: "var(--in)" }} /> : (
          <div className="vy-row-a">
            <b className={priv ? "vy-blur" : ""} style={{ color: bal > 0 ? "var(--in)" : "var(--out)" }}>
              {fmt(Math.abs(bal), { currency: cur })}
            </b>
          </div>
        )}
      </div>
    );
  };

  const owing = s.people.filter((p) => (net[p.id] || 0) > 0);
  const owed = s.people.filter((p) => (net[p.id] || 0) < 0);
  const square = s.people.filter((p) => !(net[p.id] || 0));

  return (
    <div className="vy-screen push-enter">
      <Nav title="Settle up" onBack={nav.pop}
        right={<button className="vy-iconbtn" aria-label="Add a person" onClick={() => nav.push("people")}><Users size={18} /></button>} />
      <div className="vy-body"><div className="vy-pad">
        {s.people.length === 0 ? (
          <Empty icon={<Users size={24} />} title="No people yet"
            body="Add the people you lend to, borrow from or split bills with, then track what's outstanding either way."
            cta="Add people" onCta={() => nav.push("people")} />
        ) : (
          <>
            {missing.length > 0 && (
              <div className="vy-card tappable" style={{ marginBottom: 12, padding: 16, display: "flex", gap: 13, alignItems: "center" }}
                onClick={() => { buzz(6); nav.push("settlementRepair"); }}>
                <div className="vy-row-ic" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
                  <AlertIcon size={19} />
                </div>
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "-.028em" }}>
                    {fmt(missingTotal, { currency: cur })} settled but never banked
                  </b>
                  <div className="vy-sub" style={{ marginTop: 3 }}>
                    Your account balances are short by this. Tap to record it.
                  </div>
                </div>
                <ArrowRight size={18} style={{ color: "var(--muted)" }} />
              </div>
            )}

            <div className="vy-hero">
              <div className="vy-lbl">{overall === 0 ? "Everything is square" : overall > 0 ? "Net, you're owed" : "Net, you owe"}</div>
              <div className={"vy-hero-amt" + (priv ? " vy-blur" : "")}
                style={{ marginTop: 6, color: overall === 0 ? "var(--ink)" : overall > 0 ? "var(--in)" : "var(--out)" }}>
                {fmt(Math.abs(overall), { currency: cur })}
              </div>
              {(owedToYou > 0 || youOwe > 0) && (
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div className="vy-lbl">Coming to you</div>
                    <b className={"vy-num" + (priv ? " vy-blur" : "")} style={{ fontSize: 17, color: "var(--in)" }}>
                      {fmt(owedToYou, { currency: cur, compact: true })}
                    </b>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="vy-lbl">You need to pay</div>
                    <b className={"vy-num" + (priv ? " vy-blur" : "")} style={{ fontSize: 17, color: "var(--out)" }}>
                      {fmt(youOwe, { currency: cur, compact: true })}
                    </b>
                  </div>
                </div>
              )}
            </div>

            {owing.length > 0 && (
              <>
                <div className="vy-sec"><h3>Owes you</h3></div>
                <div className="vy-group">{owing.map((p) => <Row key={p.id} p={p} />)}</div>
              </>
            )}

            {owed.length > 0 && (
              <>
                <div className="vy-sec"><h3>You owe</h3></div>
                <div className="vy-group">{owed.map((p) => <Row key={p.id} p={p} />)}</div>
              </>
            )}

            {square.length > 0 && (
              <>
                <div className="vy-sec"><h3>All square</h3></div>
                <div className="vy-group">{square.map((p) => <Row key={p.id} p={p} />)}</div>
              </>
            )}

            <GroupBalances s={s} />

            <div className="vy-note" style={{ marginTop: 16 }}>
              Tap anyone to record a new amount in either direction, or to settle what's between you.
            </div>
          </>
        )}
      </div><div className="vy-tabspace" /></div>
    </div>
  );
}

/* ── group balances: debts that do not run through you ──────────────────── */
function GroupBalances({ s }) {
  const [tag, setTag] = useState(null);
  const cur = s.currency;
  const priv = s.settings.privacy;
  const debts = groupDebts(s.txns, tag ? { tag } : {});
  const label = (id) => (id === "me" ? "You" : (s.personById[id] || {}).name || "Someone");
  const colour = (id) => (id === "me" ? "var(--accent)" : (s.personById[id] || {}).color || "#8A8D9C");

  const thirdParty = debts.filter((dd) => dd.from !== "me" && dd.to !== "me");
  if (!debts.length) return null;

  return (
    <>
      <div className="vy-sec">
        <h3>Everyone's balances</h3>
        {thirdParty.length > 0 && <span className="vy-sub">{thirdParty.length} not involving you</span>}
      </div>

      {s.tags.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button className={"vy-chip" + (!tag ? " on" : "")} onClick={() => { buzz(5); setTag(null); }}>Everything</button>
          {s.tags.map((tg) => (
            <button key={tg.id} className={"vy-chip" + (tag === tg.id ? " on" : "")} onClick={() => { buzz(5); setTag(tg.id); }}>
              <TagIcon size={12} style={{ color: tag === tg.id ? undefined : tg.color }} />{tg.name}
            </button>
          ))}
        </div>
      )}

      <div className="vy-group">
        {debts.map((dd, i) => (
          <div key={i} className="vy-row" style={{ cursor: "default" }}>
            <div className="vy-row-ic" style={{ background: tint(colour(dd.from)), color: colour(dd.from), fontWeight: 700, fontSize: 14 }}>
              {label(dd.from)[0]}
            </div>
            <div className="vy-row-m">
              <b style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {label(dd.from)} <ArrowRight size={13} style={{ color: "var(--muted)" }} /> {label(dd.to)}
              </b>
              <span>{dd.from === "me" || dd.to === "me" ? "on your balance" : "between them, not you"}</span>
            </div>
            <div className="vy-row-a">
              <b className={priv ? "vy-blur" : ""} style={{ color: dd.to === "me" ? "var(--in)" : dd.from === "me" ? "var(--out)" : "var(--ink2)" }}>
                {fmt(dd.amount, { currency: cur })}
              </b>
            </div>
          </div>
        ))}
      </div>
      {!debts.length && <div className="vy-sub" style={{ padding: 18, textAlign: "center" }}>Nothing outstanding in the group.</div>}
    </>
  );
}

/* ── alerts ──────────────────────────────────────────────────────────────── */
export function Alerts({ s, nav }) {
  const cur = s.currency;
  const mk = thisMonth();
  const day = new Date().getDate();
  const dim = daysInMonth(mk);
  const items = [];

  s.budgets.forEach((b) => {
    const c = s.catById[b.cat];
    if (!c) return;
    const spent = -sum(s.ledger.filter((r) => r.cat === b.cat && monthKey(r.date) === mk && r.kind === "Expense" && !r.ex).map((r) => r.amount));
    const pct = b.amount ? spent / b.amount : 0;
    if (pct >= 1) items.push({ ic: AlertCircle, tone: "out", t: `${c.name} is over budget`, s: `${fmt(spent, { currency: cur })} against ${fmt(b.amount, { currency: cur })}` });
    else if (pct >= 0.8) items.push({ ic: Target, tone: "warn", t: `${c.name} is at ${Math.round(pct * 100)}%`, s: `${fmt(b.amount - spent, { currency: cur })} left with ${dim - day} days to go` });
  });

  s.recurring.filter((r) => r.day >= day && r.day - day <= 3).forEach((r) =>
    items.push({ ic: Repeat, tone: "tr", t: `${r.name} is due in ${r.day - day} day${r.day - day === 1 ? "" : "s"}`, s: `${fmt(r.amount, { currency: cur })} from your account` }));

  const net = personBalances(s.txns, s.peopleEntries);
  const owedToYou = sum(Object.values(net).filter((v) => v > 0));
  const youOwe = -sum(Object.values(net).filter((v) => v < 0));
  if (owedToYou > 0) items.push({ ic: Users, tone: "in", t: "Someone still owes you", s: `${fmt(owedToYou, { currency: cur })} outstanding` });
  if (youOwe > 0) items.push({ ic: Users, tone: "out", t: "You owe someone", s: `${fmt(youOwe, { currency: cur })} still to pay` });

  const tones = {
    out: ["var(--out-soft)", "var(--out)"], warn: ["var(--accent-soft)", "var(--warn)"],
    tr: ["var(--tr-soft)", "var(--tr)"], in: ["var(--in-soft)", "var(--in)"],
  };

  return (
    <div className="vy-screen push-enter">
      <Nav title="Alerts" onBack={nav.pop} />
      <div className="vy-body"><div className="vy-pad">
        {items.length === 0 ? (
          <Empty icon={<Bell size={24} />} title="All quiet"
            body="Budget warnings, upcoming recurring payments and unsettled splits show up here." />
        ) : (
          <div className="vy-group" style={{ marginTop: 6 }}>
            {items.map((n, i) => {
              const I = n.ic;
              const [bg, fg] = tones[n.tone];
              return (
                <div key={i} className="vy-row" style={{ alignItems: "flex-start", cursor: "default" }}>
                  <div className="vy-row-ic" style={{ background: bg, color: fg }}><I size={18} /></div>
                  <div className="vy-row-m">
                    <b style={{ whiteSpace: "normal" }}>{n.t}</b>
                    <span style={{ whiteSpace: "normal" }}>{n.s}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div><div className="vy-tabspace" /></div>
    </div>
  );
}

/* ── app lock setup ──────────────────────────────────────────────────────── */
export function LockSetup({ s, nav }) {
  const toast = useToast();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const enable = async () => {
    if (pin.length !== 4) return toast("The PIN needs to be 4 digits.");
    if (pin !== confirmPin) return toast("Those two PINs don't match.");
    await s.setSetting("pin", pin);
    await s.setSetting("lock", true);
    buzz(16);
    toast("App lock is on");
    nav.pop();
  };

  const disable = async () => {
    await s.setSetting("lock", false);
    await s.setSetting("pin", "");
    toast("App lock is off");
    nav.pop();
  };

  return (
    <div className="vy-screen push-enter">
      <Nav title="App lock" onBack={nav.pop} />
      <div className="vy-body"><div className="vy-pad">
        <div className="vy-note" style={{ marginTop: 8 }}>
          The PIN is stored on this device along with your data. It keeps a casual look over your shoulder out, not a determined attacker.
        </div>
        {s.settings.lock ? (
          <>
            <div className="vy-card" style={{ padding: 16, marginTop: 14, display: "flex", gap: 12, alignItems: "center" }}>
              <div className="vy-row-ic" style={{ background: "var(--in-soft)", color: "var(--in)" }}><Lock size={18} /></div>
              <div style={{ flex: 1 }}><b style={{ fontSize: 14.5, fontWeight: 590 }}>App lock is on</b>
                <div className="vy-sub" style={{ marginTop: 2 }}>You'll be asked for the PIN each time Vyay opens.</div></div>
            </div>
            <button className="vy-btn danger" style={{ marginTop: 14 }} onClick={disable}>Turn app lock off</button>
          </>
        ) : (
          <>
            <div className="vy-form" style={{ marginTop: 16 }}>
              <div>
                <label>Choose a 4-digit PIN</label>
                <input className="vy-input" inputMode="numeric" type="password" maxLength={4} value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
              </div>
              <div>
                <label>Type it again</label>
                <input className="vy-input" inputMode="numeric" type="password" maxLength={4} value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
              </div>
            </div>
            <button className="vy-btn accent" style={{ marginTop: 18 }} onClick={enable}>Turn app lock on</button>
          </>
        )}
      </div><div className="vy-tabspace" /></div>
    </div>
  );
}

/* ── lock screen ─────────────────────────────────────────────────────────── */
export function LockScreen({ s, onUnlock }) {
  const [pin, setPin] = useState("");
  const [bad, setBad] = useState(false);

  const submit = (value) => {
    if (value === (s.settings.pin || "")) { buzz(18); onUnlock(); }
    else { buzz(30); setBad(true); setTimeout(() => { setBad(false); setPin(""); }, 500); }
  };

  return (
    <div className="vy-lock">
      <div className="vy-row-ic lg" style={{ width: 56, height: 56, borderRadius: 19, background: "var(--accent-soft)", color: "var(--accent)" }}>
        <Lock size={24} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div className="vy-h2" style={{ fontSize: 18 }}>Vyay is locked</div>
        <div className="vy-sub" style={{ marginTop: 3 }}>Enter your PIN</div>
      </div>
      <input className="vy-pinin" inputMode="numeric" type="password" autoFocus maxLength={4} value={pin}
        style={{ borderColor: bad ? "var(--out)" : undefined }}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 4);
          setPin(v);
          if (v.length === 4) setTimeout(() => submit(v), 80);
        }} />
      {bad && <div className="vy-sub" style={{ color: "var(--out)" }}>Wrong PIN, try again</div>}
      <button className="vy-btn accent" style={{ maxWidth: 200 }} disabled={pin.length < 4} onClick={() => submit(pin)}>Unlock</button>
    </div>
  );
}
