import React from "react";
import { fmt } from "../lib/money.js";

export function Donut({ data, size = 132, thickness = 26, center }) {
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - thickness) / 2, C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        {data.map((d, i) => {
          const dash = Math.max(0, C * (d.value / total) - 3);
          const off = -C * acc;
          acc += d.value / total;
          return <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.fill} strokeWidth={thickness}
            strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={off}
            style={{ transition: "stroke-dasharray .6s cubic-bezier(.32,.72,0,1)" }} />;
        })}
      </svg>
      {center && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>{center}</div>}
    </div>
  );
}

export function Bars({ data, color, height = 160, currency = "INR", onPick }) {
  const max = Math.max(...data.map((d) => d.v), 1);
  const area = height - 38;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height }}>
      {data.map((d, i) => (
        <div key={i} onClick={() => onPick && onPick(d)}
          style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: onPick ? "pointer" : "default" }}>
          <span className="vy-num" style={{ fontSize: 9.5, color: "var(--muted)", height: 12 }}>
            {d.v ? fmt(d.v, { currency, compact: true, bare: true }) : ""}
          </span>
          <div style={{ width: "100%", height: Math.max(3, (d.v / max) * area), borderRadius: 6,
            background: typeof color === "function" ? color(d, i) : color,
            transition: "height .55s cubic-bezier(.32,.72,0,1)" }} />
          <span style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700 }}>{d.name}</span>
        </div>
      ))}
    </div>
  );
}

/** Smooth black line over a soft fill, the monthly trend from the reference. */
export function TrendLine({ data, currency = "INR", height = 190 }) {
  const W = 320, top = 14, bottom = 26, H = height;
  const max = Math.max(...data.map((d) => d.v), 1);
  const n = data.length;
  const X = (i) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const Y = (v) => top + (1 - v / max) * (H - top - bottom);
  const pts = data.map((d, i) => [X(i), Y(d.v)]);
  let path = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    path += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return (
    <div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="vyTrend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ink)" stopOpacity=".18" />
            <stop offset="100%" stopColor="var(--ink)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((g) => (
          <line key={g} x1="0" x2={W} y1={top + g * (H - top - bottom)} y2={top + g * (H - top - bottom)}
            stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={`${path} L${W},${H - bottom} L0,${H - bottom} Z`} fill="url(#vyTrend)" />
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth="2.5" vectorEffect="non-scaling-stroke"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ display: "flex", marginTop: 4 }}>
        {data.map((d, i) => (
          <span key={i} style={{ flex: 1, textAlign: "center", fontSize: 10.5, fontWeight: 700, color: "var(--muted)" }}>{d.name}</span>
        ))}
      </div>
    </div>
  );
}

/** Weekday spend: solid dark bars over a dashed grid. */
export function DayBars({ data, currency = "INR", height = 200 }) {
  const max = Math.max(...data.map((d) => d.v), 1);
  const steps = 4, area = height - 34;
  return (
    <div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ width: 34, position: "relative", height: area, flex: "0 0 auto" }}>
          {Array.from({ length: steps + 1 }).map((_, i) => (
            <span key={i} className="vy-num" style={{ position: "absolute", right: 0, top: (i / steps) * area - 7,
              fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>
              {fmt(max * (1 - i / steps), { currency, compact: true, bare: true })}
            </span>
          ))}
        </div>
        <div style={{ flex: 1, position: "relative", height: area }}>
          {Array.from({ length: steps + 1 }).map((_, i) => (
            <div key={i} style={{ position: "absolute", left: 0, right: 0, top: (i / steps) * area, height: 1,
              borderTop: i === steps ? "1px solid var(--line2)" : "1px dashed var(--line)" }} />
          ))}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 6 }}>
            {data.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "grid", placeItems: "end center" }}>
                <div title={fmt(d.v, { currency })}
                  style={{ width: "72%", height: Math.max(2, (d.v / max) * area), borderRadius: "6px 6px 2px 2px",
                    background: d.highlight ? "var(--out)" : "var(--ink)",
                    transition: "height .55s cubic-bezier(.32,.72,0,1)" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginLeft: 44, marginTop: 8 }}>
        {data.map((d, i) => (
          <span key={i} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{d.name}</span>
        ))}
      </div>
    </div>
  );
}


