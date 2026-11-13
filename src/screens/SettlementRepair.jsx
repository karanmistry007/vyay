import React, { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, CheckCircle2, Wallet, AlertCircle } from "lucide-react";
import { Nav, Empty, Sheet, DatePick, useToast } from "../components/ui.jsx";
import { Ic, ACCOUNT_ICON } from "../lib/icons.jsx";
import { fmt, buzz, sum, isoToday, relDay } from "../lib/money.js";
import { groupUnrecorded } from "../lib/settlements.js";

/**
 * Debts marked settled before settlements recorded the money movement.
 *
 * The IOU was cleared but the cash never landed anywhere, so the account kept
 * the full outflow. This adds the missing movements in one go, or lets you
 * dismiss the ones where no money really changed hands.
 */
export default function SettlementRepair({ s, nav }) {
  const toast = useToast();
  const cur = s.currency;
  const groups = useMemo(() => groupUnrecorded(s.txns, s.activeBook), [s.txns, s.activeBook]);

  const fallbackAccount = (() => {
    const preferred = (s.settings.defaults || {})[s.activeBook] || {};
    return preferred.account && s.activeAccounts.some((a) => a.id === preferred.account)
      ? preferred.account
      : (s.activeAccounts[0] ? s.activeAccounts[0].id : null);
  })();

  /* Default each group to the account the original bill was paid from. */
  const [accounts, setAccounts] = useState(() => {
    const seed = {};
    groups.forEach((g) => {
      seed[g.key] = g.suggested && s.activeAccounts.some((a) => a.id === g.suggested)
        ? g.suggested
        : fallbackAccount;
    });
    return seed;
  });
  const setAccount = (key, id) => setAccounts((prev) => ({ ...prev, [key]: id }));
  const allChosen = groups.every((g) => accounts[g.key]);
  const [date, setDate] = useState(isoToday());
  const [datePick, setDatePick] = useState(false);
  const [busy, setBusy] = useState(false);

  const inTotal = sum(groups.filter((g) => g.direction === "in").map((g) => g.amount));
  const outTotal = sum(groups.filter((g) => g.direction === "out").map((g) => g.amount));
  const net = inTotal - outTotal;

  /**
   * Stamping is done in a single pass per transaction, not per person.
   *
   * One bill can carry shares for several people, so settling them one at a
   * time and rewriting the whole `shares` array each time would read a stale
   * snapshot and wipe the stamp the previous person just got. Collect first,
   * write once.
   */
  const applyStamps = async (stamps) => {
    for (const [txnId, stamp] of Object.entries(stamps)) {
      const original = s.state.txns.find((x) => x.id === txnId);
      if (!original) continue;
      const patch = {};
      if (stamp.mine) { patch.mySettled = true; patch.myClearedBy = stamp.mine; }
      if (stamp.shares) {
        patch.shares = (original.shares || []).map((sh) =>
          sh.settled && sh.clearedBy === undefined && stamp.shares[sh.person]
            ? { ...sh, clearedBy: stamp.shares[sh.person] }
            : sh);
      }
      await s.update("txns", txnId, patch);
    }
  };

  const collect = (group, settlementId, stamps) => {
    for (const item of group.items) {
      const id = item.txn.id;
      stamps[id] = stamps[id] || {};
      if (item.direction === "out") stamps[id].mine = settlementId;
      else {
        stamps[id].shares = stamps[id].shares || {};
        stamps[id].shares[group.person] = settlementId;
      }
    }
  };

  const recordAll = async () => {
    if (!allChosen || busy) return;
    setBusy(true);
    try {
      const stamps = {};
      for (const group of groups) {
        await s.settleDebt({
          person: group.person, amount: group.amount, direction: group.direction,
          account: accounts[group.key], date, noMoney: false,
          links: group.items.map((i) => ({ txn: i.txn.id, share: i.share })),
          clear: async (settlementId) => collect(group, settlementId, stamps),
        });
      }
      await applyStamps(stamps);
      buzz(18);
      toast(`Recorded ${groups.length} settlement${groups.length === 1 ? "" : "s"}`);
      nav.pop();
    } catch (e) {
      toast("Could not record those: " + (e.message || e));
      setBusy(false);
    }
  };

  const dismissAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const stamps = {};
      groups.forEach((group) => collect(group, "none", stamps));
      await applyStamps(stamps);
      buzz(14);
      toast("Marked as no money changed hands");
      nav.pop();
    } catch (e) {
      toast("Could not update those: " + (e.message || e));
      setBusy(false);
    }
  };

  if (!groups.length) {
    return (
      <div className="vy-screen push-enter">
        <Nav title="Settlement check" onBack={nav.pop} />
        <div className="vy-body"><div className="vy-pad">
          <Empty icon={<CheckCircle2 size={26} />} title="Everything is accounted for"
            body="Every settled debt has its money recorded against an account, so your balances match what actually happened." />
        </div></div>
      </div>
    );
  }

  return (
    <div className="vy-screen push-enter">
      <Nav title="Settlement check" onBack={nav.pop} />
      <div className="vy-body">
        <div className="vy-pad">
          <div className="vy-hero">
            <div className="vy-lbl">Settled but never banked</div>
            <div className="vy-hero-amt" style={{ marginTop: 10, fontSize: 40 }}>
              {fmt(Math.abs(net), { currency: cur })}
            </div>
            <div className="vy-sub" style={{ marginTop: 10, lineHeight: 1.5 }}>
              {inTotal > 0 && <>{fmt(inTotal, { currency: cur })} came back to you</>}
              {inTotal > 0 && outTotal > 0 && <>, </>}
              {outTotal > 0 && <>{fmt(outTotal, { currency: cur })} you paid out</>}
              {" "}across {groups.length} {groups.length === 1 ? "person" : "people"}.
            </div>
          </div>

          <div className="vy-note" style={{ marginTop: 12 }}>
            These debts were marked settled before the app recorded the money changing hands, so your
            account balances are short by that much. Pick the account the money went through and
            record them all at once.
          </div>

          <div className="vy-sec"><h3>What is missing</h3><span className="vy-sub">one entry each</span></div>
          <div style={{ display: "grid", gap: 12 }}>
            {groups.map((g) => {
              const person = s.personById[g.person];
              const inbound = g.direction === "in";
              return (
                <div key={g.key} className="vy-card" style={{ padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                    <div className="vy-row-ic" style={{
                      background: inbound ? "var(--in-soft)" : "var(--out-soft)",
                      color: inbound ? "var(--in)" : "var(--out)" }}>
                      {inbound ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.028em" }}>
                        {person ? person.name : "Removed person"}
                      </b>
                      <div className="vy-sub" style={{ marginTop: 2 }}>
                        {inbound ? "paid you back" : "you paid them"} · {g.items.length} {g.items.length === 1 ? "bill" : "bills"}
                      </div>
                    </div>
                    <b className="vy-num" style={{ fontSize: 16, color: inbound ? "var(--in)" : "var(--out)" }}>
                      {inbound ? "+" : "−"}{fmt(g.amount, { currency: cur })}
                    </b>
                  </div>

                  <div className="vy-flabel" style={{ margin: "16px 0 9px" }}>
                    {inbound ? "Into" : "From"}
                    {g.suggested && accounts[g.key] === g.suggested && <span className="hint">where the bill was paid</span>}
                  </div>
                  <div className="vy-wrap">
                    {s.activeAccounts.map((a) => (
                      <button key={a.id} className={"vy-chip" + (accounts[g.key] === a.id ? " on" : "")}
                        onClick={() => { buzz(5); setAccount(g.key, a.id); }}>
                        <Ic n={ACCOUNT_ICON[a.type] || "Wallet"} size={14}
                          style={{ color: accounts[g.key] === a.id ? undefined : a.color }} />
                        {a.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <label className="vy-flabel">Dated</label>
          <div className="vy-wrap">
            <button className={"vy-chip" + (date === isoToday() ? " on" : "")} onClick={() => { buzz(5); setDate(isoToday()); }}>Today</button>
            <button className={"vy-chip" + (date !== isoToday() ? " on" : "")} onClick={() => { buzz(5); setDatePick(true); }}>
              {date !== isoToday() ? relDay(date) : "Another day"}
            </button>
          </div>

          <div className="vy-note" style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertCircle size={17} style={{ color: "var(--warn)", flex: "0 0 auto", marginTop: 2 }} />
            <span>
              Each becomes its own transaction, kept out of spending reports because the original bills
              are already counted there. Export a backup first if you want a way back.
            </span>
          </div>

          <button className="vy-btn accent" style={{ marginTop: 18 }} disabled={!allChosen || busy} onClick={recordAll}>
            <Check size={18} />{busy ? "Recording…" : `Record ${fmt(inTotal + outTotal, { currency: cur })}`}
          </button>
          <button className="vy-btn soft" style={{ marginTop: 10 }} disabled={busy} onClick={dismissAll}>
            No money changed hands, just clear the flags
          </button>
        </div>
        <div className="vy-tabspace" />
      </div>

      <Sheet open={datePick} onClose={() => setDatePick(false)} title="Date">
        <DatePick value={date} onPick={(v) => { setDate(v); setDatePick(false); }} />
      </Sheet>
    </div>
  );
}
