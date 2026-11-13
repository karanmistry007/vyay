import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Home as HomeIcon, Layers, BarChart3, MoreHorizontal, Plus, Check, AlertCircle } from "lucide-react";
import { StoreProvider, useStore } from "./lib/store.jsx";
import { ToastHost, Sheet, useToast, Empty } from "./components/ui.jsx";
import { Ic } from "./lib/icons.jsx";
import { tint } from "./lib/color.js";
import { topSheet } from "./lib/backstack.js";
import { fmt, buzz, sum } from "./lib/money.js";
import { buildLedger, balancesFor } from "./lib/ledger.js";

import Onboarding from "./screens/Onboarding.jsx";
import Home from "./screens/Home.jsx";
import Txns from "./screens/Txns.jsx";
import Entry from "./screens/Entry.jsx";
import TxnDetail from "./screens/TxnDetail.jsx";
import Reports from "./screens/Reports.jsx";
import More from "./screens/More.jsx";
import Master from "./screens/Master.jsx";
import DataManager from "./screens/DataManager.jsx";
import EntryDefaults from "./screens/EntryDefaults.jsx";
import SettlementRepair from "./screens/SettlementRepair.jsx";
import TxnList from "./screens/TxnList.jsx";
import { AccountDetail, CategoryDetail, Settle, Alerts, LockSetup, LockScreen } from "./screens/Misc.jsx";
import PersonDetail from "./screens/PersonDetail.jsx";
import {
  accountsCfg, categoriesCfg, retailersCfg, methodsCfg, peopleCfg, tagsCfg,
  booksCfg, budgetsCfg, goalsCfg, recurringCfg, rulesCfg,
} from "./screens/masterConfigs.jsx";
import QuickCategories from "./screens/QuickCategories.jsx";

const MASTERS = {
  accounts: accountsCfg, categories: categoriesCfg, retailers: retailersCfg,
  methods: methodsCfg, people: peopleCfg, tags: tagsCfg, books: booksCfg,
  budgets: budgetsCfg, goals: goalsCfg, recurring: recurringCfg, rules: rulesCfg,
};

const TABS = [["home", "Home", HomeIcon], ["txns", "Activity", Layers], ["reports", "Reports", BarChart3], ["more", "More", MoreHorizontal]];

function Skeleton() {
  return (
    <div className="vy-screen">
      <div className="vy-nav"><div style={{ flex: 1 }}>
        <div className="vy-skel" style={{ width: 90, height: 12, marginBottom: 8 }} />
        <div className="vy-skel" style={{ width: 130, height: 22 }} />
      </div></div>
      <div className="vy-pad">
        <div className="vy-skel" style={{ height: 148, borderRadius: 26 }} />
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <div className="vy-skel" style={{ flex: 1, height: 74, borderRadius: 18 }} />
          <div className="vy-skel" style={{ flex: 1, height: 74, borderRadius: 18 }} />
        </div>
        <div className="vy-skel" style={{ width: 110, height: 15, margin: "26px 0 12px" }} />
        <div className="vy-skel" style={{ height: 190, borderRadius: 18 }} />
      </div>
    </div>
  );
}

