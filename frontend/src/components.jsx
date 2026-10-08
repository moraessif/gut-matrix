import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PR, PRIOS, code, prioOf } from "./util.js";

export const Chip = ({ p }) => <span className={`chip p-${PR[p]}`}>{p}</span>;

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div id="scrim" onClick={onClose} />
      <div id="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </>
  );
}

export const Field = ({ label, hint, error, children }) => (
  <div className="f">
    <label className="l">{label}</label>
    {hint && <p className="h">{hint}</p>}
    {children}
    {error && <div className="err">{error}</div>}
  </div>
);

export const options = (list, blank) => [
  blank != null && <option key="__blank" value="">{blank}</option>,
  ...list.map((v) => {
    const [val, lab] = Array.isArray(v) ? v : [v, v];
    return <option key={val} value={val}>{lab}</option>;
  })
];

// Grupo de notas 1-5 com os critérios sempre visíveis
export function CritGroup({ name, scale, value, onChange, disabled }) {
  return (
    <div className={"crit" + (disabled ? " ro" : "")} role="radiogroup" aria-label={name}>
      {scale.map((text, i) => (
        <label key={i}>
          <input type="radio" name={name} value={i + 1} checked={+value === i + 1} disabled={disabled} onChange={() => onChange(i + 1)} />
          <span className="nn">{i + 1}</span>
          <span>{text}</span>
        </label>
      ))}
    </div>
  );
}

export function LiveScore({ g, u, t }) {
  if (!(g && u && t)) return <div className="live"><span className="muted">Choose gravity, urgency and trend to calculate the score.</span></div>;
  const s = g * u * t, p = prioOf(s);
  return (
    <div className="live">
      <span className={`score p-${PR[p]}`} style={{ fontSize: 20, padding: "5px 14px" }}>{s}</span>
      <span>{g} × {u} × {t}</span>
      <Chip p={p} />
    </div>
  );
}

// Mapa GUT: gravidade (vertical) x urgência (horizontal); tamanho do ponto = tendência
export function GutMap({ items }) {
  const nav = useNavigate();
  const x0 = 78, y0 = 14, cw = 88, ch = 82, W = x0 + cw * 5 + 8, H = y0 + ch * 5 + 58;
  const cells = {};
  items.forEach((x) => { (cells[`${x.g},${x.u}`] = cells[`${x.g},${x.u}`] || []).push(x); });
  const rects = [];
  for (let g = 5; g >= 1; g--) for (let u = 1; u <= 5; u++)
    rects.push(<rect key={`${g}${u}`} className="cell" x={x0 + (u - 1) * cw} y={y0 + (5 - g) * ch} width={cw} height={ch} fill="#E5484D" fillOpacity={(0.05 + (0.34 * g * u) / 25).toFixed(3)} />);
  const dots = [];
  Object.entries(cells).forEach(([key, list]) => {
    const [g, u] = key.split(",").map(Number), n = list.length;
    const cx = x0 + (u - 1) * cw + cw / 2, cy = y0 + (5 - g) * ch + ch / 2;
    const shown = n > 9 ? list.slice(0, 8) : list;
    const sc = n === 1 ? 1 : n <= 4 ? 0.78 : 0.58, dx = n <= 4 ? 20 : 27, dy = n <= 4 ? 18 : 25;
    shown.forEach((x, i) => {
      let ox = 0, oy = 0;
      if (n > 1 && n <= 4) { ox = (i % 2 ? 1 : -1) * dx; oy = (i < 2 ? -1 : 1) * dy; if (n === 2) oy = 0; if (n === 3 && i === 2) ox = 0; }
      else if (n > 4) { ox = ((i % 3) - 1) * dx; oy = (Math.floor(i / 3) - 1) * dy; }
      const r = (5 + x.t * 1.5) * sc;
      dots.push(
        <g key={x.id} className="dot" tabIndex={0} role="link" aria-label={x.title} transform={`translate(${cx + ox} ${cy + oy})`}
           onClick={() => nav(`/problems/${x.id}`)} onKeyDown={(e) => e.key === "Enter" && nav(`/problems/${x.id}`)}>
          <title>{`${code(x.id)} ${x.title} | G${x.g} x U${x.u} x T${x.t} = ${x.final_score} (${x.priority})`}</title>
          {x.validated && <circle r={r + 3} fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="1.5" />}
          <circle className="main" r={r} style={{ fill: `var(--p-${PR[x.priority]})` }} />
        </g>
      );
    });
    if (n > 9) dots.push(<text key={key + "+"} className="ax" x={cx + dx} y={cy + dy + 14} textAnchor="middle">+{n - 8}</text>);
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="GUT map: gravity by urgency; dot size shows trend">
      {rects}
      {[1, 2, 3, 4, 5].map((g) => <text key={"g" + g} className="ax" x={x0 - 12} y={y0 + (5 - g) * ch + ch / 2 + 4} textAnchor="end">{g}</text>)}
      {[1, 2, 3, 4, 5].map((u) => <text key={"u" + u} className="ax" x={x0 + (u - 1) * cw + cw / 2} y={y0 + ch * 5 + 18} textAnchor="middle">{u}</text>)}
      <text className="axt" x={x0 + cw * 2.5} y={y0 + ch * 5 + 42} textAnchor="middle">Urgency: from “can wait” to “immediate action”</text>
      <text className="axt" transform={`translate(14 ${y0 + ch * 2.5}) rotate(-90)`} textAnchor="middle">Gravity</text>
      {dots}
    </svg>
  );
}

export function StackRow({ name, d, max, onClick }) {
  return (
    <button className="brow" onClick={onClick}>
      <span>{name}</span>
      <span className="track">
        {PRIOS.map((p) => d[p] ? <span key={p} className={`p-${PR[p]}`} style={{ width: `${(d[p] / max) * 100}%` }} title={`${p}: ${d[p]}`} /> : null)}
      </span>
      <span className="num">{d.total}</span>
    </button>
  );
}
