import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ChevronDown, X, Check, Search, Pencil, Trash2, AlertCircle } from "lucide-react";
import { buzz, clamp } from "../lib/money.js";
import { Ic, ICON_NAMES, SWATCHES } from "../lib/icons.jsx";
import { tint } from "../lib/color.js";
import { registerSheet, unregisterSheet } from "../lib/backstack.js";

/* ── toast ───────────────────────────────────────────────────────────────── */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef(null);
  const toast = useCallback((msg, action) => {
    clearTimeout(timer.current);
    setT({ msg, action, key: Date.now() });
    timer.current = setTimeout(() => setT(null), action ? 5200 : 3000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {t && (
        <div className="vy-toast" key={t.key} role="status">
          <Check size={18} style={{ color: "var(--accent)", flex: "0 0 auto" }} />
          <span style={{ flex: 1 }}>{t.msg}</span>
          {t.action && <button onClick={() => { t.action.fn(); setT(null); }}>{t.action.label}</button>}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/* ── overlays ────────────────────────────────────────────────────────────── */
/* A screen's entry animation leaves it a stacking context of its own, so a sheet rendered
   inside it could never rise above the tab bar and the add button: they drew over the scrim,
   unblurred, and covered the sheet's last button. Overlays are portalled to the stage, where
   their z-index competes with the tab bar directly. */
const toStage = (node) => {
  const host = typeof document !== "undefined" && document.querySelector(".vy-stage");
  return host ? createPortal(node, host) : node;
};

/* ── sheet ───────────────────────────────────────────────────────────────── */
export function Sheet({ open, title, onClose, children, right }) {
  const [closing, setClosing] = useState(false);
  const [dy, setDy] = useState(0);
  const start = useRef(0);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => { setClosing(false); setDy(0); onClose(); }, 220);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const token = registerSheet(close);
    return () => { window.removeEventListener("keydown", onKey); unregisterSheet(token); };
  }, [open, close]);

  if (!open) return null;
  const down = (e) => { start.current = e.touches ? e.touches[0].clientY : e.clientY; };
  const move = (e) => { if (!start.current) return; const y = e.touches ? e.touches[0].clientY : e.clientY; setDy(Math.max(0, y - start.current)); };
  const up = () => { if (dy > 90) { buzz(6); close(); } else setDy(0); start.current = 0; };

  return toStage(
    <>
      <div className={"vy-scrim" + (closing ? " closing" : "")} onClick={close} />
      <div className={"vy-sheet" + (closing ? " closing" : "")} role="dialog" aria-modal="true"
        style={{ transform: dy ? `translateY(${dy}px)` : undefined, transition: dy ? "none" : undefined }}>
        <div onTouchStart={down} onTouchMove={move} onTouchEnd={up} style={{ flex: "0 0 auto" }}>
          <div className="vy-grab" />
          {title && (
            <div className="vy-sheet-h">
              <b>{title}</b>{right}
              <button className="vy-iconbtn ghost" onClick={close} aria-label="Close"><X size={20} /></button>
            </div>
          )}
        </div>
        <div className="vy-sheet-b">{children}</div>
      </div>
    </>
  );
}

/* ── confirm ─────────────────────────────────────────────────────────────── */
/* A centred dialog rather than a sheet: a yes/no question is not a panel of content, and a
   destructive choice should hold the eye where the finger is not already resting. */
export function Confirm({ open, title, body, confirmLabel = "Delete", danger = true, onConfirm, onClose }) {
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 170);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const token = registerSheet(close);
    return () => { window.removeEventListener("keydown", onKey); unregisterSheet(token); };
  }, [open, close]);

  if (!open) return null;
  return toStage(
    <>
      <div className={"vy-scrim" + (closing ? " closing" : "")} onClick={close} />
      <div className="vy-dialog-wrap">
        <div className={"vy-dialog" + (closing ? " closing" : "")} role="alertdialog" aria-modal="true" aria-label={title}>
          <b>{title}</b>
          {body && <p className="vy-sub">{body}</p>}
          <div className="vy-dialog-acts">
            <button className="vy-btn soft" onClick={close}>Keep it</button>
            <button className={"vy-btn " + (danger ? "danger" : "accent")}
              onClick={() => { buzz(16); onConfirm(); close(); }}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── controls ────────────────────────────────────────────────────────────── */
export const Switch = ({ on, onChange, label }) => (
  <button className={"vy-switch" + (on ? " on" : "")} role="switch" aria-checked={!!on} aria-label={label}
    onClick={() => { buzz(6); onChange(!on); }}><i /></button>
);

/** Segmented control. The white thumb slides between options rather than blinking across. */
export function Seg({ value, options, onChange }) {
  const index = Math.max(0, options.findIndex((o) => o.v === value));
  const width = `calc((100% - 8px) / ${options.length})`;
  return (
    <div className="vy-seg" role="tablist">
      <span className="thumb" aria-hidden="true"
        style={{ width, transform: `translateX(${index * 100}%)` }} />
      {options.map((o) => (
        <button key={o.v} role="tab" aria-selected={value === o.v} className={value === o.v ? "on" : ""}
          onClick={() => { buzz(5); onChange(o.v); }}>{o.l}</button>
      ))}
    </div>
  );
}

export const Nav = ({ title, onBack, right, big }) => (
  <div className="vy-nav">
    {onBack && <button className="vy-iconbtn" onClick={() => { buzz(5); onBack(); }} aria-label="Back"><ChevronLeft size={21} /></button>}
    <div className="vy-nav-t" style={big ? { fontSize: 25, fontWeight: 680, letterSpacing: "-.03em" } : undefined}>{title}</div>
    {right}
  </div>
);

export const Field = ({ label, value, icon, onClick, empty, right }) => (
  <button className="vy-field" onClick={() => { buzz(5); onClick && onClick(); }}>
    {icon && <span className="k" style={{ display: "grid", placeItems: "center" }}>{icon}</span>}
    <span className="k">{label}</span>
    <span className={"v" + (empty ? " empty" : "")}>{value}</span>
    {right !== undefined ? right : <ChevronRight size={17} style={{ color: "var(--muted)" }} />}
  </button>
);

export function Ring({ pct, size = 54, w = 6, color }) {
  const r = (size - w) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="vy-ring" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface3)" strokeWidth={w} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - clamp(pct || 0, 0, 1))}
        style={{ transition: "stroke-dashoffset .7s cubic-bezier(.32,.72,0,1)" }} />
    </svg>
  );
}

