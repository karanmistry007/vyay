import React, { useEffect, useRef, useState } from "react";
import { Download, Upload, Trash2, Database, FileText, Shield, HardDrive, WifiOff, CloudOff, Check } from "lucide-react";
import { Nav, Confirm, useToast } from "../components/ui.jsx";
import { buzz } from "../lib/money.js";
import { exportJSON, exportTransactionsCSV, exportMastersCSV, validateBackup, readFile } from "../lib/exporter.js";
import { estimateUsage, persistStorage, storageKind } from "../lib/db.js";
import { offlineStatus, watchConnection } from "../lib/pwa.js";

export default function DataManager({ s, nav }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [pending, setPending] = useState(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [usage, setUsage] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [offline, setOffline] = useState(null);
  const [online, setOnline] = useState(true);
  const [kind, setKind] = useState(null);

  useEffect(() => {
    estimateUsage().then(setUsage);
    if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(setPersisted);
    offlineStatus().then(setOffline);
    storageKind().then(setKind);
    return watchConnection(setOnline);
  }, []);

  const counts = {
    Transactions: s.state.txns.length,
    Accounts: s.state.accounts.length,
    Categories: s.state.categories.length,
    Merchants: s.state.retailers.length,
    "Payment methods": s.state.methods.length,
    People: s.state.people.length,
    Tags: s.state.tags.length,
    "Outstanding entries": s.state.peopleEntries.length,
    Books: s.state.books.length,
    Budgets: s.state.budgets.length,
    Goals: s.state.goals.length,
    Recurring: s.state.recurring.length,
    Rules: s.state.rules.length,
  };

  const pickFile = () => { buzz(6); fileRef.current && fileRef.current.click(); };

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await readFile(file);
      const parsed = JSON.parse(text);
      const problem = validateBackup(parsed);
      if (problem) return toast(problem);
      const total = (parsed.txns || []).length;
      setPending({ parsed, name: file.name, total });
    } catch (err) {
      toast("That file could not be read as a Vyay backup.");
    }
  };

  const doRestore = async () => {
    await s.replaceAll(pending.parsed);
    buzz(18);
    toast(`Restored ${pending.total} transactions`);
    setPending(null);
    nav.reset();
  };

  const doWipe = async () => {
    await s.wipe();
    buzz(24);
    toast("Everything erased");
    nav.reset();
  };

  const mb = (n) => (n / 1048576).toFixed(1) + " MB";

  return (
    <div className="vy-screen push-enter">
      <Nav title="Backup & export" onBack={nav.pop} />
      <div className="vy-body">
        <div className="vy-pad">
          <div className="vy-note" style={{ marginTop: 8, display: "flex", gap: 11, alignItems: "flex-start" }}>
            <Shield size={17} style={{ color: "var(--in)", flex: "0 0 auto", marginTop: 1 }} />
            <span>Nothing here touches the network. Files are written straight to your device's downloads folder.</span>
          </div>

          <div className="vy-sec"><h3>What's stored</h3></div>
          <div className="vy-card" style={{ padding: 16 }}>
            {Object.entries(counts).map(([k, v], i) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: i ? "1px solid var(--line)" : 0 }}>
                <span className="vy-sub">{k}</span>
                <span className="vy-num" style={{ fontSize: 13.5, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>

          {usage && (
            <div className="vy-card" style={{ padding: 15, marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
              <div className="vy-row-ic neutral"><HardDrive size={18} /></div>
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 14, fontWeight: 580 }}>{mb(usage.usage || 0)} used</b>
                <div className="vy-sub" style={{ marginTop: 2 }}>
                  {kind === "indexeddb" ? "Stored in this device's database" :
                   kind === "localstorage" ? "Stored in local storage (opened from a file)" :
                   kind === "memory" ? "In memory only — nothing survives a reload" : "Checking…"}
                </div>
              </div>
              {persisted === false && (
                <button className="vy-chip on" onClick={async () => {
                  const ok = await persistStorage();
                  setPersisted(ok);
                  toast(ok ? "Storage is now persistent" : "Your browser declined — keep taking backups");
                }}>Request</button>
              )}
            </div>
          )}

          {offline && (
            <div className="vy-card" style={{ padding: 15, marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
              <div className="vy-row-ic" style={{
                background: offline.ready ? "var(--in-soft)" : "var(--accent-soft)",
                color: offline.ready ? "var(--in)" : "var(--warn)",
              }}>
                {offline.ready ? <Check size={18} /> : <CloudOff size={18} />}
              </div>
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 14, fontWeight: 580 }}>{offline.ready ? "Works offline" : "Offline mode not active"}</b>
                <div className="vy-sub" style={{ marginTop: 2, lineHeight: 1.45 }}>{offline.reason}</div>
              </div>
              {!online && <WifiOff size={17} style={{ color: "var(--muted)" }} />}
            </div>
          )}

          <div className="vy-sec"><h3>Export</h3></div>
          <div className="vy-group">
            <div className="vy-row" onClick={() => { buzz(8); exportJSON(s.state); toast("Full backup downloaded"); }}>
              <div className="vy-row-ic" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Database size={18} /></div>
              <div className="vy-row-m"><b>Full backup (JSON)</b><span>Everything, every book. This is what restores.</span></div>
              <Download size={17} style={{ color: "var(--muted)" }} />
            </div>
            <div className="vy-row" onClick={() => {
              buzz(8);
              const n = exportTransactionsCSV(s.state, s.activeBook);
              toast(n ? `${n} rows exported` : "No transactions in this book yet");
            }}>
              <div className="vy-row-ic neutral"><FileText size={18} /></div>
              <div className="vy-row-m"><b>Transactions (CSV)</b><span>This book, names resolved, one row per split</span></div>
              <Download size={17} style={{ color: "var(--muted)" }} />
            </div>
            <div className="vy-row" onClick={() => {
              buzz(8);
              const n = exportMastersCSV(s.state, s.activeBook);
              toast(`${n} master records exported`);
            }}>
              <div className="vy-row-ic neutral"><FileText size={18} /></div>
              <div className="vy-row-m"><b>Master data (CSV)</b><span>Accounts, categories, merchants, methods, people</span></div>
              <Download size={17} style={{ color: "var(--muted)" }} />
            </div>
          </div>

          <div className="vy-sec"><h3>Restore</h3></div>
          <div className="vy-group">
            <div className="vy-row" onClick={pickFile}>
              <div className="vy-row-ic" style={{ background: "var(--tr-soft)", color: "var(--tr)" }}><Upload size={18} /></div>
              <div className="vy-row-m"><b>Restore from a backup</b><span>Replaces everything currently in the app</span></div>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} style={{ display: "none" }} />

          <div className="vy-sec"><h3>Danger zone</h3></div>
          <button className="vy-btn danger" onClick={() => { buzz(10); setConfirmWipe(true); }}>
            <Trash2 size={17} />Erase everything
          </button>
          <p className="vy-sub" style={{ marginTop: 10, lineHeight: 1.55 }}>
            Take a backup first. Erasing removes every book, master record and transaction from this device and cannot be undone.
          </p>
        </div>
        <div className="vy-tabspace" />
      </div>

      <Confirm open={!!pending} onClose={() => setPending(null)} onConfirm={doRestore}
        title="Restore this backup?" confirmLabel="Replace everything" danger
        body={pending ? `${pending.name} holds ${pending.total} transactions. Restoring wipes what's in the app now and puts the backup in its place.` : ""} />

      <Confirm open={confirmWipe} onClose={() => setConfirmWipe(false)} onConfirm={doWipe}
        title="Erase everything?" confirmLabel="Erase it all"
        body="Every book, account, category and transaction on this device will be deleted. There is no undo and no copy on a server." />
    </div>
  );
}
