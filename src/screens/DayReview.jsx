import React, { useMemo, useState } from "react";
import { CalendarX2, BookOpen, Layers, Plus, BellRing } from "lucide-react";
import { permissionState, askPermission } from "../lib/notify.js";
import { Nav, Empty } from "../components/ui.jsx";
import TxnRow from "../components/TxnRow.jsx";
import { tint } from "../lib/color.js";
import { fmt, buzz, relDay, parseISO, MON, round2 } from "../lib/money.js";
import { daySummary } from "../lib/analytics.js";
import { digestMessage } from "../lib/digest.js";

/*
 * The recap is on by default, but the browser starts out asking, so until someone grants
 * it the recap only reaches them as a toast. This is where that toast leads, which makes
 * it the natural place to offer the real thing — inside a tap, as browsers require.
 */
function AllowCard({ s }) {
  const [perm, setPerm] = useState(permissionState);
  if (perm !== "default" || s.settings.dailyDigest === false) return null;
  return (
    <div className="vy-card tappable" style={{ marginTop: 12, padding: 13, display: "flex", gap: 11, alignItems: "center" }}
      onClick={async () => { buzz(6); setPerm(await askPermission()); }}>
      <div className="vy-row-ic" style={{ background: tint("var(--accent)"), color: "var(--accent)" }}><BellRing size={18} /></div>
      <div className="vy-row-m">
        <b style={{ whiteSpace: "normal" }}>Get this recap every morning</b>
        <span style={{ whiteSpace: "normal" }}>Allow notifications and it arrives just after midnight</span>
      </div>
    </div>
  );
}

/**
 * One day, as the daily recap described it.
 *
 * Tapping the notification lands here, so the figures must be the same ones the
 * notification quoted: they come from the same daySummary call, never recomputed on
 * screen. A day with nothing on it is the case the recap exists for, so the empty
 * state is an invitation to fill the day in, with the date already set.
 */
export default function DayReview({ s, nav, date }) {
  const priv = s.settings.privacy;
  const cur = s.currency;
  const money = (n) => fmt(n, { currency: cur });

  const day = useMemo(() => daySummary(s.ledger, s.txns, date, { catById: s.catById }), [s.ledger, s.txns, s.catById, date]);
  const rows = useMemo(() => s.txns.filter((t) => t.date === date), [s.txns, date]);
  const elsewhere = useMemo(() => s.state.txns.filter((t) => t.date === date && t.book !== s.activeBook).length,
    [s.state.txns, s.activeBook, date]);

  const d = parseISO(date);
  const longDate = `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
  const net = round2(day.earned - day.spent);

  if (!rows.length) {
    const message = digestMessage(day, { currency: cur, elsewhere, bookName: s.book ? s.book.name : "" });
    const otherBooks = message.kind === "elsewhere";
    return (
      <div className="vy-screen push-enter">
        <Nav title={relDay(date)} onBack={nav.pop} />
        <div className="vy-body"><div className="vy-pad">
          <Empty
            icon={otherBooks ? <BookOpen size={24} /> : <CalendarX2 size={24} />}
            title={message.title}
            body={message.body}
            cta={otherBooks ? "Switch book" : "Add a transaction"}
            onCta={() => (otherBooks ? nav.sheet("books") : nav.push("add", { date }))} />
          <AllowCard s={s} />
        </div><div className="vy-tabspace" /></div>
      </div>
    );
  }

  return (
    <div className="vy-screen push-enter">
      <Nav title={relDay(date)} onBack={nav.pop} />
      <div className="vy-body">
        <div className="vy-pad">
          <div className="vy-hero">
            <div className="vy-lbl">Spent · {longDate}</div>
            <div className={"vy-hero-amt" + (priv ? " vy-blur" : "")} style={{ marginTop: 10, fontSize: 40 }}>
              {money(day.spent)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 12 }}>
              {/* Neutral on purpose: the count covers income and transfers too, not just money out. */}
              <span className="vy-pill" style={{ background: tint("var(--muted)"), color: "var(--ink2)" }}>
                <Layers size={12} />{day.entries} {day.entries === 1 ? "entry" : "entries"}
              </span>
              {day.top && (
                <span className="vy-sub">
                  most on {day.top.name}, <span className={priv ? "vy-blur" : ""}>{money(day.top.amount)}</span>
                </span>
              )}
            </div>
          </div>

          <div className="vy-stat" style={{ marginTop: 12 }}>
            <div>
              <span className="vy-lbl">Received</span>
              <b className={priv ? "vy-blur" : ""} style={{ color: day.earned ? "var(--in)" : "var(--muted)" }}>{money(day.earned)}</b>
            </div>
            <div>
              <span className="vy-lbl">Moved</span>
              <b className={priv ? "vy-blur" : ""} style={{ color: day.moved ? "var(--tr)" : "var(--muted)" }}>{money(day.moved)}</b>
            </div>
            <div>
              <span className="vy-lbl">Net</span>
              <b className={priv ? "vy-blur" : ""}>{fmt(net, { currency: cur, sign: net !== 0 })}</b>
            </div>
          </div>

          <div className="vy-daylabel"><b>{relDay(date)}</b></div>
          <div className="vy-group">
            {rows.map((t) => (
              <TxnRow key={t.id} t={t} s={s} onClick={() => nav.push("txn", { id: t.id })} />
            ))}
          </div>

          <button className="vy-btn soft" style={{ marginTop: 16 }} onClick={() => { buzz(8); nav.push("add", { date }); }}>
            <Plus size={18} /> Add another for this day
          </button>
          <AllowCard s={s} />
        </div>
        <div className="vy-tabspace" />
      </div>
    </div>
  );
}
