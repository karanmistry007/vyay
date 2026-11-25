import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X, Check, Mic, Building2, ArrowRight, Plus, MoreHorizontal, Calendar,
  Tag as TagIcon, Users, EyeOff, Settings2,
} from "lucide-react";
import { Seg, Sheet, Field, PickerSheet, DatePick, Switch, useToast } from "../components/ui.jsx";
import SplitEditor from "../components/SplitEditor.jsx";

/* Quick add is most of a parser; load it the first time someone opens it, not with the app. */
const loadQuickDraft = () => import("../components/QuickDraft.jsx");
const QuickDraft = React.lazy(loadQuickDraft);
import { Ic, ACCOUNT_ICON } from "../lib/icons.jsx";
import { fmt, buzz, sum, isoToday, relDay, iso, round2 } from "../lib/money.js";
import { byOrder, myShareOf } from "../lib/ledger.js";

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return iso(d);
};

/**
 * One screen, everything visible.
 *
 * The old version hid notes, splits and status behind a "more" button, so
 * writing a two-word note took four taps. Now the whole form is laid out in the
 * order you actually fill it, and the fields with only a handful of options
 * (account, payment method, date) are chips you tap once rather than pickers
 * that open a sheet.
 */
export default function Entry({ s, nav, editId, initialType, initialDate, onDone }) {
  const toast = useToast();
  const existing = editId ? s.state.txns.find((t) => t.id === editId) : null;
  const amtRef = useRef(null);

  const bookDefaults = (s.settings.defaults || {})[s.activeBook] || {};
  const defaultFor = (type) => ({
    account: bookDefaults.account && s.activeAccounts.some((a) => a.id === bookDefaults.account) ? bookDefaults.account : null,
    method: bookDefaults.method && s.methods.some((m) => m.id === bookDefaults.method) ? bookDefaults.method : null,
    cat: type === "Income"
      ? (bookDefaults.incomeCat && s.catById[bookDefaults.incomeCat] ? bookDefaults.incomeCat : null)
      : (bookDefaults.expenseCat && s.catById[bookDefaults.expenseCat] ? bookDefaults.expenseCat : null),
  });

  const [t, setT] = useState(() => {
    if (existing) {
      return {
        ...existing,
        splits: existing.splits ? existing.splits.map((x) => ({ ...x })) : null,
        shares: existing.shares ? existing.shares.map((x) => ({ ...x })) : null,
        tags: existing.tags ? [...existing.tags] : [],
        payer: existing.payer || null,
        includeMe: existing.includeMe === undefined ? true : existing.includeMe,
      };
    }
    const startType = initialType === "Income" || initialType === "Transfer" ? initialType : "Expense";
    const d = defaultFor(startType);
    return {
      // Opened from a day's recap, an entry belongs to that day, not to whenever it was typed.
      id: null, type: startType, date: initialDate && initialDate <= isoToday() ? initialDate : isoToday(), amount: 0,
      ...(startType === "Transfer" ? { cat: null } : null),
      account: d.account, to: null, cat: startType === "Transfer" ? null : d.cat, ret: null, method: d.method,
      notes: "", status: "Cleared", exclude: false, splits: null, shares: null, tags: [],
      payer: null, mySettled: false, includeMe: true,
    };
  });

  const [raw, setRaw] = useState(existing ? String(existing.amount) : "");
  const [pick, setPick] = useState(null);
  const [showQuick, setShowQuick] = useState(false);

  useEffect(() => { if (!editId && amtRef.current) amtRef.current.focus(); }, [editId]);

  const amount = raw === "" ? 0 : parseFloat(raw) || 0;
  const set = (k, v) => setT((p) => ({ ...p, [k]: v }));

  const catList = s.categories.filter((c) => c.dir === (t.type === "Income" ? "Income" : "Expense") && !c.archived);
  const cat = s.catById[t.cat];
  const account = s.accById[t.account];
  const toAccount = s.accById[t.to];
  const retailer = s.retById[t.ret];

  /* Pinned quick picks first, then whatever you used recently. */
  const chipCats = useMemo(() => {
    const pinned = catList.filter((c) => c.quick).sort(byOrder);
    if (pinned.length) return pinned;
    const seen = [];
    s.txns.filter((x) => x.type === t.type).forEach((x) => {
      if (x.cat && !seen.includes(x.cat) && seen.length < 8) seen.push(x.cat);
    });
    const recents = seen.map((id) => s.catById[id]).filter(Boolean);
    return recents.length ? recents : catList.slice(0, 8);
  }, [s.txns, s.catById, t.type, catList]);

  const shownCats = useMemo(() => {
    if (!cat || chipCats.some((c) => c.id === cat.id)) return chipCats;
    return [cat, ...chipCats];   // keep a non-pinned pick visible
  }, [chipCats, cat]);

  const splitTotal = t.splits ? sum(t.splits.map((x) => Number(x.amount) || 0)) : 0;
  const shareTotal = t.shares ? sum(t.shares.map((x) => Number(x.amount) || 0)) : 0;
  const paidByOther = !!t.payer && t.type !== "Transfer";

  const valid = amount > 0
    && (paidByOther || t.account)
    && (t.type === "Transfer" ? t.to && t.to !== t.account : !!t.cat)
    && (!t.splits || Math.abs(splitTotal - amount) < 0.01)
    && shareTotal <= amount + 0.01
    && (t.includeMe !== false || Math.abs(shareTotal - amount) < 0.01);

  const onAmount = (e) => {
    let v = e.target.value.replace(/[^\d.]/g, "");
    const parts = v.split(".");
    if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
    v = v.includes(".") ? v.split(".")[0].slice(0, 10) + "." + v.split(".")[1].slice(0, 2) : v.slice(0, 10);
    setRaw(v);
  };

  const switchType = (v) => {
    const d = defaultFor(v);
    setT((p) => ({ ...p, type: v, cat: v === "Transfer" ? null : d.cat, to: null, shares: null, payer: null }));
  };

  /*
   * A draft from quick add fills the form; it never saves. Only what the sentence settled is
   * written over the form — everything else keeps its default — and a change of type resets
   * the type-bound fields exactly as tapping the Expense / Income / Transfer switch does, so a
   * draft cannot leave an expense category on an income or a share on a transfer.
   */
  const applyDraft = (d) => {
    if (d.amount != null) setRaw(String(round2(d.amount)));
    setT((p) => {
      let n = p;
      if (d.type !== p.type) {
        const df = defaultFor(d.type);
        n = { ...p, type: d.type, cat: d.type === "Transfer" ? null : df.cat, to: null, shares: null, payer: null, splits: null };
      } else n = { ...p };
      if (d.cat && d.type !== "Transfer") n.cat = d.cat;
      if (d.account) n.account = d.account;
      if (d.type === "Transfer" && d.to) n.to = d.to;
      if (n.type === "Transfer" && n.to && n.to === n.account) n.to = null;
      if (d.method) n.method = d.method;
      if (d.ret && d.type !== "Transfer") n.ret = d.ret;
      if (d.date && d.date <= isoToday()) n.date = d.date;
      if (d.notes) n.notes = d.notes;
      return n;
    });
    /*
     * A new amount under shares typed earlier still passes validation (shares only have to fit
     * inside it) but silently changes what is owed, so it gets its own prompt. Unmounting skips
     * the sheet's slide-out; acceptable, because the form it reveals is the point.
     */
    const sharedBefore = d.type === t.type && ((t.shares && t.shares.length) || (t.splits && t.splits.length));
    buzz(10); setShowQuick(false);
    toast(sharedBefore && d.amount != null && round2(d.amount) !== round2(amount)
      ? "Amount changed — check how it is shared, then save"
      : "Draft filled in — check it, then save");
  };

  const save = async () => {
    if (!valid) return;
    buzz(14);
    const payload = {
      type: t.type, date: t.date, amount: round2(amount),
      account: paidByOther ? null : t.account,
      to: t.type === "Transfer" ? t.to : null,
      cat: t.type === "Transfer" ? null : t.cat,
      ret: t.ret, method: t.method, notes: t.notes,
      status: t.status, exclude: !!t.exclude, tags: t.tags || [],
      payer: t.type === "Transfer" ? null : (t.payer || null),
      mySettled: !!t.mySettled, includeMe: t.includeMe !== false,
      splits: t.splits && t.splits.length ? t.splits.map((x) => ({ cat: x.cat, amount: round2(x.amount), note: x.note || "" })) : null,
      shares: t.shares && t.shares.length ? t.shares.map((x) => ({ ...x, person: x.person, amount: round2(x.amount), settled: !!x.settled })) : null,
    };
    if (t.id) await s.update("txns", t.id, payload);
    else await s.add("txns", { ...payload, book: s.activeBook });
    toast(t.id ? "Transaction updated" : "Saved");
    onDone();
  };

  const typeColor = t.type === "Income" ? "var(--in)" : t.type === "Transfer" ? "var(--tr)" : "var(--ink)";
  const dateChip = t.date === isoToday() ? "today" : t.date === yesterday() ? "yesterday" : "other";

  const Chip = ({ on, onClick, children, style }) => (
    <button className={"vy-chip" + (on ? " on" : "")} style={style} onClick={() => { buzz(5); onClick(); }}>{children}</button>
  );

  return (
    <div className="vy-screen push-enter">
      <div className="vy-nav">
        <button className="vy-iconbtn" onClick={() => { buzz(5); onDone(); }} aria-label="Close"><X size={20} /></button>
        <div className="vy-nav-t">{t.id ? "Edit" : "New"} {t.type.toLowerCase()}</div>
        {/*
          * New entries only. On an edit, one sentence would overwrite a saved record's amount and
          * category in a single tap, and on a settlement it would repoint the IOU's clearedBy at
          * something else entirely. Fetching the chunk on press hides its load behind the tap.
          */}
        {!t.id && (
          <button className="vy-iconbtn" onPointerDown={loadQuickDraft} onFocus={loadQuickDraft}
            onClick={() => { buzz(5); setShowQuick(true); }} aria-label="Quick add by voice or text"><Mic size={18} /></button>
        )}
      </div>

      <div className="vy-pad">
        <Seg value={t.type} onChange={switchType}
          options={[{ v: "Expense", l: "Expense" }, { v: "Income", l: "Income" }, { v: "Transfer", l: "Transfer" }]} />
      </div>

      <div className="vy-amt" onClick={() => amtRef.current && amtRef.current.focus()}>
        <div className="vy-amtin">
          <span className="cur" style={{ color: raw === "" ? "var(--line2)" : "var(--muted)" }}>
            {fmt(0, { currency: s.currency }).replace(/[\d.,]/g, "")}
          </span>
          <input ref={amtRef} inputMode="decimal" type="text" placeholder="0" value={raw}
            style={{ color: raw === "" ? undefined : typeColor }} onChange={onAmount} aria-label="Amount" />
        </div>
        {t.splits && (
          <div className="vy-sub" style={{ marginTop: 8 }}>
            split across {t.splits.length} · {Math.abs(splitTotal - amount) < 0.01
              ? "balanced"
              : <span style={{ color: "var(--out)" }}>{fmt(amount - splitTotal, { currency: s.currency })} unassigned</span>}
          </div>
        )}
      </div>

      <div className="vy-body">
        <div className="vy-pad">
          {/* 1. Category — the thing you pick most */}
          {t.type !== "Transfer" && (
            <>
              <label className="vy-flabel">
                Category
                {!cat && <span className="hint">required</span>}
              </label>
              <div className="vy-wrap">
                {shownCats.map((c) => (
                  <Chip key={c.id} on={t.cat === c.id} onClick={() => set("cat", c.id)}>
                    <Ic n={c.icon} size={14} style={{ color: t.cat === c.id ? undefined : c.color }} />{c.name}
                  </Chip>
                ))}
                <Chip on={false} onClick={() => setPick("cat")}><MoreHorizontal size={15} />All</Chip>
              </div>
            </>
          )}

          {/* 2. Accounts */}
          {t.type === "Transfer" ? (
            <>
              <label className="vy-flabel">From</label>
              <div className="vy-wrap">
                {s.activeAccounts.map((a) => (
                  <Chip key={a.id} on={t.account === a.id} onClick={() => set("account", a.id)}>
                    <Ic n={ACCOUNT_ICON[a.type] || "Wallet"} size={14} style={{ color: t.account === a.id ? undefined : a.color }} />{a.name}
                  </Chip>
                ))}
              </div>
              <label className="vy-flabel">To</label>
              <div className="vy-wrap">
                {s.activeAccounts.filter((a) => a.id !== t.account).map((a) => (
                  <Chip key={a.id} on={t.to === a.id} onClick={() => set("to", a.id)}>
                    <Ic n={ACCOUNT_ICON[a.type] || "Wallet"} size={14} style={{ color: t.to === a.id ? undefined : a.color }} />{a.name}
                  </Chip>
                ))}
              </div>
            </>
          ) : paidByOther ? (
            <>
              <label className="vy-flabel">Account</label>
              <div className="vy-note">
                {(s.personById[t.payer] || {}).name || "Someone"} paid this one, so none of your accounts move.
                You owe them {fmt(myShareOf({ amount, shares: t.shares }), { currency: s.currency })}.
              </div>
            </>
          ) : (
            <>
              <label className="vy-flabel">
                {t.type === "Income" ? "Into" : "Paid from"}
                {!account && <span className="hint">required</span>}
              </label>
              <div className="vy-wrap">
                {s.activeAccounts.map((a) => (
                  <Chip key={a.id} on={t.account === a.id} onClick={() => set("account", a.id)}>
                    <Ic n={ACCOUNT_ICON[a.type] || "Wallet"} size={14} style={{ color: t.account === a.id ? undefined : a.color }} />{a.name}
                  </Chip>
                ))}
              </div>
            </>
          )}

          {/* 3. Payment method */}
          {s.methods.length > 0 && (
            <>
              <label className="vy-flabel">Payment method</label>
              <div className="vy-wrap">
                {s.methods.map((m) => (
                  <Chip key={m.id} on={t.method === m.id} onClick={() => set("method", t.method === m.id ? null : m.id)}>
                    <Ic n={m.icon || "CreditCard"} size={14} />{m.name}
                  </Chip>
                ))}
              </div>
            </>
          )}

          {/* 4. When */}
          <label className="vy-flabel">When</label>
          <div className="vy-wrap">
            <Chip on={dateChip === "today"} onClick={() => set("date", isoToday())}>Today</Chip>
            <Chip on={dateChip === "yesterday"} onClick={() => set("date", yesterday())}>Yesterday</Chip>
            <Chip on={dateChip === "other"} onClick={() => setPick("date")}>
              <Calendar size={14} />{dateChip === "other" ? relDay(t.date) : "Pick a date"}
            </Chip>
          </div>

          {/* 5. Merchant */}
          {t.type !== "Transfer" && (
            <>
              <label className="vy-flabel">Merchant <span className="hint">optional</span></label>
              <div className="vy-fieldset">
                <Field label="" icon={<Building2 size={17} />} value={retailer ? retailer.name : "None"} empty={!retailer}
                  onClick={() => setPick("ret")} />
              </div>
            </>
          )}

          {/* 6. Note — a single, properly styled box */}
          <label className="vy-flabel">Note <span className="hint">optional</span></label>
          <textarea className="vy-noteinput" rows={2} placeholder="What was this for?"
            value={t.notes} onChange={(e) => set("notes", e.target.value)} />

          {/* 7. Tags */}
          {s.tags.length > 0 && (
            <>
              <label className="vy-flabel">Tags <span className="hint">optional</span></label>
              <div className="vy-wrap">
                {s.tags.map((tag) => {
                  const on = (t.tags || []).includes(tag.id);
                  return (
                    <Chip key={tag.id} on={on} onClick={() => setT((p) => ({
                      ...p, tags: on ? (p.tags || []).filter((x) => x !== tag.id) : [...(p.tags || []), tag.id],
                    }))}>
                      <TagIcon size={13} style={{ color: on ? undefined : tag.color }} />{tag.name}
                    </Chip>
                  );
                })}
              </div>
            </>
          )}

          {/* 8. Shared bill — adding a person is what makes it shared */}
          {t.type !== "Transfer" && (
            <>
              <label className="vy-flabel">Shared with <span className="hint">optional</span></label>
              <SplitEditor t={t} setT={setT} amount={amount} s={s} nav={nav} />
            </>
          )}

          {/* 9. The rarely-touched bits, still visible */}
          <label className="vy-flabel">Options</label>
          <div className="vy-card">
            <div className="vy-optline">
              <div className="t"><b>Status</b><span>Cleared unless the money has not moved yet</span></div>
              <div style={{ display: "flex", gap: 6 }}>
                {["Cleared", "Pending"].map((v) => (
                  <button key={v} className={"vy-chip" + (t.status === v ? " on" : "")}
                    style={{ padding: "7px 12px", fontSize: 13 }}
                    onClick={() => { buzz(5); set("status", v); }}>{v}</button>
                ))}
              </div>
            </div>
            <div className="vy-optline">
              <div className="vy-row-ic neutral"><EyeOff size={18} /></div>
              <div className="t"><b>Hide from reports</b><span>Still changes your balance</span></div>
              <Switch on={t.exclude} label="Hide from reports" onChange={(v) => set("exclude", v)} />
            </div>
            <div className="vy-optline" onClick={() => { buzz(5); nav.push("entryDefaults"); }} style={{ cursor: "pointer" }}>
              <div className="vy-row-ic neutral"><Settings2 size={18} /></div>
              <div className="t"><b>Change what this form starts with</b><span>Default account, category and payment method</span></div>
              <ArrowRight size={17} style={{ color: "var(--muted)" }} />
            </div>
          </div>

          <div style={{ height: 16 }} />
        </div>
      </div>

      <div className="vy-foot">
        <button className="vy-btn accent" disabled={!valid} onClick={save}>
          <Check size={19} />{t.id ? "Update" : "Save"}{amount > 0 ? ` ${fmt(amount, { currency: s.currency })}` : ""}
        </button>
      </div>

      <PickerSheet open={pick === "cat"} onClose={() => setPick(null)} title="Category" searchable items={catList} value={t.cat}
        onPick={(id) => set("cat", id)} emptyHint="Add categories in master data first." onAddNew={() => nav.push("categories")} />
      <PickerSheet open={pick === "ret"} onClose={() => setPick(null)} title="Merchant" searchable value={t.ret}
        items={s.retailers.map((r) => ({ ...r, icon: "Building2" }))} emptyHint="Merchants are optional — add them any time."
        onAddNew={() => nav.push("retailers")}
        onPick={(id) => { set("ret", id); const r = s.retById[id]; if (r && r.defaultCat && !t.cat) set("cat", r.defaultCat); }} />
      <Sheet open={pick === "date"} onClose={() => setPick(null)} title="Date">
        <DatePick value={t.date} onPick={(d) => { set("date", d); setPick(null); }} />
      </Sheet>
      {showQuick && (
        <React.Suspense fallback={null}>
          <QuickDraft open={showQuick} onClose={() => setShowQuick(false)} s={s} fallbackType={t.type}
            autoListen onApply={applyDraft} />
        </React.Suspense>
      )}
    </div>
  );
}
