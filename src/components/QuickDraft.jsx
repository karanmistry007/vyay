import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, Download, Sparkles, TriangleAlert, RefreshCw } from "lucide-react";
import { Sheet } from "./ui.jsx";
import { parseQuick, draftScore } from "../lib/quickParse.js";
import {
  voiceSupport, voiceOffText, listen, voiceErrorText, speechLangs, modelNeedsRefresh, refreshVoiceModel,
} from "../lib/voice.js";
import { fmt, buzz, relDay, isoToday } from "../lib/money.js";

/**
 * Quick add, by voice or by typing.
 *
 * Whatever was said becomes a draft shown field by field before anything touches the form,
 * because a misheard "fifteen" for "fifty" has to be caught here, not in next month's report.
 * "Use this draft" only fills the entry form; nothing is saved until Save is pressed there,
 * so the form's own validation still has the last word. Fields the sentence did not mention
 * are left as the form had them.
 */
export default function QuickDraft({ open, onClose, s, fallbackType, autoListen, onApply }) {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState({ state: "checking" });
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [vErr, setVErr] = useState(null);
  const [installing, setInstalling] = useState(false);
  const rec = useRef(null);
  const autoStarted = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const ctx = useMemo(() => ({
    today: isoToday(), currency: s.currency, dayFirst: s.currency !== "USD", fallbackType,
    categories: s.categories, accounts: s.activeAccounts, methods: s.methods, retailers: s.retailers, rules: s.rules,
  }), [s.currency, s.categories, s.activeAccounts, s.methods, s.retailers, s.rules, fallbackType]);
  const draft = useMemo(() => parseQuick(text, ctx), [text, ctx]);
  const heard = draftScore(draft) > 0 && (draft.amount != null || draft.cat || draft.account || draft.method || draft.ret || draft.date);

  const langs = useMemo(() => speechLangs(s.currency), [s.currency]);

  /* Each opening starts clean, and asks (once, cached) whether this browser can listen locally. */
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setText(""); setInterim(""); setVErr(null); autoStarted.current = false;
    voiceSupport(langs).then((v) => { if (alive) setVoice(v); });
    return () => { alive = false; if (rec.current) { rec.current.abort(); rec.current = null; } };
  }, [open, langs]);

  const [updating, setUpdating] = useState(false);
  const start = useCallback(async () => {
    if (voice.state !== "ready" || rec.current || updating) return;
    buzz(8); setVErr(null); setInterim("");
    /* First use after an app update: ask the browser for its newest model before listening. */
    if (modelNeedsRefresh(voice.lang)) {
      setUpdating(true);
      await refreshVoiceModel(voice.lang);
      if (!alive.current) return;   // closed while it was updating: do not open the mic behind it
      setUpdating(false);
    }
    setListening(true);
    rec.current = listen(voice.lang, {
      onInterim: (t) => setInterim(t),
      onFinal: (alts) => {
        /* The recogniser offers a few readings; keep the one that makes the most complete entry. */
        const best = alts
          .map((a, i) => ({ a, i, score: draftScore(parseQuick(a, ctx)) }))
          .sort((x, y) => y.score - x.score || x.i - y.i)[0];
        setText(best.a); setInterim(""); buzz(10);
      },
      onError: (code) => { const m = voiceErrorText(code); if (m) setVErr(m); },
      onEnd: () => { setListening(false); setInterim(""); rec.current = null; },
    });
  }, [voice, ctx, updating]);

  const stop = () => { if (rec.current) rec.current.stop(); };

  /* Opened from the mic, start listening; otherwise put the cursor in the box. Not both: the keyboard would cover the mic. */
  const inputRef = useRef(null);
  useEffect(() => {
    if (!open || voice.state === "checking" || autoStarted.current) return;
    autoStarted.current = true;
    if (autoListen && voice.state === "ready") start();
    else if (inputRef.current) inputRef.current.focus();
  }, [open, autoListen, voice.state, start]);

  const download = async () => {
    buzz(6); setInstalling(true); setVErr(null);
    const ok = (await refreshVoiceModel(voice.lang, 10 * 60 * 1000)) === true;
    setInstalling(false);
    const v = await voiceSupport(langs, { fresh: true });
    setVoice(v);
    if (!ok && v.state !== "ready" && v.state !== "downloading") setVErr("The speech model could not be set up. Typing works the same.");
  };
  /* Asking can take a few seconds now that a silent browser is waited out, so say it is asking. */
  const [checking, setChecking] = useState(false);
  const recheck = async () => {
    buzz(5); setChecking(true);
    const v = await voiceSupport(langs, { fresh: true });
    if (!alive.current) return;
    setChecking(false); setVoice(v);
  };

  const close = () => { if (rec.current) { rec.current.abort(); rec.current = null; } onClose(); };
  const apply = () => { if (!heard || listening) return; onApply(draft); };

  const cur = s.currency;
  const name = (by, id) => (by[id] || {}).name;
  const typeColor = draft.type === "Income" ? "var(--in)" : draft.type === "Transfer" ? "var(--tr)" : "var(--ink)";
  const rows = [];
  if (text.trim()) {
    rows.push({ k: "Type", v: draft.type, color: typeColor, hint: draft.typeFrom === "form" ? "as the form" : null });
    rows.push({ k: "Amount", v: draft.amount != null ? fmt(draft.amount, { currency: cur }) : null, need: true });
    if (draft.type === "Transfer") {
      rows.push({ k: "From", v: name(s.accById, draft.account), need: true });
      rows.push({ k: "To", v: name(s.accById, draft.to), need: true });
    } else {
      rows.push({ k: "Category", v: name(s.catById, draft.cat), need: true, hint: draft.catFrom === "rule" ? "by your rule" : null });
      if (draft.account) rows.push({ k: draft.type === "Income" ? "Into" : "Paid from", v: name(s.accById, draft.account) });
    }
    if (draft.method) rows.push({ k: "Method", v: (s.methods.find((m) => m.id === draft.method) || {}).name });
    if (draft.ret) rows.push({ k: "Merchant", v: name(s.retById, draft.ret) });
    if (draft.date) rows.push({ k: "Date", v: relDay(draft.date) });
    if (draft.notes) rows.push({ k: "Note", v: draft.notes });
  }

  const shown = listening && interim ? interim : text;

  return (
    <Sheet open={open} onClose={close} title="Quick add">
      <p className="vy-sub vy-quick-lead">
        {voice.state === "ready" ? "Say it or type it" : "Type it"} the way you would tell a friend:
        “450 groceries by UPI yesterday”. Your auto-categorise rules run on it too.
      </p>

      {voice.state === "ready" && (
        <div className="vy-voice">
          <button className={"vy-mic" + (listening ? " on" : "")} onClick={listening ? stop : start}
            disabled={updating} aria-label="Speak" aria-pressed={listening}>
            {listening ? <Square size={24} /> : <Mic size={28} />}
          </button>
          <div className="vy-voice-t" aria-live="polite">
            {updating ? "Updating the speech model…" : listening ? "Listening… tap to stop" : "Tap to speak · stays on this device"}
          </div>
        </div>
      )}
      {(voice.state === "downloadable" || voice.state === "downloading") && (
        <div className="vy-note vy-voice-setup">
          {voice.state === "downloadable"
            ? "Voice can work offline here once your browser downloads its speech model. After that, what you say is turned into text on this device and never sent anywhere."
            : "Your browser is still downloading its speech model. Voice will be ready when it finishes."}
          <button className="vy-btn soft" disabled={installing || checking}
            onClick={voice.state === "downloadable" ? download : recheck}>
            {voice.state === "downloadable"
              ? <><Download size={17} />{installing ? "Setting up…" : "Set up voice"}</>
              : <><RefreshCw size={17} />{checking ? "Checking…" : "Check again"}</>}
          </button>
        </div>
      )}
      {voice.state === "off" && (
        <div className="vy-note vy-voice-setup">
          {voiceOffText(voice.why)} Your keyboard's mic works in the box below.
          {/* Worth a second look only where the answer can change: a silence, or a model that may arrive with a browser update. */}
          {(voice.why === "no-answer" || voice.why === "no-model") && (
            <button className="vy-btn soft" onClick={recheck} disabled={checking}>
              <RefreshCw size={17} />{checking ? "Checking…" : "Check again"}
            </button>
          )}
        </div>
      )}

      <input ref={inputRef} className="vy-input" placeholder="450 groceries upi" value={shown} readOnly={listening}
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()}
        aria-label="What to add" />

      {vErr && <div className="vy-draft-warn" role="alert"><TriangleAlert size={15} />{vErr}</div>}

      {rows.length > 0 && !listening && (
        <div className="vy-card vy-draft">
          {rows.map((r) => (
            <div className="vy-draft-row" key={r.k}>
              <span className="k">{r.k}</span>
              {r.v
                ? <b style={r.color ? { color: r.color } : undefined}>{r.v}{r.hint && <i>{r.hint}</i>}</b>
                : <b className="missing">{r.need ? "not heard — pick it on the form" : "—"}</b>}
            </div>
          ))}
        </div>
      )}
      {!listening && draft.warnings.map((w) => (
        <div className="vy-draft-warn" key={w} role="status"><TriangleAlert size={15} />{w}</div>
      ))}

      <button className="vy-btn accent vy-quick-go" onClick={apply} disabled={!heard || listening}>
        <Sparkles size={17} />{draft.debt ? "Use it anyway" : "Use this draft"}
      </button>
      {!listening && text.trim() && (
        <p className="vy-sub vy-draft-foot">
          {heard
            ? "Fills the form for you to check. Nothing is saved until you press Save."
            : "Nothing understood yet. Try an amount and what it was for."}
        </p>
      )}
    </Sheet>
  );
}