function Shell() {
  const s = useStore();
  const toast = useToast();
  const [tab, setTab] = useState("home");
  const [stack, setStack] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [locked, setLocked] = useState(false);
  const lockedOnce = useRef(false);

  useEffect(() => {
    if (s.status === "ready" && s.settings.lock && s.settings.pin && !lockedOnce.current) {
      lockedOnce.current = true;
      setLocked(true);
    }
  }, [s.status, s.settings.lock, s.settings.pin]);

  /* ── device back button ───────────────────────────────────────────────
     Every pushed screen owns one history entry, and so does the first move
     away from the Home tab. Back then unwinds the app instead of closing it,
     and only exits once there is nothing left to go back to. */
  const layers = useRef([]);

  const pushLayer = useCallback((kind) => {
    layers.current = [...layers.current, kind];
    window.history.pushState({ vy: layers.current.length }, "");
  }, []);

  useEffect(() => {
    window.history.replaceState({ vy: 0 }, "");
  }, []);

  useEffect(() => {
    const onPop = (e) => {
      // A sheet swallows one press and hands the entry straight back.
      const sheetOnTop = topSheet();
      if (sheetOnTop) {
        sheetOnTop.close();
        window.history.pushState({ vy: layers.current.length }, "");
        return;
      }
      const target = e.state && typeof e.state.vy === "number" ? e.state.vy : 0;
      const removed = layers.current.slice(target);
      layers.current = layers.current.slice(0, target);
      if (!removed.length) return;
      if (removed.includes("tab")) setTab("home");
      const screens = removed.filter((k) => k === "screen").length;
      if (screens) setStack((st) => st.slice(0, Math.max(0, st.length - screens)));
      setSheet(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const goBack = useCallback(() => {
    if (layers.current.length) window.history.back();
  }, []);

  const changeTab = useCallback((next) => {
    buzz(5);
    setTab((currentTab) => {
      if (next === currentTab) return currentTab;
      if (next === "home" && layers.current.includes("tab")) { window.history.back(); return currentTab; }
      if (currentTab === "home" && next !== "home") pushLayer("tab");
      return next;
    });
  }, [pushLayer]);

  const nav = useMemo(() => ({
    push: (screen, params) => { setStack((st) => [...st, { screen, params: params || {} }]); pushLayer("screen"); },
    pop: () => goBack(),
    reset: () => {
      const depth = layers.current.length;
      if (depth) window.history.go(-depth);
      else { setStack([]); setSheet(null); }
    },
    tab: (t) => {
      const depth = layers.current.filter((k) => k === "screen").length;
      if (depth) window.history.go(-depth);
      setTab(t);
    },
    sheet: (name) => setSheet(name),
  }), [pushLayer, goBack]);

  /* A new build finished downloading, or the offline cache just filled for the first time. */
  useEffect(() => {
    const onUpdate = (e) => toast("A new version is ready", { label: "Reload", fn: e.detail.apply });
    const onOffline = () => toast("Ready to work offline");
    const onRepaired = (e) => {
      const { count, skipped } = e.detail;
      toast(skipped
        ? `Recorded ${count} missing settlement${count === 1 ? "" : "s"}, ${skipped} need an account`
        : `Recorded ${count} missing settlement${count === 1 ? "" : "s"}`);
    };
    window.addEventListener("vyay:update-ready", onUpdate);
    window.addEventListener("vyay:offline-ready", onOffline);
    window.addEventListener("vyay:settlements-repaired", onRepaired);
    return () => {
      window.removeEventListener("vyay:update-ready", onUpdate);
      window.removeEventListener("vyay:offline-ready", onOffline);
      window.removeEventListener("vyay:settlements-repaired", onRepaired);
    };
  }, [toast]);

  const deleteTxn = useCallback(async (t) => {
    await s.remove("txns", t.id);
    buzz(14);
    toast("Transaction deleted", { label: "Undo", fn: () => s.restore("txns", t) });
  }, [s, toast]);

  if (s.status === "loading") {
    return <div className="vy-app"><div className="vy-viewport"><div className="vy-stage"><Skeleton /></div></div></div>;
  }

  if (s.status === "error") {
    return (
      <div className="vy-app"><div className="vy-viewport"><div className="vy-stage">
        <div className="vy-screen">
          <Empty icon={<AlertCircle size={24} />} title="Storage unavailable"
            body={`Vyay could not open the device database: ${s.error}. Private browsing mode blocks it in some browsers.`} />
        </div>
      </div></div></div>
    );
  }

  if (s.needsOnboarding) {
    return <div className="vy-app"><div className="vy-viewport"><div className="vy-stage"><Onboarding s={s} /></div></div></div>;
  }

  const top = stack[stack.length - 1];

  const renderPushed = () => {
    if (!top) return null;
    const p = top.params;
    if (MASTERS[top.screen]) return <Master cfg={MASTERS[top.screen]} s={s} nav={nav} />;
    switch (top.screen) {
      case "add": return <Entry s={s} nav={nav} initialType={p.type} onDone={nav.pop} />;
      case "edit": return <Entry s={s} nav={nav} editId={p.id} onDone={nav.pop} />;
      case "txn": return <TxnDetail s={s} nav={nav} id={p.id} onDelete={deleteTxn} />;
      case "account": return <AccountDetail s={s} nav={nav} id={p.id} />;
      case "category": return <CategoryDetail s={s} nav={nav} id={p.id} />;
      case "settle": return <Settle s={s} nav={nav} />;
      case "person": return <PersonDetail s={s} nav={nav} id={p.id} />;
      case "quickCats": return <QuickCategories s={s} nav={nav} />;
      case "alerts": return <Alerts s={s} nav={nav} />;
      case "data": return <DataManager s={s} nav={nav} />;
      case "entryDefaults": return <EntryDefaults s={s} nav={nav} />;
      case "settlementRepair": return <SettlementRepair s={s} nav={nav} />;
      case "txnList": return <TxnList s={s} nav={nav} params={p} />;
      case "lockSetup": return <LockSetup s={s} nav={nav} />;
      default: return null;
    }
  };

  return (
    <div className="vy-app">
      <div className="vy-viewport">
        <div className="vy-stage">
          {tab === "home" && !top && <Home s={s} nav={nav} />}
          {tab === "txns" && !top && <Txns s={s} nav={nav} onDelete={deleteTxn} />}
          {tab === "reports" && !top && <Reports s={s} nav={nav} />}
          {tab === "more" && !top && <More s={s} nav={nav} />}
          {top && renderPushed()}

          {!top && (
            <div className="vy-tabs">
              <div className="vy-tabs-in">
                {/* the highlight slides between tabs, the same motion as the type selector */}
                <span className="thumb" aria-hidden="true"
                  style={{
                    width: `calc((100% - 16px) / ${TABS.length})`,
                    transform: `translateX(${Math.max(0, TABS.findIndex(([k]) => k === tab)) * 100}%)`,
                  }} />
                {TABS.map(([k, label, I]) => (
                  <button key={k} className={"vy-tab" + (tab === k ? " on" : "")} onClick={() => changeTab(k)}>
                    <I size={21} strokeWidth={tab === k ? 2.2 : 1.9} />{label}
                  </button>
                ))}
              </div>
              <button className="vy-fab" aria-label="Add transaction" onClick={() => { buzz(10); nav.push("add"); }}>
                <Plus size={26} strokeWidth={2.4} />
              </button>
            </div>
          )}

          <Sheet open={sheet === "books"} onClose={() => setSheet(null)} title="Your books">
            <div className="vy-group">
              {s.state.books.map((b) => {
                const accs = s.state.accounts.filter((a) => a.book === b.id);
                const led = buildLedger(s.state.txns.filter((t) => t.book === b.id));
                const bal = balancesFor(accs, led);
                const net = sum(accs.filter((a) => a.includeNet !== false).map((a) => bal[a.id] || 0));
                return (
                  <div key={b.id} className="vy-row" onClick={async () => {
                    buzz(8);
                    await s.setMeta("activeBook", b.id);
                    setSheet(null);
                    nav.reset();
                    toast(`Switched to ${b.name}`);
                  }}>
                    <div className="vy-row-ic" style={{ background: tint((b.color || "#C87A15")), color: b.color || "#C87A15" }}>
                      <Ic n={b.icon || "Wallet"} size={18} />
                    </div>
                    <div className="vy-row-m">
                      <b>{b.name}</b>
                      <span>{b.type} · {fmt(net, { currency: b.currency, compact: true })}</span>
                    </div>
                    {s.activeBook === b.id && <Check size={19} style={{ color: "var(--accent)" }} />}
                  </div>
                );
              })}
            </div>
            <button className="vy-btn soft" style={{ marginTop: 14 }} onClick={() => { setSheet(null); nav.push("books"); }}>
              Manage books
            </button>
          </Sheet>

          {locked && <LockScreen s={s} onUnlock={() => setLocked(false)} />}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <ThemeWrapper>
        <ToastHost><Shell /></ToastHost>
      </ThemeWrapper>
    </StoreProvider>
  );
}

function ThemeWrapper({ children }) {
  const s = useStore();
  const [systemDark, setSystemDark] = useState(
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)").matches : false
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = (e) => setSystemDark(e.matches);
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on); };
  }, []);
  const theme = s.settings.theme;
  const dark = theme === "dark" || (theme === "system" && systemDark);

  useEffect(() => {
    /*
     * The app paints itself, but the page behind it does not. With the app set
     * to dark while the system is light, the strip under the tab bar and the
     * overscroll area kept the light page colour and read as a white band.
     * html, body and color-scheme all have to follow the in-app theme.
     */
    const page = dark ? "#0E0E10" : "#EFEFF0";
    const chrome = dark ? "#0E0E10" : "#F5F5F6";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", chrome);
    document.documentElement.style.background = page;
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    if (document.body) document.body.style.background = page;
  }, [dark]);

  return <div className={"vy" + (dark ? " dark" : "")} style={{ height: "100%" }}>{children}</div>;
}