/**
 * A bar per bucket, for periods with more buckets than fit a label each.
 *
 * Bars fill their slot rather than sitting as hairlines in the middle of it, the
 * baseline is drawn so empty days read as empty rather than as dotted marks, and
 * labels are positioned absolutely so the last one cannot be clipped by the
 * edge of its column.
 */
export function SeriesBars({ data, currency = "INR", height = 190, onPick, ticks }) {
  const max = Math.max(...data.map((d) => d.v), 1);
  const area = height - 30;
  const many = data.length > 16;
  const gap = many ? 3 : 6;

  // Evenly spaced labels that always include the first and last bucket.
  const marks = ticks || (() => {
    if (data.length <= 8) return data.map((_, i) => i);
    const stepSize = Math.ceil(data.length / 5);
    const out = [];
    for (let i = 0; i < data.length; i += stepSize) out.push(i);
    if (out[out.length - 1] !== data.length - 1) out.push(data.length - 1);
    return out;
  })();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap, height: area }}>
        {data.map((d, i) => (
          <div key={d.key || i} onClick={() => onPick && onPick(d)}
            title={`${d.name}: ${fmt(d.v, { currency })}`}
            style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-end", height: "100%",
              cursor: onPick ? "pointer" : "default" }}>
            <div style={{
              width: "100%",
              height: d.v ? Math.max(4, (d.v / max) * area) : 0,
              borderRadius: many ? "3px 3px 0 0" : "6px 6px 0 0",
              background: d.highlight ? "var(--out)" : "var(--ink)",
              transition: "height .55s cubic-bezier(.32,.72,0,1)",
            }} />
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: "var(--line2)", marginTop: 0 }} />

      <div style={{ position: "relative", height: 18, marginTop: 7 }}>
        {marks.map((i) => {
          const centre = ((i + 0.5) / data.length) * 100;
          return (
            <span key={i} style={{
              position: "absolute", left: `${centre}%`, transform: "translateX(-50%)",
              fontSize: 10.5, fontWeight: 700, color: "var(--muted)", whiteSpace: "nowrap",
            }}>{data[i].name}</span>
          );
        })}
      </div>
    </div>
  );
}

/** Spend against income over the same buckets: two lines, one filled. */
export function FlowChart({ data, height = 200 }) {
  const W = 320, top = 14, bottom = 26, H = height;
  const max = Math.max(...data.flatMap((d) => [d.spent, d.earned]), 1);
  const n = data.length;
  const X = (i) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const Y = (v) => top + (1 - v / max) * (H - top - bottom);
  const curve = (key) => {
    const pts = data.map((d, i) => [X(i), Y(d[key])]);
    let path = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      path += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return path;
  };
  const spentPath = curve("spent");
  return (
    <div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="vyFlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ink)" stopOpacity=".16" />
            <stop offset="100%" stopColor="var(--ink)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((g) => (
          <line key={g} x1="0" x2={W} y1={top + g * (H - top - bottom)} y2={top + g * (H - top - bottom)}
            stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={`${spentPath} L${W},${H - bottom} L0,${H - bottom} Z`} fill="url(#vyFlow)" />
        <path d={curve("earned")} fill="none" stroke="var(--in)" strokeWidth="2" strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <path d={spentPath} fill="none" stroke="var(--ink)" strokeWidth="2.5"
          vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ display: "flex", marginTop: 4 }}>
        {data.map((d, i) => (
          <span key={i} style={{ flex: 1, textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>
            {data.length > 8 && i % 2 ? "" : d.name}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 10 }}>
        {[["Spent", "var(--ink)", false], ["Earned", "var(--in)", true]].map(([l, c, dashed]) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>
            <i style={{ width: 14, height: 0, borderTop: `2px ${dashed ? "dashed" : "solid"} ${c}` }} />{l}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Cashflow({ data, currency = "INR", height = 180 }) {
  return <TrendLine data={data.map((d) => ({ name: d.name, v: d.spent }))} currency={currency} height={height} />;
}
