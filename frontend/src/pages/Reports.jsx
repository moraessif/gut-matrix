import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { get } from "../api.js";
import { useApp } from "../context.jsx";
import { PRIOS, prioLabel } from "../util.js";

const GROUP_LABEL = { country: "País", branch: "Filial", department: "Departamento" };

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
      <div className="pagehead"><div><h1>Relatórios</h1><p>Resumos de problemas abertos e vazão de tudo o que você pode ver.</p></div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn ghost sm" href="/api/export/problems.csv?open=1">Exportar problemas abertos (CSV)</a>
          {isAdmin && <a className="btn ghost sm" href="/api/export/history.csv">Exportar histórico completo (CSV)</a>}
        </div></div>
      <div className="panel" style={{ marginBottom: 18 }}>
        <h2>Resumo</h2>
        <div className="chips" style={{ marginTop: 10 }}>
          {[["country", "Por país"], ["branch", "Por filial"], ["department", "Por departamento"]].map(([k, l]) => <button key={k} aria-pressed={k === group} onClick={() => setSp({ group: k })}>{l}</button>)}
        </div>
        <div className="tw">
          {rows === null ? <div className="empty">Carregando…</div> : rows.length ? (
            <table className="t" style={{ minWidth: 860 }}>
              <thead><tr><th>{GROUP_LABEL[group] || group}</th><th className="c">Total</th><th className="c">Abertos</th><th className="c">Concluídos</th>
                {PRIOS.map((p) => <th key={p} className="c">{prioLabel(p)}</th>)}<th className="c">Atrasados</th><th className="c">GUT médio</th><th className="c">Idade média (dias)</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.name}><td><b>{r.name}</b></td><td className="c">{r.total}</td><td className="c">{r.open}</td><td className="c">{r.completed}</td>
                  {PRIOS.map((p) => <td key={p} className="c">{r[p] || ""}</td>)}<td className={"c" + (r.overdue ? " late" : "")}>{r.overdue || ""}</td>
                  <td className="c">{r.avg_score}</td><td className="c">{r.avg_age_days}</td></tr>))}</tbody>
            </table>
          ) : <div className="empty">Ainda não há dados.</div>}
        </div>
      </div>
      <div className="panel"><h2>Criados x concluídos, últimas 12 semanas</h2><p className="sub">As semanas começam na segunda-feira.</p>
        <div className="trend">{trend.map((w) => (
          <div className="col" key={w.week}>
            <div className="bars"><i className="a" style={{ height: (w.created / mx) * 120 }} title={`Criados: ${w.created}`} /><i className="b" style={{ height: (w.completed / mx) * 120 }} title={`Concluídos: ${w.completed}`} /></div>
            <small>{w.week.slice(5)}</small></div>))}</div>
        <div className="plegend"><span>■ Criados</span><span style={{ color: "var(--p-low)" }}>■ <span style={{ color: "var(--ink2)" }}>Concluídos</span></span></div>
      </div>
    </>
  );
}
