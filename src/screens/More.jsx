import React, { useEffect, useState } from "react";
import {
  Wallet, Layers, Building2, CreditCard, Users, BookOpen, Target, PiggyBank, Repeat,
  Wand2, Database, ChevronDown, ChevronRight, Moon, Sun, EyeOff, Lock, Shield, Tag as TagIcon, Scale, Settings2,
  RefreshCw, Check, ArrowUpCircle,
} from "lucide-react";
import { LayoutGrid } from "lucide-react";
import { Nav, Switch, useToast } from "../components/ui.jsx";
import { checkForUpdate } from "../lib/pwa.js";
import { APP_VERSION, APP_BUILD } from "../lib/version.js";
import { Ic } from "../lib/icons.jsx";
import { tint } from "../lib/color.js";
import { fmt, buzz, sum } from "../lib/money.js";

export default function More({ s, nav }) {
  const toast = useToast();
  const [update, setUpdate] = useState({ state: "idle" });

  /* If a new build downloaded while the app was open, say so without being asked. */
  useEffect(() => {
    const onReady = (e) => setUpdate({ state: "ready", apply: e.detail.apply });
    window.addEventListener("vyay:update-ready", onReady);
    return () => window.removeEventListener("vyay:update-ready", onReady);
  }, []);

  const runUpdateCheck = async () => {
    if (update.state === "checking") return;
    buzz(6);
    if (update.state === "ready" && update.apply) {
      toast("Updating\u2026");
      update.apply();
      return;
    }
    setUpdate({ state: "checking" });
    const result = await checkForUpdate();
    setUpdate(result);
    if (result.state === "current") toast("You are on the latest version");
    else if (result.state === "ready") toast("Update downloaded \u2014 tap to restart");
    else if (result.state === "downloading") toast("Downloading the update\u2026");
    else if (result.state === "offline") toast("No connection, so nothing to check against");
    else if (result.state === "not-registered") toast("Reload once online to enable updates");
    else toast("Updates need the app served over https");
  };

  const updateCopy = {
    idle: "Check whether a newer build is available",
    checking: "Looking for a new version\u2026",
    current: `You are on the latest version \u00b7 build ${APP_BUILD}`,
    ready: "A new version is ready \u2014 tap to restart",
    downloading: "Downloading in the background",
    offline: "No connection, try again later",
    "not-registered": "Reload once while online to enable updates",
    unsupported: "Needs the app served over https",
  }[update.state] || "Check for a newer build";
  const priv = s.settings.privacy;
  const netWorth = sum(s.activeAccounts.filter((a) => a.includeNet !== false).map((a) => s.balances[a.id] || 0));

  const masters = [
    ["accounts", "Accounts", Wallet, `${s.activeAccounts.length} active`, "var(--accent)"],
    ["categories", "Categories", Layers, `${s.categories.length} set up`, "var(--tr)"],
    ["retailers", "Merchants", Building2, `${s.retailers.length} saved`, "var(--warn)"],
    ["methods", "Payment methods", CreditCard, `${s.methods.length} set up`, "var(--in)"],
    ["tags", "Tags", TagIcon, `${s.tags.length} set up`, "var(--out)"],
    ["people", "People", Users, `${s.people.length} added`, "var(--accent)"],
    ["books", "Books", BookOpen, `${s.state.books.length} book${s.state.books.length === 1 ? "" : "s"}`, "var(--tr)"],
  ];

  const planning = [
    ["budgets", "Budgets", Target, `${s.budgets.length} set`, "var(--warn)"],
    ["goals", "Goals", PiggyBank, `${s.goals.length} in progress`, "var(--in)"],
    ["recurring", "Recurring", Repeat, `${s.recurring.length} scheduled`, "var(--tr)"],
    ["rules", "Auto-categorise", Wand2, `${s.rules.length} rule${s.rules.length === 1 ? "" : "s"}`, "var(--accent)"],
    ["settle", "Settle up", Users, null, "var(--in)"],
  ];

  const entry = [
    ["entryDefaults", "Entry defaults", Settings2, "What a new transaction starts with", "var(--accent)"],
    ["quickCats", "Quick picks", LayoutGrid, "Category chips on the add screen", "var(--tr)"],
  ];

  const Group = ({ items }) => (
    <div className="vy-group">
      {items.map(([key, label, I, sub, color]) => (
        <div key={key} className="vy-row" onClick={() => { buzz(5); nav.push(key); }}>
          <div className="vy-row-ic" style={{ background: tint(color), color }}><I size={18} /></div>
          <div className="vy-row-m"><b>{label}</b>{sub && <span>{sub}</span>}</div>
          <ChevronRight size={17} style={{ color: "var(--muted)" }} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="vy-screen fade-enter">
      <Nav title="More" big />
      <div className="vy-body">
        <div className="vy-pad">
          {s.book && (
            <div className="vy-card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 13 }} onClick={() => nav.sheet("books")}>
              <div className="vy-row-ic lg" style={{ width: 46, height: 46, borderRadius: 15, background: tint((s.book.color || "#C87A15")), color: s.book.color || "#C87A15" }}>
                <Ic n={s.book.icon || "Wallet"} size={21} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 16, fontWeight: 630, letterSpacing: "-.02em" }}>{s.book.name}</b>
                <div className="vy-sub" style={{ marginTop: 2 }}>
                  {s.book.type} · <span className={priv ? "vy-blur" : ""}>{fmt(netWorth, { currency: s.currency, compact: true })}</span>
                </div>
              </div>
              <ChevronDown size={18} style={{ color: "var(--muted)" }} />
            </div>
          )}

          <div className="vy-sec"><h3>Master data</h3></div>
          <Group items={masters} />

          <div className="vy-sec"><h3>Planning</h3></div>
          <Group items={planning} />

          <div className="vy-sec"><h3>Adding transactions</h3></div>
          <Group items={entry} />

          <div className="vy-sec"><h3>App</h3></div>
          <div className="vy-group">
            <div className="vy-row" style={{ cursor: "default" }}>
              <div className="vy-row-ic" style={{ background: tint("var(--tr)"), color: "var(--tr)" }}>
                {s.settings.theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
              </div>
              <div className="vy-row-m"><b>Dark mode</b><span>{s.settings.theme === "system" ? "Following your phone" : s.settings.theme === "dark" ? "On" : "Off"}</span></div>
              <Switch on={s.settings.theme === "dark"} label="Dark mode"
                onChange={(v) => s.setSetting("theme", v ? "dark" : "light")} />
            </div>
            <div className="vy-row" style={{ cursor: "default" }}>
              <div className="vy-row-ic" style={{ background: tint("var(--muted)"), color: "var(--muted)" }}><EyeOff size={18} /></div>
              <div className="vy-row-m"><b>Hide amounts</b><span>Blur every figure on screen</span></div>
              <Switch on={priv} label="Hide amounts" onChange={(v) => s.setSetting("privacy", v)} />
            </div>
            <div className="vy-row" style={{ cursor: "default" }}>
              <div className="vy-row-ic" style={{ background: tint("var(--in)"), color: "var(--in)" }}><Scale size={18} /></div>
              <div className="vy-row-m">
                <b>Count only my share</b>
                <span>On a bill you paid for others, report just your part as spending</span>
              </div>
              <Switch on={!!s.settings.onlyMyShare} label="Count only my share"
                onChange={(v) => s.setSetting("onlyMyShare", v)} />
            </div>
            <div className="vy-row" onClick={() => { buzz(5); nav.push("lockSetup"); }}>
              <div className="vy-row-ic" style={{ background: tint("var(--warn)"), color: "var(--warn)" }}><Lock size={18} /></div>
              <div className="vy-row-m"><b>App lock</b><span>{s.settings.lock ? "On — PIN required" : "Off"}</span></div>
              <ChevronRight size={17} style={{ color: "var(--muted)" }} />
            </div>
            <div className="vy-row" onClick={runUpdateCheck}>
              <div className="vy-row-ic" style={{
                background: update.state === "ready" ? "var(--in-soft)" : "var(--surface2)",
                color: update.state === "ready" ? "var(--in)" : "var(--ink2)" }}>
                {update.state === "checking"
                  ? <RefreshCw size={18} className="vy-spin" />
                  : update.state === "ready" ? <ArrowUpCircle size={18} />
                  : update.state === "current" ? <Check size={18} /> : <RefreshCw size={18} />}
              </div>
              <div className="vy-row-m">
                <b>{update.state === "ready" ? "Restart to update" : "Update the app"}</b>
                <span>{updateCopy}</span>
              </div>
              {update.state === "ready"
                ? <span className="vy-pill" style={{ background: "var(--in-soft)", color: "var(--in)" }}>Ready</span>
                : <ChevronRight size={17} style={{ color: "var(--muted)" }} />}
            </div>
          </div>

          <div className="vy-sec"><h3>Your data</h3></div>
          <div className="vy-group">
            <div className="vy-row" onClick={() => { buzz(5); nav.push("data"); }}>
              <div className="vy-row-ic" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Database size={18} /></div>
              <div className="vy-row-m"><b>Backup & export</b><span>JSON backup, CSV exports, restore, erase</span></div>
              <ChevronRight size={17} style={{ color: "var(--muted)" }} />
            </div>
          </div>

          <div className="vy-note" style={{ marginTop: 16, display: "flex", gap: 11, alignItems: "flex-start" }}>
            <Shield size={17} style={{ color: "var(--in)", flex: "0 0 auto", marginTop: 1 }} />
            <span>All {s.state.txns.length} transactions live in this device's own database. Nothing is uploaded anywhere, and the app runs with no connection at all.</span>
          </div>

          <div style={{ textAlign: "center", padding: "22px 0 0" }} className="vy-sub">Vyay {APP_VERSION} · build {APP_BUILD}</div>
        </div>
        <div className="vy-tabspace" />
      </div>
    </div>
  );
}
