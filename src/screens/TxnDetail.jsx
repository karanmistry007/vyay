import React, { useState } from "react";
import {
  Copy, Pencil, Trash2, ArrowLeftRight, ArrowDownLeft, Layers, Wallet, ArrowRight,
  CreditCard, EyeOff, CheckCircle2, Tag as TagIcon, Users, HandCoins, Calendar, Building2, FileText,
} from "lucide-react";
import { Nav, useToast } from "../components/ui.jsx";
import SettleSheet from "../components/SettleSheet.jsx";
import { Ic, ACCOUNT_ICON } from "../lib/icons.jsx";
import { tint } from "../lib/color.js";
import { fmt, buzz, sum, relDay, isoToday } from "../lib/money.js";
import { buildLedger, myShareOf } from "../lib/ledger.js";

const Line = ({ k, v, ic }) => (
  <div className="vy-field" style={{ cursor: "default" }}>
    {ic && <span className="k" style={{ display: "grid", placeItems: "center", color: "var(--muted)" }}>{ic}</span>}
    <span className="k">{k}</span>
    <span className="v" style={{ color: "var(--ink)" }}>{v}</span>
  </div>
);

export default function TxnDetail({ s, nav, id, onDelete }) {
  const toast = useToast();
  const t = s.state.txns.find((x) => x.id === id);
  if (!t) return <div className="vy-screen push-enter"><Nav title="Not found" onBack={nav.pop} /></div>;

  const cat = s.catById[t.cat];
  const account = s.accById[t.account];
  const retailer = s.retById[t.ret];
  const method = s.methById[t.method];
  const isTransfer = t.type === "Transfer";
  const priv = s.settings.privacy;
  const cur = s.currency;
  const tone = isTransfer ? "var(--tr)" : t.type === "Income" ? "var(--in)" : (cat && cat.color) || "var(--out)";

  const title = isTransfer
    ? `${account ? account.name : "?"} → ${s.accById[t.to] ? s.accById[t.to].name : "?"}`
    : retailer ? retailer.name : cat ? cat.name : "Transaction";

  const duplicate = async () => {
    buzz(8);
    const { id: _drop, createdAt, updatedAt, ...rest } = t;
    await s.add("txns", { ...rest, date: isoToday() });
    toast("Copied to today");
    nav.pop();
  };

  const [settling, setSettling] = useState(null);

  /* Clearing the IOU and recording the money are one action. */
  const runSettle = async ({ account, date, noMoney }) => {
    const target = settling;
    if (!target) return;
    await s.settleDebt({
      person: target.person, amount: target.amount, direction: target.direction,
      account, date, noMoney,
      links: [{ txn: t.id, share: target.kind === "share" ? target.person : null }],
      clear: async (settlementId) => {
        if (target.kind === "mine") {
          await s.update("txns", t.id, { mySettled: true, myClearedBy: settlementId });
        } else {
          await s.update("txns", t.id, {
            shares: t.shares.map((x) => (x.person === target.person ? { ...x, settled: true, clearedBy: settlementId } : x)),
          });
        }
      },
    });
    toast(noMoney ? "Settled" : "Settled and recorded");
    setSettling(null);
  };

  const mine = myShareOf(t);
  const payer = t.payer ? s.personById[t.payer] : null;
  const others = (t.shares || []).filter((sh) => sh.person !== t.payer);
  const rows = buildLedger([t]);

  return (
    <div className="vy-screen push-enter">
      <Nav title="" onBack={nav.pop} right={
        <>
          <button className="vy-iconbtn" onClick={duplicate} aria-label="Duplicate"><Copy size={18} /></button>
          <button className="vy-iconbtn" onClick={() => nav.push("edit", { id: t.id })} aria-label="Edit"><Pencil size={18} /></button>
        </>} />

      <div className="vy-body">
        <div className="vy-pad">
          {/* headline card, in the same language as every other screen */}
          <div className="vy-hero" style={{ textAlign: "center", paddingTop: 26 }}>
            <div className="vy-row-ic lg" style={{ width: 58, height: 58, borderRadius: 20, background: tint(tone), color: tone, margin: "0 auto 16px" }}>
              {isTransfer ? <ArrowLeftRight size={26} /> : t.type === "Income" ? <ArrowDownLeft size={26} /> : <Ic n={cat ? cat.icon : "Tag"} size={26} />}
            </div>
            <div className={"vy-hero-amt" + (priv ? " vy-blur" : "")}
              style={{ fontSize: 44, color: t.type === "Income" ? "var(--in)" : "var(--ink)" }}>
              {t.type === "Income" ? "+" : isTransfer ? "" : "−"}{fmt(t.amount, { currency: cur })}
            </div>
            <div className="vy-h2" style={{ marginTop: 12, fontSize: 18 }}>{title}</div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center", marginTop: 14 }}>
              <span className="vy-pill" style={{ background: "var(--surface2)", color: "var(--ink2)" }}>
                <Calendar size={12} />{relDay(t.date)}
              </span>
              <span className="vy-pill" style={{
                background: t.status === "Cleared" ? "var(--in-soft)" : "var(--warn-soft)",
                color: t.status === "Cleared" ? "var(--in)" : "var(--warn)" }}>
                {t.status || "Cleared"}
              </span>
              {t.exclude && (
                <span className="vy-pill" style={{ background: "var(--surface2)", color: "var(--muted)" }}>
                  <EyeOff size={12} />Hidden from reports
                </span>
              )}
            </div>

            {(t.tags || []).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center", marginTop: 10 }}>
                {t.tags.map((tid) => {
                  const tag = s.tagById[tid];
                  if (!tag) return null;
                  return (
                    <span key={tid} className="vy-pill" style={{ background: tint(tag.color), color: tag.color }}>
                      <TagIcon size={12} />{tag.name}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* details */}
          <div className="vy-sec"><h3>Details</h3></div>
          <div className="vy-fieldset">
            {!isTransfer && <Line k="Category" v={cat ? cat.name : "Not set"} ic={<Layers size={17} />} />}
            {t.payer
              ? <Line k="Paid by" v={`${payer ? payer.name : "Someone"} · not your money`} ic={<Users size={17} />} />
              : <Line k={isTransfer ? "From" : "Account"} v={account ? account.name : "Not set"}
                  ic={<Ic n={account ? (ACCOUNT_ICON[account.type] || "Wallet") : "Wallet"} size={17} />} />}
            {isTransfer && <Line k="To" v={s.accById[t.to] ? s.accById[t.to].name : "Not set"} ic={<ArrowRight size={17} />} />}
            {retailer && !isTransfer && <Line k="Merchant" v={retailer.name} ic={<Building2 size={17} />} />}
            <Line k="Payment" v={method ? method.name : "Not set"} ic={<CreditCard size={17} />} />
            {t.notes && <Line k="Note" v={t.notes} ic={<FileText size={17} />} />}
          </div>

          {/* split across categories */}
          {t.splits && t.splits.length > 0 && (
            <>
              <div className="vy-sec"><h3>Split across categories</h3></div>
              <div className="vy-group">
                {t.splits.map((sp, i) => {
                  const sc = s.catById[sp.cat];
                  return (
                    <div key={i} className="vy-row" style={{ cursor: "default" }}>
                      <div className="vy-row-ic" style={{ background: tint((sc ? sc.color : "#8E8E93")), color: sc ? sc.color : "var(--muted)" }}>
                        <Ic n={sc ? sc.icon : "Tag"} size={18} />
                      </div>
                      <div className="vy-row-m"><b>{sc ? sc.name : "Not set"}</b>{sp.note && <span>{sp.note}</span>}</div>
                      <div className="vy-row-a">
                        <b className={priv ? "vy-blur" : ""}>{fmt(sp.amount, { currency: cur })}</b>
                        <span>{Math.round((sp.amount / t.amount) * 100)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* who owes whom */}
          {t.shares && t.shares.length > 0 && (
            <>
              <div className="vy-sec">
                <h3>Who owes whom</h3>
                <span className="vy-sub">your share {fmt(mine, { currency: cur })}</span>
              </div>
              <div className="vy-group">
                {t.payer && mine > 0 && (
                  <div className="vy-row"
                    style={{ cursor: t.myClearedBy && t.myClearedBy !== "none" ? "pointer" : "default" }}
                    onClick={() => { if (t.myClearedBy && t.myClearedBy !== "none") nav.push("txn", { id: t.myClearedBy }); }}>
                    <div className="vy-row-ic" style={{ background: t.mySettled ? "var(--icon-neutral)" : "var(--out-soft)", color: t.mySettled ? "var(--ink2)" : "var(--out)" }}>
                      <HandCoins size={18} />
                    </div>
                    <div className="vy-row-m">
                      <b>You owe {payer ? payer.name : "them"}</b>
                      <span>
                        {t.mySettled
                          ? (t.myClearedBy && t.myClearedBy !== "none" ? "settled · tap to see the payment" : "settled")
                          : "still open"}
                      </span>
                    </div>
                    {t.mySettled ? <CheckCircle2 size={19} style={{ color: "var(--in)" }} /> : (
                      <>
                        <div className="vy-row-a" style={{ marginRight: 10 }}>
                          <b className={priv ? "vy-blur" : ""} style={{ color: "var(--out)" }}>{fmt(mine, { currency: cur })}</b>
                        </div>
                        <button className="vy-chip on" style={{ padding: "8px 14px", fontSize: 13 }}
                          onClick={() => { buzz(8); setSettling({ kind: "mine", person: t.payer, amount: mine, direction: "out" }); }}>
                          Settle
                        </button>
                      </>
                    )}
                  </div>
                )}
                {others.map((sh) => {
                  const p = s.personById[sh.person];
                  return (
                    <div key={sh.person} className="vy-row" style={{ cursor: "default" }}>
                      <div className="vy-row-ic" style={{ background: tint((p ? p.color : "#8E8E93")), color: p ? p.color : "var(--muted)", fontWeight: 800, fontSize: 15 }}>
                        {p ? p.name[0] : "?"}
                      </div>
                      <div className="vy-row-m">
                        <b>{p ? p.name : "Removed"} owes {payer ? payer.name : "you"}</b>
                        <span>
                          {sh.settled
                            ? (sh.clearedBy && sh.clearedBy !== "none" ? "settled · tap to see the payment"
                              : sh.clearedBy === "none" ? "settled, no money moved" : "settled")
                            : t.payer ? "not your balance" : "owes you"}
                        </span>
                      </div>
                      {sh.settled ? <CheckCircle2 size={19} style={{ color: "var(--in)" }} /> : (
                        <>
                          <div className="vy-row-a" style={{ marginRight: t.payer ? 0 : 10 }}>
                            <b className={priv ? "vy-blur" : ""} style={{ color: t.payer ? "var(--ink2)" : "var(--in)" }}>
                              {fmt(sh.amount, { currency: cur })}
                            </b>
                          </div>
                          {!t.payer && (
                            <button className="vy-chip on" style={{ padding: "8px 14px", fontSize: 13 }}
                              onClick={() => { buzz(8); setSettling({ kind: "share", person: sh.person, amount: sh.amount, direction: "in" }); }}>
                              Settle
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                {t.payer && (t.shares || []).some((sh) => sh.person === t.payer) && (
                  <div className="vy-row" style={{ cursor: "default" }}>
                    <div className="vy-row-ic neutral"><CheckCircle2 size={18} /></div>
                    <div className="vy-row-m"><b>{payer ? payer.name : "The payer"}’s own share</b><span>nothing to collect</span></div>
                    <div className="vy-row-a">
                      <b className={priv ? "vy-blur" : ""} style={{ color: "var(--muted)" }}>
                        {fmt((t.shares.find((sh) => sh.person === t.payer) || {}).amount || 0, { currency: cur })}
                      </b>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* what the ledger engine wrote */}
          <div className="vy-sec"><h3>Ledger</h3><span className="vy-sub">{rows.length} row{rows.length === 1 ? "" : "s"}</span></div>
          <div className="vy-group">
            {rows.map((row, i) => (
              <div key={i} className="vy-row" style={{ cursor: "default" }}>
                <div className="vy-row-ic" style={{ background: row.amount < 0 ? "var(--out-soft)" : "var(--in-soft)", color: row.amount < 0 ? "var(--out)" : "var(--in)" }}>
                  {row.amount < 0 ? <ArrowRight size={17} /> : <ArrowDownLeft size={17} />}
                </div>
                <div className="vy-row-m">
                  <b>{row.account && s.accById[row.account] ? s.accById[row.account].name : "No account"}</b>
                  <span>{row.kind}{row.cat && s.catById[row.cat] ? " · " + s.catById[row.cat].name : ""}</span>
                </div>
                <div className="vy-row-a">
                  <b className={priv ? "vy-blur" : ""} style={{ color: row.amount < 0 ? "var(--out)" : "var(--in)" }}>
                    {fmt(row.amount, { currency: cur, sign: true })}
                  </b>
                </div>
              </div>
            ))}
          </div>
          {t.payer && (
            <div className="vy-sub" style={{ margin: "12px 4px 0", lineHeight: 1.45 }}>
              No account moved because {payer ? payer.name : "someone else"} paid. Only your share counts as your spending.
            </div>
          )}

          <div className="vy-sec"><h3>Manage</h3></div>
          <div className="vy-tiles">
            <button className="vy-tile" onClick={duplicate}>
              <span className="ic"><Copy size={19} /></span>
              <span><b>Duplicate</b><span>Copy this to today</span></span>
            </button>
            <button className="vy-tile" onClick={() => { buzz(6); nav.push("edit", { id: t.id }); }}>
              <span className="ic"><Pencil size={19} /></span>
              <span><b>Edit</b><span>Change any detail</span></span>
            </button>
          </div>

          {t.settles && (
            <>
              <div className="vy-sec">
                <h3>Settles</h3>
                <span className="vy-sub">
                  with {(s.personById[t.settles.person] || {}).name || "someone"}
                </span>
              </div>
              {(t.settles.links || []).length > 0 ? (
                <div className="vy-group">
                  {t.settles.links.map((link, i) => {
                    const bill = s.state.txns.find((x) => x.id === link.txn);
                    const bc = bill ? s.catById[bill.cat] : null;
                    const br = bill ? s.retById[bill.ret] : null;
                    return (
                      <div key={i} className="vy-row" onClick={() => bill && nav.push("txn", { id: bill.id })}>
                        <div className="vy-row-ic" style={{ background: tint((bc && bc.color) || "#8E8E93"), color: (bc && bc.color) || "var(--muted)" }}>
                          <Ic n={(bc && bc.icon) || "Receipt"} size={18} />
                        </div>
                        <div className="vy-row-m">
                          <b>{br ? br.name : bc ? bc.name : "That bill"}</b>
                          <span>{bill ? `${relDay(bill.date)} · ${fmt(bill.amount, { currency: cur })}` : "no longer in your records"}</span>
                        </div>
                        {bill && <ArrowRight size={17} style={{ color: "var(--muted)" }} />}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="vy-note">Recorded before links were kept, so the exact bills are not listed.</div>
              )}
              <div className="vy-note" style={{ marginTop: 12 }}>
                Money moving to square up, not new spending — so it changes the account balance but stays
                out of your reports. The original bill is already counted there.
              </div>
            </>
          )}

          <button className="vy-btn danger" style={{ marginTop: 12 }} onClick={() => { onDelete(t); nav.pop(); }}>
            <Trash2 size={18} />Delete transaction
          </button>
        </div>
        <div className="vy-tabspace" />
      </div>

      <SettleSheet open={!!settling} onClose={() => setSettling(null)} s={s}
        person={settling ? s.personById[settling.person] : null}
        amount={settling ? settling.amount : 0}
        direction={settling ? settling.direction : "in"}
        onConfirm={runSettle} />
    </div>
  );
}
