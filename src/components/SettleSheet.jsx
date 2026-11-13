import React, { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Wallet, Check, HandCoins } from "lucide-react";
import { Sheet, DatePick, Field } from "./ui.jsx";
import { Ic, ACCOUNT_ICON } from "../lib/icons.jsx";
import { fmt, buzz, isoToday, relDay } from "../lib/money.js";

/**
 * Settling a debt is two things at once: the IOU is cleared, and money changes
 * hands. Clearing the IOU alone leaves the account short by whatever came back,
 * which is why this always asks where the money went.
 *
 * "No money changed hands" is offered for the cases where it genuinely didn't —
 * squared off against something else, or paid in cash you never banked.
 */
export default function SettleSheet({ open, onClose, s, person, amount, direction, title, onConfirm }) {
  const [account, setAccount] = useState(() => {
    const preferred = (s.settings.defaults || {})[s.activeBook] || {};
    return preferred.account && s.activeAccounts.some((a) => a.id === preferred.account)
      ? preferred.account
      : (s.activeAccounts[0] ? s.activeAccounts[0].id : null);
  });
  const [noMoney, setNoMoney] = useState(false);
  const [date, setDate] = useState(isoToday());
  const [datePick, setDatePick] = useState(false);

  const cur = s.currency;
  const inbound = direction === "in";
  const name = person ? person.name : "them";

  const confirm = () => {
    buzz(14);
    onConfirm({ account: noMoney ? null : account, date, noMoney });
    onClose();
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title={title || (inbound ? "Record what you got back" : "Record what you paid")}>
        <div className="vy-card" style={{ padding: 18, textAlign: "center" }}>
          <div className="vy-row-ic lg" style={{ width: 52, height: 52, borderRadius: 18, margin: "0 auto 14px",
            background: inbound ? "var(--in-soft)" : "var(--out-soft)", color: inbound ? "var(--in)" : "var(--out)" }}>
            {inbound ? <ArrowDownLeft size={24} /> : <ArrowUpRight size={24} />}
          </div>
          <div className="vy-num" style={{ fontSize: 32 }}>{fmt(amount, { currency: cur })}</div>
          <div className="vy-sub" style={{ marginTop: 6 }}>
            {inbound ? `${name} pays you back` : `You pay ${name} back`}
          </div>
        </div>

        {!noMoney && (
          <>
            <label className="vy-flabel">{inbound ? "Into which account" : "From which account"}</label>
            <div className="vy-wrap">
              {s.activeAccounts.map((a) => (
                <button key={a.id} className={"vy-chip" + (account === a.id ? " on" : "")}
                  onClick={() => { buzz(5); setAccount(a.id); }}>
                  <Ic n={ACCOUNT_ICON[a.type] || "Wallet"} size={14} style={{ color: account === a.id ? undefined : a.color }} />
                  {a.name}
                </button>
              ))}
            </div>

            <label className="vy-flabel">When</label>
            <div className="vy-wrap">
              <button className={"vy-chip" + (date === isoToday() ? " on" : "")} onClick={() => { buzz(5); setDate(isoToday()); }}>Today</button>
              <button className={"vy-chip" + (date !== isoToday() ? " on" : "")} onClick={() => { buzz(5); setDatePick(true); }}>
                {date !== isoToday() ? relDay(date) : "Another day"}
              </button>
            </div>
          </>
        )}

        <div className="vy-card" style={{ marginTop: 20 }}>
          <div className="vy-optline" onClick={() => { buzz(5); setNoMoney((v) => !v); }} style={{ cursor: "pointer" }}>
            <div className="vy-row-ic neutral"><HandCoins size={18} /></div>
            <div className="t">
              <b>No money changed hands</b>
              <span>Squared off some other way, or cash you never banked</span>
            </div>
            {noMoney && <Check size={19} style={{ color: "var(--accent)" }} />}
          </div>
        </div>

        <div className="vy-note" style={{ marginTop: 14 }}>
          {noMoney
            ? "The debt is cleared and no account changes."
            : `${inbound ? "Adds" : "Takes"} ${fmt(amount, { currency: cur })} ${inbound ? "to" : "from"} that account. It stays out of your spending reports, because the original bill is already counted there.`}
        </div>

        <button className="vy-btn accent" style={{ marginTop: 18 }} disabled={!noMoney && !account} onClick={confirm}>
          <Check size={18} />Settle {fmt(amount, { currency: cur })}
        </button>
      </Sheet>

      <Sheet open={datePick} onClose={() => setDatePick(false)} title="Date">
        <DatePick value={date} onPick={(v) => { setDate(v); setDatePick(false); }} />
      </Sheet>
    </>
  );
}
