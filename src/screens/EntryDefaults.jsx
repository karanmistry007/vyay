import React from "react";
import { RotateCcw, Check } from "lucide-react";
import { Nav, Select, useToast } from "../components/ui.jsx";
import { buzz } from "../lib/money.js";

const NONE = "__none__";

/**
 * What a brand new transaction starts with. Anything left on "Leave empty"
 * comes up blank, for people who would rather pick every time.
 */
export default function EntryDefaults({ s, nav }) {
  const toast = useToast();
  const all = s.settings.defaults || {};
  const mine = all[s.activeBook] || {};

  const setDefault = (field, value) => {
    buzz(6);
    s.setSetting("defaults", { ...all, [s.activeBook]: { ...mine, [field]: value === NONE ? null : value } });
  };

  const Row = ({ label, hint, field, options }) => (
    <div>
      <label className="vy-flabel">{label}</label>
      <Select value={mine[field] || NONE} onChange={(v) => setDefault(field, v)} title={label} searchable
        placeholder="Leave empty"
        options={[{ value: NONE, label: "Leave empty" },
          ...options.map((o) => ({ value: o.id, label: o.name, icon: o.icon, color: o.color }))]} />
      {hint && <div className="vy-sub" style={{ margin: "8px 4px 0", fontSize: 13, lineHeight: 1.45 }}>{hint}</div>}
    </div>
  );

  const set = Object.values(mine).filter(Boolean).length;

  return (
    <div className="vy-screen push-enter">
      <Nav title="Entry defaults" onBack={nav.pop}
        right={<button className="vy-iconbtn" aria-label="Clear all"
          onClick={() => { buzz(12); s.setSetting("defaults", { ...all, [s.activeBook]: {} }); toast("Every field will start empty"); }}>
          <RotateCcw size={18} /></button>} />
      <div className="vy-body">
        <div className="vy-pad">
          <div className="vy-note" style={{ marginTop: 6 }}>
            These fill in the moment you tap add, so most days the only thing left to type is the amount.
            Set any of them to <b>Leave empty</b> if you would rather choose every time.
          </div>

          <Row label="Default account" field="account" options={s.activeAccounts}
            hint="Whichever account you pay from most often." />
          <Row label="Default payment method" field="method" options={s.methods} />
          <Row label="Default expense category" field="expenseCat"
            options={s.categories.filter((c) => c.dir === "Expense" && !c.archived)}
            hint="Worth setting if one category dominates, like Groceries. Leave empty to be asked each time." />
          <Row label="Default income category" field="incomeCat"
            options={s.categories.filter((c) => c.dir === "Income" && !c.archived)} />

          <label className="vy-flabel">Date</label>
          <div className="vy-card">
            <div className="vy-optline">
              <div className="vy-row-ic" style={{ background: "var(--in-soft)", color: "var(--in)" }}><Check size={18} /></div>
              <div className="t"><b>Always starts on today</b><span>Yesterday is one tap away on the form</span></div>
            </div>
          </div>

          <div className="vy-sub" style={{ margin: "22px 4px 0", lineHeight: 1.5 }}>
            {set === 0
              ? "Nothing is pre-filled right now, so every new transaction starts blank."
              : `${set} of 4 fields are pre-filled.`} Defaults are per book, so Personal and Household can start differently.
          </div>
        </div>
        <div className="vy-tabspace" />
      </div>
    </div>
  );
}