export const Empty = ({ icon, title, body, cta, onCta }) => (
  <div className="vy-empty">
    <div className="ic">{icon}</div>
    <b>{title}</b><p>{body}</p>
    {cta && <button className="vy-btn accent" style={{ maxWidth: 240, margin: "0 auto" }} onClick={() => { buzz(6); onCta(); }}>{cta}</button>}
  </div>
);

/* ── swipe to edit / delete ──────────────────────────────────────────────── */
/* Left to right edits, right to left deletes, with no second tap: the row commits on release
   once it has travelled SWIPE_COMMIT of its width, and a haptic tick plus a grown icon mark
   the moment it is armed, so dragging back before letting go cancels it.
   A finger scrolling a list is never perfectly vertical, and the row once followed every pixel
   of sideways drift. Nothing moves until the finger has travelled SWIPE_SLOP, the gesture is
   then locked to one axis for the rest of the touch, and only a clearly horizontal one
   (SWIPE_RATIO times wider than tall) counts. A vertical gesture belongs to the page. */
const SWIPE_SLOP = 14;
const SWIPE_RATIO = 1.6;
const SWIPE_COMMIT = 0.35;
const SWIPE_COMMIT_MIN = 90;

export function SwipeRow({ children, onEdit, onDelete }) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Which action is showing behind the row. It outlives the drag so the panel stays painted
  // while the row slides home, and is cleared when that transition ends.
  const [side, setSide] = useState(null);
  const [armed, setArmed] = useState(false);
  const g = useRef(null);
  const wrap = useRef(null);
  const swiped = useRef(false);
  if (!onEdit && !onDelete) return children;

  const down = (e) => {
    if (e.touches.length !== 1) { g.current = null; return; }
    const t = e.touches[0];
    const width = wrap.current ? wrap.current.offsetWidth : 320;
    g.current = { x0: t.clientX, y0: t.clientY, last: 0, axis: null, armed: false,
      limit: Math.max(SWIPE_COMMIT_MIN, width * SWIPE_COMMIT), width };
    swiped.current = false;
  };
  const move = (e) => {
    const s = g.current;
    if (!s || s.axis === "y") return;
    const t = e.touches[0];
    const dx = t.clientX - s.x0, dy = t.clientY - s.y0;
    if (!s.axis) {
      if (Math.hypot(dx, dy) < SWIPE_SLOP) return;
      if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) { s.axis = "y"; return; }
      // Start the row from where the slop ended, so it does not jump by SWIPE_SLOP on lock.
      s.axis = "x"; s.x0 += Math.sign(dx) * SWIPE_SLOP;
      setDragging(true); swiped.current = true;
    }
    // A direction with no action does not move at all, rather than revealing an empty panel.
    s.last = clamp(t.clientX - s.x0, onDelete ? -s.width : 0, onEdit ? s.width : 0);
    const nowArmed = Math.abs(s.last) >= s.limit;
    if (nowArmed !== s.armed) { s.armed = nowArmed; setArmed(nowArmed); if (nowArmed) buzz(8); }
    setSide(s.last > 0 ? "edit" : s.last < 0 ? "del" : null);
    setX(s.last);
  };
  const up = () => {
    const s = g.current;
    g.current = null;
    if (!s || s.axis !== "x") return;
    setDragging(false); setArmed(false); setX(0);
    if (!s.armed) return;
    if (s.last > 0) onEdit();
    else { buzz(14); onDelete(); }
  };

  return (
    <div className="vy-rowwrap" ref={wrap}>
      {side && (
        <div className={"vy-rowacts " + (side === "edit" ? "a-edit" : "a-del") + (armed ? " armed" : "")} aria-hidden="true">
          {side === "edit" ? <><Pencil size={18} /><span>Edit</span></> : <><span>Delete</span><Trash2 size={18} /></>}
        </div>
      )}
      <div className="vy-rowslide" style={{ transform: `translateX(${x}px)`, transition: dragging ? "none" : "transform .26s cubic-bezier(.32,.72,0,1)" }}
        onTouchStart={down} onTouchMove={move} onTouchEnd={up} onTouchCancel={up}
        onTransitionEnd={(e) => { if (e.target === e.currentTarget && x === 0) setSide(null); }}
        onClickCapture={(e) => { if (swiped.current) { e.stopPropagation(); swiped.current = false; } }}>
        {children}
      </div>
    </div>
  );
}

