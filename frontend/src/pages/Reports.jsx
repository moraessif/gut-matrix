import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { get } from "../api.js";
import { useApp } from "../context.jsx";
import { PRIOS } from "../util.js";

export default function Reports() {
  const { version, isAdmin } = useApp();
  const [sp, setSp] = useSearchParams();
  const group = sp.get("group") || "country";
  const [rows, setRows] = useState(null);
  const [trend, setTrend] = useState([]);

  useEffect(() => {
    get("/reports/summary?group=" + group).then(setRows).catch(() => setRows([]));
    get("/reports/trend").then(setTrend).catch(() => setTrend([]));
  }, [group, version]);

  const mx = Math.max(1, ...trend.flatMap((w) => [w.created, w.completed]));
  return (
    <>
      <div className="pagehead"><div><h1>Reports</h1><p>Open-problem summaries and throughput for everything you can see.</p></div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn ghost sm" href="/api/export/problems.csv?open=1">Export open problems (CSV)</a>
          {isAdmin && <a className="btn ghost sm" href="/api/export/history.csv">Export full history (CSV)</a>}
        </div></div>
      <div className="panel" style={{ marginBottom: 18 }}>
        <h2>Summary</h2>
        <div className="chips" style={{ marginTop: 10 }}>
          {[["country", "By country"], ["branch", "By branch"], ["department", "By department"]].map(([k, l]) => <button key={k} aria-pressed={k === group} onClick={() => setSp({ group: k })}>{l}</button>)}
        </div>
        <div className="tw">
          {rows === null ? <div className="empty">Loading…</div> : rows.length ? (
            <table className="t" style={{ minWidth: 860 }}>
              <thead><tr><th>{group[0].toUpperCase() + group.slice(1)}</th><th className="c">Total</th><th className="c">Open</th><th className="c">Completed</th>
                {PRIOS.map((p) => <th key={p} className="c">{p}</th>)}<th className="c">Overdue</th><th className="c">Avg GUT</th><th className="c">Avg age (days)</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.name}><td><b>{r.name}</b></td><td className="c">{r.total}</td><td className="c">{r.open}</td><td className="c">{r.completed}</td>
                  {PRIOS.map((p) => <td key={p} className="c">{r[p] || ""}</td>)}<td className={"c" + (r.overdue ? " late" : "")}>{r.overdue || ""}</td>
                  <td className="c">{r.avg_score}</td><td className="c">{r.avg_age_days}</td></tr>))}</tbody>
            </table>
          ) : <div className="empty">No data yet.</div>}
        </div>
      </div>
      <div className="panel"><h2>Created vs completed, last 12 weeks</h2><p className="sub">Weeks start on Monday.</p>
        <div className="trend">{trend.map((w) => (
          <div className="col" key={w.week}>
            <div className="bars"><i className="a" style={{ height: (w.created / mx) * 120 }} title={`Created: ${w.created}`} /><i className="b" style={{ height: (w.completed / mx) * 120 }} title={`Completed: ${w.completed}`} /></div>
            <small>{w.week.slice(5)}</small></div>))}</div>
        <div className="plegend"><span>■ Created</span><span style={{ color: "var(--p-low)" }}>■ <span style={{ color: "var(--ink2)" }}>Completed</span></span></div>
      </div>
    </>
  );
}
