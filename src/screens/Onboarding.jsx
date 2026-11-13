import React, { useState } from "react";
import { ArrowRight, Check, Shield } from "lucide-react";
import { useToast, Seg, IconPicker, ColorPicker, Select } from "../components/ui.jsx";
import { CURRENCIES, buzz } from "../lib/money.js";
import { STARTER_EXPENSE_CATEGORIES, STARTER_INCOME_CATEGORIES, STARTER_METHODS } from "../lib/presets.js";
import { ACCOUNT_TYPES } from "../lib/icons.jsx";
import { persistStorage } from "../lib/db.js";

export default function Onboarding({ s }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [book, setBook] = useState({ name: "Personal", type: "Personal", currency: "INR", icon: "Wallet", color: "#C87A15" });
  const [acc, setAcc] = useState({ name: "", type: "Bank", opening: "" });
  const [starter, setStarter] = useState(true);

  const finish = async () => {
    setBusy(true);
    try {
      await persistStorage();
      const created = await s.add("books", { ...book, name: book.name.trim() || "Personal" });
      await s.setMeta("activeBook", created.id);

      if (acc.name.trim()) {
        await s.add("accounts", {
          book: created.id, name: acc.name.trim(), type: acc.type,
          opening: Number(acc.opening) || 0, color: "#4A5BE8", includeNet: true,
        });
      }
      if (starter) {
        await s.addMany("categories", [
          ...STARTER_EXPENSE_CATEGORIES.map(([name, icon, color, group]) => ({ book: created.id, name, icon, color, group, dir: "Expense" })),
          ...STARTER_INCOME_CATEGORIES.map(([name, icon, color]) => ({ book: created.id, name, icon, color, group: "Income", dir: "Income" })),
        ]);
        await s.addMany("methods", STARTER_METHODS.map(([name, icon]) => ({ book: created.id, name, icon })));
      }
      buzz(18);
      toast("You're set up");
    } catch (e) {
      toast("Could not save: " + (e.message || e));
      setBusy(false);
    }
  };

  const steps = [
    {
      title: "Everything stays on this phone",
      body: "Vyay writes to your device's own database. There is no account, no server and no sync. Back it up yourself from Settings whenever you like.",
      content: (
        <div className="vy-note" style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
          <Shield size={19} style={{ color: "var(--in)", flex: "0 0 auto", marginTop: 1 }} />
          <span>Clearing your browser data or uninstalling the app removes everything. Export a backup before you do either.</span>
        </div>
      ),
      cta: "Get started",
      ok: () => true,
    },
    {
      title: "Name your first book",
      body: "A book holds its own accounts, categories and reports. Most people start with one and add a household book later.",
      content: (
        <div className="vy-form">
          <div>
            <label>Book name</label>
            <input className="vy-input" autoFocus value={book.name} placeholder="Personal"
              onChange={(e) => setBook({ ...book, name: e.target.value })} />
          </div>
          <div>
            <label>Type</label>
            <Seg value={book.type} onChange={(v) => setBook({ ...book, type: v })}
              options={[{ v: "Personal", l: "Personal" }, { v: "Household", l: "Household" }, { v: "Business", l: "Business" }]} />
          </div>
          <div>
            <label>Currency</label>
            <Select value={book.currency} onChange={(v) => setBook({ ...book, currency: v })} title="Currency"
              options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} ${c.symbol.trim()}` }))} />
          </div>
          <div><label>Colour</label><ColorPicker value={book.color} onChange={(v) => setBook({ ...book, color: v })} /></div>
        </div>
      ),
      cta: "Next",
      ok: () => book.name.trim().length > 0,
    },
    {
      title: "Add one account",
      body: "Where does your money actually sit? Put in today's balance and every figure after this will be right. You can add the rest later.",
      content: (
        <div className="vy-form">
          <div>
            <label>Account name</label>
            <input className="vy-input" autoFocus value={acc.name} placeholder="HDFC Savings"
              onChange={(e) => setAcc({ ...acc, name: e.target.value })} />
          </div>
          <div>
            <label>Type</label>
            <Select value={acc.type} onChange={(v) => setAcc({ ...acc, type: v })} title="Account type"
              options={ACCOUNT_TYPES.map((t) => ({ value: t, label: t }))} />
          </div>
          <div>
            <label>Balance right now</label>
            <input className="vy-input" inputMode="decimal" value={acc.opening} placeholder="0"
              onChange={(e) => setAcc({ ...acc, opening: e.target.value.replace(/[^\d.-]/g, "") })} />
          </div>
        </div>
      ),
      cta: acc.name.trim() ? "Next" : "Skip for now",
      ok: () => true,
    },
    {
      title: "Categories to start from",
      body: "You said you'd set up your own master data. Take the starter set as a base you can rename and prune, or begin from a blank slate.",
      content: (
        <div className="vy-form">
          <button className={"vy-field"} onClick={() => setStarter(true)}
            style={{ borderColor: starter ? "var(--accent)" : undefined }}>
            <span className="k" style={{ flex: 1 }}>
              <b style={{ display: "block", color: "var(--ink)", fontWeight: 600 }}>Give me a starter set</b>
              <span style={{ fontSize: 12.5 }}>25 expense and 9 income categories, plus 7 payment methods</span>
            </span>
            {starter && <Check size={18} style={{ color: "var(--accent)" }} />}
          </button>
          <button className={"vy-field"} onClick={() => setStarter(false)}
            style={{ borderColor: !starter ? "var(--accent)" : undefined }}>
            <span className="k" style={{ flex: 1 }}>
              <b style={{ display: "block", color: "var(--ink)", fontWeight: 600 }}>Start empty</b>
              <span style={{ fontSize: 12.5 }}>I'll add every category and method myself</span>
            </span>
            {!starter && <Check size={18} style={{ color: "var(--accent)" }} />}
          </button>
        </div>
      ),
      cta: busy ? "Setting up…" : "Finish setup",
      ok: () => !busy,
    },
  ];

  const cur = steps[step];
  const next = () => {
    if (!cur.ok()) return toast("Fill this in first");
    buzz(8);
    if (step === steps.length - 1) finish();
    else setStep(step + 1);
  };

  return (
    <div className="vy-screen fade-enter">
      <div className="vy-nav" style={{ paddingTop: 18 }}>
        <div style={{ flex: 1 }}>
          <div className="vy-num" style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-.04em", color: "var(--accent)" }}>Vyay</div>
        </div>
        {step > 0 && step < steps.length && (
          <button className="vy-link" onClick={() => setStep(step - 1)}>Back</button>
        )}
      </div>

      <div className="vy-body">
        <div className="vy-onb">
          <div className="vy-steps">
            {steps.map((_, i) => <i key={i} className={i <= step ? "on" : ""} />)}
          </div>
          <h1 className="vy-onb-h">{cur.title}</h1>
          <p>{cur.body}</p>
          {cur.content}
        </div>
      </div>

      <div className="vy-foot">
        <button className="vy-btn accent" disabled={busy} onClick={next}>
          {cur.cta}{step < steps.length - 1 && <ArrowRight size={17} />}
        </button>
      </div>
    </div>
  );
}
