import React, { useState } from "react";
import {
  Plus, ArrowDownLeft, ArrowUpRight, CheckCircle2, Handshake, Trash2, Receipt, Scale, HandCoins,
} from "lucide-react";
import { Nav, Sheet, Seg, Confirm, Empty, SwipeRow, DatePick, Field, useToast } from "../components/ui.jsx";
import SettleSheet from "../components/SettleSheet.jsx";
import { Ic } from "../lib/icons.jsx";
import { tint } from "../lib/color.js";
import { fmt, buzz, isoToday, relDay, round2 } from "../lib/money.js";
import { personBalances, personHistory, myShareOf } from "../lib/ledger.js";

const BLANK = { direction: "owed", amount: "", date: isoToday(), note: "" };

export default function PersonDetail({ s, nav, id }) {
  const toast = useToast();
  const person = s.personById[id];
  const [draft, setDraft] = useState(null);
  const [datePick, setDatePick] = useState(false);
  const [confirmSettle, setConfirmSettle] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  if (!person) return <div className="vy-screen push-enter"><Nav title="Not found" onBack={nav.pop} /></div>;

  const cur = s.currency;
  const priv = s.settings.privacy;
  const balance = personBalances(s.txns, s.peopleEntries)[id] || 0;
  const history = personHistory(id, s.txns, s.peopleEntries);
  const theyOwe = balance > 0;

  const save = async () => {
    const value = Number(draft.amount);
    if (!(value > 0)) return toast("Enter an amount above zero.");
    const signed = round2(draft.direction === "owed" ? value : -value);
    if (draft.id) {
      await s.update("peopleEntries", draft.id, { amount: signed, date: draft.date, note: draft.note.trim() });
      toast("Entry updated");
    } else {
      await s.add("peopleEntries", {
        book: s.activeBook, person: id, amount: signed, date: draft.date,
        note: draft.note.trim(), kind: "Manual",
      });
      toast(draft.direction === "owed" ? "Recorded what they owe you" : "Recorded what you owe");
    }
    buzz(12);
    setDraft(null);
  };

  /* Settling clears every open debt with this person and records the money. */
  const settleUp = async ({ account, date, noMoney }) => {
    const direction = balance > 0 ? "in" : "out";
    const openBills = s.txns.filter((t) => !t.payer && (t.shares || []).some((sh) => sh.person === id && !sh.settled));
    const theirBills = s.txns.filter((t) => t.payer === id && !t.mySettled && myShareOf(t) > 0);

    await s.settleDebt({
      person: id, amount: Math.abs(balance), direction, account, date, noMoney,
      links: [
        ...openBills.map((t) => ({ txn: t.id, share: id })),
        ...theirBills.map((t) => ({ txn: t.id, share: null })),
      ],
      clear: async (settlementId) => {
        for (const t of openBills) {
          await s.update("txns", t.id, {
            shares: t.shares.map((sh) => (sh.person === id ? { ...sh, settled: true, clearedBy: settlementId } : sh)),
          });
        }
        for (const t of theirBills) await s.update("txns", t.id, { mySettled: true, myClearedBy: settlementId });

        const manual = s.peopleEntries.filter((e) => e.person === id).reduce((a, e) => a + (Number(e.amount) || 0), 0);
        if (manual !== 0) {
          await s.add("peopleEntries", {
            book: s.activeBook, person: id, amount: -manual, date: date || isoToday(),
            note: "Settled up", kind: "Settlement",
          });
        }
      },
    });
    buzz(18);
    toast(noMoney ? `All square with ${person.name}` : `Settled and recorded`);
    setConfirmSettle(false);
  };

  const tone = balance === 0 ? "var(--ink)" : theyOwe ? "var(--in)" : "var(--out)";

  return (
    <div className="vy-screen push-enter">
      <Nav title={person.name} onBack={nav.pop}
        right={<button className="vy-iconbtn" aria-label="Record an amount"
          onClick={() => { buzz(6); setDraft({ ...BLANK }); }}><Plus size={19} /></button>} />

      <div className="vy-body">
        <div className="vy-pad">
          <div className="vy-hero">
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <div className="vy-row-ic lg" style={{ width: 46, height: 46, borderRadius: 15, background: tint((person.color || "#4A5BE8")), color: person.color || "#4A5BE8", fontWeight: 700, fontSize: 19 }}>
                {person.name[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div className="vy-lbl">
                  {balance === 0 ? "All settled" : theyOwe ? `${person.name} owes you` : `You owe ${person.name}`}
                </div>
                <div className={"vy-hero-amt" + (priv ? " vy-blur" : "")} style={{ marginTop: 4, fontSize: 32, color: tone }}>
                  {fmt(Math.abs(balance), { currency: cur })}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="vy-btn soft" style={{ padding: 11, fontSize: 13.5 }}
                onClick={() => { buzz(6); setDraft({ ...BLANK, direction: "owed" }); }}>
                <ArrowDownLeft size={15} />They owe me
              </button>
              <button className="vy-btn soft" style={{ padding: 11, fontSize: 13.5 }}
                onClick={() => { buzz(6); setDraft({ ...BLANK, direction: "owe" }); }}>
                <ArrowUpRight size={15} />I owe them
              </button>
            </div>

            {balance !== 0 && (
              <button className="vy-btn accent" style={{ marginTop: 8 }} onClick={() => { buzz(8); setConfirmSettle(true); }}>
                <Handshake size={17} />Settle up
              </button>
            )}
          </div>

          <div className="vy-sec">
            <h3>History</h3>
            <span className="vy-sub">{history.length} entr{history.length === 1 ? "y" : "ies"}</span>
          </div>

          {history.length === 0 ? (
            <Empty icon={<Scale size={24} />} title="Nothing outstanding"
              body={`Record what ${person.name} owes you or what you owe them, or split a bill with them from the add screen.`}
              cta="Record an amount" onCta={() => setDraft({ ...BLANK })} />
          ) : (
            <div className="vy-group">
              {history.map((row) => {
                if (row.kind === "PaidForYou") {
                  const t = row.txn;
                  const c = s.catById[t.cat];
                  const r = s.retById[t.ret];
                  return (
                    <div key={row.id} className="vy-row" onClick={() => nav.push("txn", { id: t.id })}>
                      <div className="vy-row-ic" style={{ background: row.settled ? "var(--surface2)" : "var(--out-soft)", color: row.settled ? "var(--ink2)" : "var(--out)" }}>
                        <HandCoins size={18} />
                      </div>
                      <div className="vy-row-m">
                        <b>Paid for you — {r ? r.name : c ? c.name : "a shared bill"}</b>
                        <span>{relDay(row.date)} · {row.settled ? "settled" : "your share is open"}</span>
                      </div>
                      <div className="vy-row-a">
                        <b className={priv ? "vy-blur" : ""} style={{ color: row.settled ? "var(--muted)" : "var(--out)" }}>
                          {row.settled ? "" : "−"}{fmt(Math.abs(row.gross), { currency: cur })}
                        </b>
                        {row.settled && <span>cleared</span>}
                      </div>
                    </div>
                  );
                }
                if (row.kind === "Split") {
                  const t = row.txn;
                  const c = s.catById[t.cat];
                  const r = s.retById[t.ret];
                  return (
                    <div key={row.id} className="vy-row" onClick={() => nav.push("txn", { id: t.id })}>
                      <div className="vy-row-ic" style={{ background: tint((c ? c.color : "#8A8D9C")), color: c ? c.color : "var(--muted)" }}>
                        <Ic n={c ? c.icon : "Receipt"} size={18} />
                      </div>
                      <div className="vy-row-m">
                        <b>Share of {r ? r.name : c ? c.name : "a bill"}</b>
                        <span>{relDay(row.date)} · {row.settled ? "settled" : "still open"}</span>
                      </div>
                      <div className="vy-row-a">
                        <b className={priv ? "vy-blur" : ""} style={{ color: row.settled ? "var(--muted)" : "var(--in)" }}>
                          {row.settled ? "" : "+"}{fmt(row.gross, { currency: cur })}
                        </b>
                        {row.settled && <span>cleared</span>}
                      </div>
                    </div>
                  );
                }
                const positive = row.amount > 0;
                const isSettlement = row.kind === "Settlement";
                return (
                  <SwipeRow key={row.id}
                    onEdit={isSettlement ? null : () => setDraft({
                      id: row.id, direction: positive ? "owed" : "owe",
                      amount: String(Math.abs(row.amount)), date: row.date, note: row.note,
                    })}
                    onDelete={() => setConfirmDelete(row.entry)}>
                    <div className="vy-row" style={{ cursor: "default" }}>
                      <div className="vy-row-ic" style={{
                        background: isSettlement ? "var(--surface2)" : positive ? "var(--in-soft)" : "var(--out-soft)",
                        color: isSettlement ? "var(--ink2)" : positive ? "var(--in)" : "var(--out)",
                      }}>
                        {isSettlement ? <CheckCircle2 size={18} /> : positive ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                      </div>
                      <div className="vy-row-m">
                        <b>{row.note || (isSettlement ? "Settled up" : positive ? "They owe you" : "You owe them")}</b>
                        <span>{relDay(row.date)}</span>
                      </div>
                      <div className="vy-row-a">
                        <b className={priv ? "vy-blur" : ""} style={{ color: positive ? "var(--in)" : "var(--out)" }}>
                          {fmt(row.amount, { currency: cur, sign: true })}
                        </b>
                      </div>
                    </div>
                  </SwipeRow>
                );
              })}
            </div>
          )}

          <div className="vy-note" style={{ marginTop: 16 }}>
            A plus means {person.name} owes you. A minus means you owe {person.name}. Splits you create on the
            add screen land here automatically.
          </div>
        </div>
        <div className="vy-tabspace" />
      </div>

      <Sheet open={!!draft} onClose={() => setDraft(null)} title={draft && draft.id ? "Edit entry" : "Record an amount"}>
        {draft && (
          <>
            <Seg value={draft.direction} onChange={(v) => setDraft({ ...draft, direction: v })}
              options={[{ v: "owed", l: `${person.name} owes me` }, { v: "owe", l: `I owe ${person.name}` }]} />
            <div className="vy-form" style={{ marginTop: 14 }}>
              <div>
                <label>Amount</label>
                <input className="vy-input" inputMode="decimal" autoFocus placeholder="0" value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value.replace(/[^\d.]/g, "") })} />
              </div>
              <div>
                <label>Date</label>
                <Field label="" value={relDay(draft.date)} onClick={() => setDatePick(true)} />
              </div>
              <div>
                <label>What was it for?</label>
                <input className="vy-input" placeholder="Lent cash for the trip" value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
              </div>
            </div>
            <button className="vy-btn accent" style={{ marginTop: 18 }} onClick={save}>
              {draft.id ? "Save changes" : "Record it"}
            </button>
          </>
        )}
      </Sheet>

      <Sheet open={datePick} onClose={() => setDatePick(false)} title="Date">
        <DatePick value={draft ? draft.date : isoToday()} onPick={(d) => { setDraft((x) => ({ ...x, date: d })); setDatePick(false); }} />
      </Sheet>

      <SettleSheet open={confirmSettle} onClose={() => setConfirmSettle(false)} s={s}
        person={person} amount={Math.abs(balance)} direction={balance > 0 ? "in" : "out"}
        title={`Settle up with ${person.name}`} onConfirm={settleUp} />

      <Confirm open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={async () => { await s.remove("peopleEntries", confirmDelete.id); toast("Entry removed"); }}
        title="Delete this entry?" body="The amount comes straight off the balance. This cannot be undone." />
    </div>
  );
}
