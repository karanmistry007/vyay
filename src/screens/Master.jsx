import React, { useMemo, useState } from "react";
import { Plus, Search, X, Archive, ChevronRight } from "lucide-react";
import { Nav, Sheet, Confirm, Switch, Empty, SwipeRow, ColorPicker, IconPicker, DatePick, Select, useToast } from "../components/ui.jsx";
import { Ic } from "../lib/icons.jsx";
import { tint } from "../lib/color.js";
import { buzz, isoToday, relDay } from "../lib/money.js";

/**
 * One screen drives every master list: accounts, categories, merchants,
 * payment methods, people, books, budgets, goals, recurring rules, auto-rules.
 * Behaviour comes entirely from the config passed in.
 */
export default function Master({ cfg, s, nav }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const all = cfg.collection === "books"
    ? s.state.books
    : s.state[cfg.collection].filter((r) => r.book === s.activeBook);

  const items = useMemo(() => {
    let list = all;
    if (cfg.archivable && !showArchived) list = list.filter((r) => !r.archived);
    if (q) list = list.filter((r) => (cfg.searchText ? cfg.searchText(r, s) : r.name || "").toLowerCase().includes(q.toLowerCase()));
    return cfg.sort ? [...list].sort(cfg.sort) : list;
  }, [all, q, showArchived, cfg, s]);

  const archivedCount = cfg.archivable ? all.filter((r) => r.archived).length : 0;

  const openNew = () => { buzz(6); setEditing({ ...(typeof cfg.defaults === "function" ? cfg.defaults(s) : cfg.defaults) }); };

  const save = async () => {
    const draft = editing;
    const problem = cfg.validate ? cfg.validate(draft, s, all) : null;
    if (problem) return toast(problem);
    const payload = cfg.serialize ? cfg.serialize(draft, s) : draft;
    if (draft.id) await s.update(cfg.collection, draft.id, payload);
    else await s.add(cfg.collection, { ...payload, book: cfg.collection === "books" ? undefined : s.activeBook });
    buzz(12);
    toast(draft.id ? `${cfg.singular} updated` : `${cfg.singular} added`);
    setEditing(null);
  };

  const askDelete = (rec) => {
    const blocked = cfg.guard ? cfg.guard(rec, s) : null;
    if (blocked) return toast(blocked);
    setConfirming(rec);
  };

  const doDelete = async () => {
    await s.remove(cfg.collection, confirming.id);
    toast(`${cfg.singular} deleted`);
    setConfirming(null);
    setEditing(null);
  };

  return (
    <div className="vy-screen push-enter">
      <Nav title={cfg.title} onBack={nav.pop}
        right={<button className="vy-iconbtn" onClick={openNew} aria-label={`Add ${cfg.singular}`}><Plus size={19} /></button>} />

      {all.length > 6 && (
        <div className="vy-pad">
          <div className="vy-searchbar">
            <Search size={17} style={{ color: "var(--muted)" }} />
            <input placeholder={`Search ${cfg.title.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button className="vy-iconbtn ghost" style={{ width: 22, height: 22 }} onClick={() => setQ("")}><X size={15} /></button>}
          </div>
        </div>
      )}

      <div className="vy-body">
        <div className="vy-pad">
          {cfg.intro && <div className="vy-note" style={{ marginTop: 8 }}>{cfg.intro}</div>}

          {items.length === 0 ? (
            <Empty icon={cfg.icon} title={q ? "No matches" : `No ${cfg.title.toLowerCase()} yet`}
              body={q ? `Nothing here matches "${q}".` : cfg.emptyBody}
              cta={q ? null : `Add ${cfg.singular}`} onCta={openNew} />
          ) : cfg.renderItem ? (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {items.map((rec) => (
                <div key={rec.id} onClick={() => { buzz(5); setEditing({ ...rec }); }}>
                  {cfg.renderItem(rec, s)}
                </div>
              ))}
            </div>
          ) : (
            <div className="vy-group" style={{ marginTop: 12 }}>
              {items.map((rec) => {
                const color = cfg.rowColor ? cfg.rowColor(rec, s) : rec.color || "#8A8D9C";
                return (
                  <SwipeRow key={rec.id} onEdit={() => setEditing({ ...rec })} onDelete={() => askDelete(rec)}>
                    <div className="vy-row" onClick={() => { buzz(5); cfg.onOpen ? cfg.onOpen(rec, nav) : setEditing({ ...rec }); }}>
                      <div className="vy-row-ic" style={{ background: tint(color), color }}>
                        <Ic n={cfg.rowIcon ? cfg.rowIcon(rec, s) : rec.icon || "Tag"} size={18} />
                      </div>
                      <div className="vy-row-m">
                        <b>{(cfg.title_of ? cfg.title_of(rec, s) : rec.name)}{rec.archived ? " · archived" : ""}</b>
                        <span>{cfg.subtitle ? cfg.subtitle(rec, s) : ""}</span>
                      </div>
                      {cfg.rowRight ? cfg.rowRight(rec, s) : null}
                      {cfg.onOpen && <ChevronRight size={17} style={{ color: "var(--muted)", marginLeft: 8 }} />}
                    </div>
                  </SwipeRow>
                );
              })}
            </div>
          )}

          {archivedCount > 0 && (
            <button className="vy-btn soft" style={{ marginTop: 14, padding: 11, fontSize: 13.5 }}
              onClick={() => setShowArchived((v) => !v)}>
              <Archive size={15} />{showArchived ? "Hide" : "Show"} {archivedCount} archived
            </button>
          )}

          {cfg.footer && cfg.footer(s, { toast, openNew, nav })}
        </div>
        <div className="vy-tabspace" />
      </div>

      <Sheet open={!!editing} onClose={() => setEditing(null)}
        title={editing && editing.id ? `Edit ${cfg.singular}` : `New ${cfg.singular}`}>
        {editing && (
          <>
            <div className="vy-form">
              {(typeof cfg.fields === "function" ? cfg.fields(editing, s) : cfg.fields)
                .filter((f) => !f.when || f.when(editing, s))
                .map((f) => (
                  <FieldInput key={f.key} f={f} value={editing[f.key]} s={s}
                    onChange={(v) => setEditing((d) => ({ ...d, [f.key]: v }))} />
                ))}
            </div>
            <button className="vy-btn accent" style={{ marginTop: 18 }} onClick={save}>
              {editing.id ? "Save changes" : `Add ${cfg.singular}`}
            </button>
            {editing.id && cfg.archivable && (
              <button className="vy-btn soft" style={{ marginTop: 10 }}
                onClick={async () => {
                  await s.update(cfg.collection, editing.id, { archived: !editing.archived });
                  toast(editing.archived ? "Restored" : "Archived — history is kept");
                  setEditing(null);
                }}>
                {editing.archived ? "Restore" : "Archive instead of deleting"}
              </button>
            )}
            {editing.id && (
              <button className="vy-btn danger" style={{ marginTop: 10 }} onClick={() => askDelete(editing)}>
                Delete {cfg.singular}
              </button>
            )}
          </>
        )}
      </Sheet>

      <Confirm open={!!confirming} onClose={() => setConfirming(null)} onConfirm={doDelete}
        title={`Delete this ${cfg.singular}?`}
        body={`${confirming ? (cfg.title_of ? cfg.title_of(confirming, s) : confirming.name) || cfg.singular : ""} will be removed permanently. This cannot be undone.`} />
    </div>
  );
}

/* ── one input per field type ────────────────────────────────────────────── */
function FieldInput({ f, value, onChange, s }) {
  const [dateOpen, setDateOpen] = useState(false);

  if (f.type === "switch") {
    return (
      <div className="vy-field" style={{ cursor: "default" }}>
        <span className="k" style={{ flex: 1 }}>{f.label}</span>
        <Switch on={!!value} onChange={onChange} label={f.label} />
      </div>
    );
  }

  if (f.type === "color") {
    return <div><label>{f.label}</label><ColorPicker value={value} onChange={onChange} /></div>;
  }

  if (f.type === "icon") {
    return <div><label>{f.label}</label><IconPicker value={value} onChange={onChange} /></div>;
  }

  if (f.type === "select") {
    const opts = typeof f.options === "function" ? f.options(s) : f.options;
    return (
      <div>
        <label>{f.label}</label>
        <Select value={value || ""} onChange={(v) => onChange(v || null)} title={f.label} searchable
          placeholder={f.placeholder || "Not set"}
          options={[{ value: "", label: f.placeholder || "Not set" }, ...opts]} />
      </div>
    );
  }

  if (f.type === "date") {
    return (
      <div>
        <label>{f.label}</label>
        <button className="vy-field" onClick={() => setDateOpen(true)}>
          <span className="v">{value ? relDay(value) : "Choose a date"}</span>
        </button>
        <Sheet open={dateOpen} onClose={() => setDateOpen(false)} title={f.label}>
          <DatePick value={value || isoToday()} allowFuture onPick={(d) => { onChange(d); setDateOpen(false); }} />
        </Sheet>
      </div>
    );
  }

  if (f.type === "textarea") {
    return (
      <div>
        <label>{f.label}</label>
        <textarea className="vy-input" rows={3} placeholder={f.placeholder} value={value || ""}
          onChange={(e) => onChange(e.target.value)} style={{ resize: "none", fontFamily: "inherit" }} />
        {f.hint && <div className="vy-sub" style={{ marginTop: 6, fontSize: 12 }}>{f.hint}</div>}
      </div>
    );
  }

  const numeric = f.type === "number";
  return (
    <div>
      <label>{f.label}</label>
      <input className="vy-input" inputMode={numeric ? "decimal" : undefined} placeholder={f.placeholder}
        value={value === undefined || value === null ? "" : value}
        onChange={(e) => onChange(numeric ? e.target.value.replace(/[^\d.-]/g, "") : e.target.value)} />
      {f.hint && <div className="vy-sub" style={{ marginTop: 6, fontSize: 12 }}>{f.hint}</div>}
    </div>
  );
}