/* ── pickers ─────────────────────────────────────────────────────────────── */
export function PickerSheet({ open, onClose, title, items, value, onPick, searchable, emptyHint, onAddNew }) {
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  const list = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {searchable && (
        <div className="vy-searchbar" style={{ marginBottom: 12 }}>
          <Search size={17} style={{ color: "var(--muted)" }} />
          <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="vy-iconbtn ghost" style={{ width: 22, height: 22 }} onClick={() => setQ("")}><X size={15} /></button>}
        </div>
      )}
      {items.length === 0 ? (
        <Empty icon={<AlertCircle size={22} />} title="Nothing set up yet"
          body={emptyHint || "Add this in the master data screens first."}
          cta={onAddNew ? "Add one now" : null} onCta={() => { onClose(); onAddNew && onAddNew(); }} />
      ) : (
        <div className="vy-group">
          {list.map((i) => (
            <div key={i.id} className="vy-row" onClick={() => { buzz(6); onPick(i.id); onClose(); }}>
              <div className="vy-row-ic" style={{ background: tint((i.color || "#8A8D9C")), color: i.color || "var(--ink)" }}>
                <Ic n={i.icon || "Tag"} size={18} />
              </div>
              <div className="vy-row-m"><b>{i.name}</b>{i.sub && <span>{i.sub}</span>}</div>
              {value === i.id && <Check size={19} style={{ color: "var(--accent)" }} />}
            </div>
          ))}
          {!list.length && <div style={{ padding: 26, textAlign: "center" }} className="vy-sub">Nothing matches "{q}".</div>}
        </div>
      )}
    </Sheet>
  );
}

export const ColorPicker = ({ value, onChange }) => (
  <div className="vy-swatches">
    {SWATCHES.map((c) => (
      <button key={c} className={"vy-swatch" + (value === c ? " on" : "")} style={{ background: c }}
        aria-label={`Colour ${c}`} onClick={() => { buzz(5); onChange(c); }} />
    ))}
  </div>
);

export function IconPicker({ value, onChange }) {
  const [all, setAll] = useState(false);
  const names = all ? ICON_NAMES : ICON_NAMES.slice(0, 24);
  return (
    <>
      <div className="vy-icongrid">
        {names.map((n) => (
          <button key={n} className={value === n ? "on" : ""} onClick={() => { buzz(5); onChange(n); }} aria-label={n}>
            <Ic n={n} size={19} />
          </button>
        ))}
      </div>
      {!all && (
        <button className="vy-link" style={{ marginTop: 10 }} onClick={() => setAll(true)}>
          Show all {ICON_NAMES.length} icons
        </button>
      )}
    </>
  );
}


