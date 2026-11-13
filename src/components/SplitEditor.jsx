import React from "react";
import { Users, Scale, Info } from "lucide-react";
import { Switch } from "./ui.jsx";
import { fmt, buzz, sum } from "../lib/money.js";

/**
 * Who was in on a bill and who paid for it.
 *
 * There is no "make this a shared bill" toggle: adding a person makes it
 * shared, removing everyone makes it yours again. Everything past the people
 * row stays hidden until at least one person is on it, so a solo expense shows
 * one quiet line instead of a form.
 */
export default function SplitEditor({ t, setT, amount, s, nav }) {
  const cur = s.currency;
  const shares = t.shares || [];
  const active = shares.length > 0;
  const shareSum = sum(shares.map((x) => Number(x.amount) || 0));
  const myShare = Math.max(0, amount - shareSum);
  const includeMe = t.includeMe !== false;
  const payerPerson = t.payer ? s.personById[t.payer] : null;
  const headcount = shares.length + (includeMe ? 1 : 0);

  const toggleParticipant = (personId) => {
    buzz(5);
    setT((p) => {
      const list = p.shares || [];
      const has = list.some((x) => x.person === personId);
      if (!has) return { ...p, shares: [...list, { person: personId, amount: 0, settled: false }] };
      const next = list.filter((x) => x.person !== personId);
      // Removing the last person makes this an ordinary expense again.
      if (!next.length) return { ...p, shares: null, payer: null, includeMe: true };
      return { ...p, shares: next, payer: p.payer === personId ? null : p.payer };
    });
  };

  const setPayer = (personId) => {
    buzz(6);
    setT((p) => {
      const next = { ...p, payer: personId };
      if (personId && !(p.shares || []).some((x) => x.person === personId)) {
        next.shares = [...(p.shares || []), { person: personId, amount: 0, settled: false }];
      }
      return next;
    });
  };

  const splitEvenly = () => {
    buzz(10);
    setT((p) => {
      const list = p.shares || [];
      const heads = list.length + (p.includeMe !== false ? 1 : 0);
      if (!heads || !amount) return p;
      const each = Math.round((amount / heads) * 100) / 100;
      if (p.includeMe !== false) return { ...p, shares: list.map((x) => ({ ...x, amount: each })) };
      const remainder = Math.round((amount - each * list.length) * 100) / 100;
      return { ...p, shares: list.map((x, i) => ({ ...x, amount: i === 0 ? Math.round((each + remainder) * 100) / 100 : each })) };
    });
  };

  const setShare = (personId, value) =>
    setT((p) => ({ ...p, shares: p.shares.map((x) => (x.person === personId ? { ...x, amount: value } : x)) }));

  if (s.people.length === 0) {
    return (
      <div className="vy-card" style={{ padding: 18, textAlign: "center" }}>
        <div className="vy-sub" style={{ lineHeight: 1.5 }}>
          Add the people you share bills with and you can split this between them, or record that one of
          them paid for everybody.
        </div>
        <button className="vy-link" style={{ marginTop: 12 }} onClick={() => nav.push("people")}>Add people</button>
      </div>
    );
  }

  const unbalanced = active && !includeMe && Math.abs(shareSum - amount) > 0.01;

  return (
    <div className="vy-card" style={{ padding: 16 }}>
      <div className="vy-wrap">
        {s.people.map((p) => {
          const on = shares.some((x) => x.person === p.id);
          return (
            <button key={p.id} className={"vy-chip" + (on ? " on" : "")} onClick={() => toggleParticipant(p.id)}>
              {p.name}{p.id === t.payer ? " · paid" : ""}
            </button>
          );
        })}
      </div>

      {!active ? (
        <div className="vy-sub" style={{ marginTop: 12, lineHeight: 1.45 }}>
          Tap anyone who was in on this. Leave it empty and it stays entirely yours.
        </div>
      ) : (
        <>
          <div className="vy-flabel" style={{ margin: "20px 0 10px" }}>Who paid</div>
          <div className="vy-wrap">
            <button className={"vy-chip" + (!t.payer ? " on" : "")} onClick={() => setPayer(null)}>Me</button>
            {s.people.map((p) => (
              <button key={p.id} className={"vy-chip" + (t.payer === p.id ? " on" : "")} onClick={() => setPayer(p.id)}>
                {p.name}
              </button>
            ))}
          </div>

          {payerPerson && (
            <div className="vy-note" style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Info size={16} style={{ color: "var(--tr)", flex: "0 0 auto", marginTop: 2 }} />
              <span>{payerPerson.name} paid, so none of your accounts move. Your share becomes what you owe them.</span>
            </div>
          )}

          <div className="vy-optline" style={{ padding: "14px 0 6px" }}>
            <div className="t"><b>Include me in the split</b><span>Turn off if you were not part of this</span></div>
            <Switch on={includeMe} label="Include me" onChange={(v) => setT((p) => ({ ...p, includeMe: v }))} />
          </div>

          <button className="vy-btn soft" style={{ padding: 12, fontSize: 14, marginTop: 6 }} onClick={splitEvenly}>
            <Scale size={16} />Split evenly between {headcount}
          </button>

          <div style={{ marginTop: 14 }}>
            {shares.map((sh) => {
              const person = s.personById[sh.person];
              return (
                <div key={sh.person} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 700, letterSpacing: "-.02em" }}>
                    {person ? person.name : "Removed"}
                    {sh.person === t.payer && <span className="vy-sub" style={{ fontSize: 12 }}> · paid the bill</span>}
                  </span>
                  <input className="vy-input" style={{ width: 104, padding: "10px 12px", textAlign: "right" }}
                    inputMode="decimal" value={sh.amount || ""} placeholder="0"
                    onChange={(e) => setShare(sh.person, parseFloat(e.target.value.replace(/[^\d.]/g, "")) || 0)} />
                </div>
              );
            })}
            {includeMe && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 800, letterSpacing: "-.02em" }}>Your share</span>
                <span className="vy-num" style={{ fontSize: 16 }}>{fmt(myShare, { currency: cur })}</span>
              </div>
            )}
          </div>

          <div className="vy-note" style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Users size={16} style={{ color: "var(--muted)", flex: "0 0 auto", marginTop: 2 }} />
            <span>
              {t.payer
                ? <>You owe {payerPerson ? payerPerson.name : "them"} <b>{fmt(myShare, { currency: cur })}</b>
                    {shares.filter((x) => x.person !== t.payer && x.amount > 0).length > 0 && <>
                      {", and "}
                      {shares.filter((x) => x.person !== t.payer && x.amount > 0)
                        .map((x) => (s.personById[x.person] || {}).name).filter(Boolean).join(", ")}
                      {" owe them too."}</>}
                  </>
                : <>You are owed <b>{fmt(shareSum, { currency: cur })}</b> back out of this bill.</>}
            </span>
          </div>

          {unbalanced && (
            <div className="vy-note" style={{ marginTop: 10, color: "#D2564B" }}>
              You are not in this split, so the shares need to add up to {fmt(amount, { currency: cur })}.
              They currently come to {fmt(shareSum, { currency: cur })}.
            </div>
          )}
        </>
      )}
    </div>
  );
}