/* ── animated number ─────────────────────────────────────────────────────── */
/**
 * Counts from the previous value to the new one. Figures that jump are hard to
 * read; figures that travel tell you which way they moved. Skipped entirely when
 * the system asks for reduced motion, and on first paint.
 */
export function AnimatedNumber({ value, format, className, style, duration = 650 }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (first.current || reduce || !Number.isFinite(value) || !Number.isFinite(from.current)) {
      first.current = false;
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (a === b) return;

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);          // ease-out quart
      setShown(a + (b - a) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);

  return <span className={className} style={style}>{format(shown)}</span>;
}

/* ── select ──────────────────────────────────────────────────────────────── */
/**
 * A themed replacement for <select>. The native control renders as an OS list
 * on a phone, which looks nothing like the rest of the app, so this opens the
 * same bottom sheet everything else uses.
 */
export function Select({ value, options, onChange, placeholder = "Not set", title, searchable }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const chosen = options.find((o) => o.value === value);
  const list = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;

  return (
    <>
      <button className="vy-selectbtn" onClick={() => { buzz(5); setQ(""); setOpen(true); }}>
        <span className={"v" + (chosen ? "" : " empty")}>
          {chosen ? (
            <>
              {chosen.color && <i className="dot" style={{ background: chosen.color }} />}
              {chosen.icon && <Ic n={chosen.icon} size={16} style={{ color: chosen.color || "var(--ink2)" }} />}
              {chosen.label}
            </>
          ) : placeholder}
        </span>
        <ChevronDown size={18} style={{ color: "var(--muted)", flex: "0 0 auto" }} />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={title || placeholder}>
        {searchable && options.length > 8 && (
          <div className="vy-searchbar" style={{ marginBottom: 12 }}>
            <Search size={17} style={{ color: "var(--muted)" }} />
            <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button className="vy-iconbtn ghost" style={{ width: 22, height: 22 }} onClick={() => setQ("")}><X size={15} /></button>}
          </div>
        )}
        <div className="vy-group">
          {list.map((o) => (
            <div key={o.value} className="vy-row" onClick={() => { buzz(6); onChange(o.value); setOpen(false); }}>
              {(o.icon || o.color) && (
                <div className="vy-row-ic" style={{ background: tint((o.color || "#8E8E93")), color: o.color || "var(--ink2)" }}>
                  <Ic n={o.icon || "Tag"} size={18} />
                </div>
              )}
              <div className="vy-row-m"><b>{o.label}</b>{o.sub && <span>{o.sub}</span>}</div>
              {value === o.value && <Check size={19} style={{ color: "var(--accent)" }} />}
            </div>
          ))}
          {!list.length && <div style={{ padding: 26, textAlign: "center" }} className="vy-sub">Nothing matches "{q}".</div>}
        </div>
      </Sheet>
    </>
  );
}

/* ── calendar ────────────────────────────────────────────────────────────── */
export function DatePick({ value, onPick, allowFuture }) {
  const [m, setM] = useState(value.slice(0, 7));
  const first = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).getDay();
  const dim = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const shift = (n) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1); setM(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button className="vy-iconbtn" style={{ background: "var(--surface2)" }} onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
        <b style={{ flex: 1, textAlign: "center", fontSize: 15.5, fontWeight: 620 }}>{MONTHS[+m.slice(5, 7) - 1]} {m.slice(0, 4)}</b>
        <button className="vy-iconbtn" style={{ background: "var(--surface2)" }} onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={18} /></button>
      </div>
      <div className="vy-heat" style={{ marginBottom: 6 }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{d}</span>
        ))}
      </div>
      <div className="vy-heat">
        {Array.from({ length: first }).map((_, i) => <span key={"e" + i} />)}
        {Array.from({ length: dim }).map((_, i) => {
          const d = `${m}-${String(i + 1).padStart(2, "0")}`;
          const on = d === value;
          const blocked = !allowFuture && d > todayStr;
          return (
            <button key={d} disabled={blocked} onClick={() => { buzz(6); onPick(d); }}
              style={{
                aspectRatio: 1, borderRadius: 11, border: 0, fontFamily: "inherit", fontSize: 13.5, fontWeight: 550,
                background: on ? "var(--accent)" : "var(--surface2)",
                color: on ? "#fff" : blocked ? "var(--line2)" : "var(--ink)",
                cursor: blocked ? "default" : "pointer",
              }}>{i + 1}</button>
          );
        })}
      </div>
      <button className="vy-btn soft" style={{ marginTop: 16 }} onClick={() => onPick(todayStr)}>Today</button>
    </div>
  );
}
