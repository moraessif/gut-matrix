import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { get } from "../api.js";
import { useApp } from "../context.jsx";
import { Chip, GutMap, Field, options, StackRow } from "../components.jsx";
import { PR, PRIOS, code, sentence, ago, fmtDT, statusLabel } from "../util.js";

export function FeedItem({ e }) {
  const nav = useNavigate();
  return (
    <li onClick={() => nav(`/problems/${e.problem_id}`)} tabIndex={0} onKeyDown={(k) => k.key === "Enter" && nav(`/problems/${e.problem_id}`)}>
      <span className="when" title={fmtDT(e.at)}>{ago(e.at)}</span>
      <span>
        <span className="s">{sentence(e)}</span>
        <span className="m" style={{ display: "block" }}>{e.problem_title}{e.kind !== "update" && e.user_name ? ", por " + e.user_name : ""}</span>
        {e.kind === "update" && <div className="qt">{e.new_value}</div>}
      </span>
    </li>
  );
}

export default function Dashboard() {
  const { meta, version, canCreate } = useApp();
  const nav = useNavigate();
  const [f, setF] = useState({ country: "", branch: "", department: "" });
  const [d, setD] = useState(null);
  const [feed, setFeed] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    get("/dashboard?" + qs).then(setD).catch((e) => setError(e.message));
    get("/updates?limit=6").then(setFeed).catch(() => {});
  }, [f, version]);

  const branches = f.country ? meta.branches.filter((b) => b.country === f.country).map((b) => b.name) : [...new Set(meta.branches.map((b) => b.name))];
  const to = (o) => "/problems?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), ...o });

  let body = <p className="muted">Carregando…</p>;
  if (error) body = <div className="panel empty"><h2>Não foi possível carregar</h2><p>{error}</p></div>;
  else if (d && !d.kpis.total) body = (
    <div className="panel empty"><h2>Nenhum problema ainda</h2><p>Registre o primeiro problema para iniciar o ranking.</p>
      {canCreate && <Link className="btn" to="/problems/new">Novo problema</Link>}</div>
  );
  else if (d) {
    const k = d.kpis;
    const st = (n, label, href) => <button className="stat" disabled={!href} onClick={() => href && nav(href)}><span className="n">{n}</span><span className="l">{label}</span></button>;
    const pc = Object.fromEntries(d.by_priority.map((x) => [x.name, x.count]));
    const bars = (title, rows, key) => {
      const mx = Math.max(1, ...rows.map((r) => r.total));
      return (
        <div className="span4 panel"><h2>{title}</h2><p className="sub">Abertos, coloridos por prioridade.</p>
          {rows.length ? rows.map((r) => <StackRow key={r.name} name={r.name} d={r} max={mx} onClick={() => nav(to({ [key]: r.name, open: 1 }))} />) : <p className="muted">Nada em aberto.</p>}
        </div>
      );
    };
    const smax = Math.max(1, ...d.by_status.map((x) => x.count));
    body = (
      <>
        <div className="strip">
          {st(k.open, "Problemas abertos", to({ open: 1, sort: "score" }))}
          {st(k.new, "Novos", to({ status: "New" }))}
          {st(k.critical, "Críticos", to({ priority: "Critical", open: 1 }))}
          {st(k.high_priority, "Alta prioridade (Muito Alta + Alta)", to({ open: 1, sort: "score" }))}
          {st(k.in_progress, "Em andamento", to({ status: "In Progress" }))}
          {st(k.overdue, "Atrasados", to({ view: "overdue" }))}
          {st(k.completed, "Concluídos", to({ status: "Completed" }))}
          {st(k.stale, `Sem atualização há ${meta.stale_days} dias`, to({ view: "stale" }))}
          {st(k.avg_score, "Nota GUT média")}
        </div>
        <div className="grid">
          <div className="span7"><div className="mapwrap">
            <h2>Mapa GUT</h2>
            <p className="sub">Problemas abertos. Quanto mais alto e à direita, mais grave e urgente; pontos maiores estão piorando mais rápido.</p>
            <GutMap items={d.map} />
            <div className="legend"><span>tendência 1 = ponto pequeno, tendência 5 = ponto grande</span><span>anel branco = nota validada</span></div>
          </div></div>
          <div className="span5"><div className="panel" style={{ height: "100%" }}>
            <h2>10 maiores prioridades</h2><p className="sub">Maiores notas GUT finais entre os problemas abertos.</p>
            {d.top10.length ? (
              <ol className="toplist">{d.top10.map((x, i) => (
                <li key={x.id} tabIndex={0} onClick={() => nav(`/problems/${x.id}`)}>
                  <span className="rk">{i + 1}</span>
                  <span><span className="t">{x.title}</span><br />
                    <span className="m">{code(x.id)} em {x.country} / {x.branch}, {x.department}{x.overdue && <b className="late"> (atrasado)</b>}</span></span>
                  <span className={`score p-${PR[x.priority]}`}>{x.final_score}</span>
                </li>))}</ol>
            ) : <p className="muted">Nenhum problema aberto.</p>}
          </div></div>
        </div>
        <div className="panel" style={{ marginBottom: 18 }}>
          <h2>Problemas abertos por prioridade</h2><p className="sub">Crítica 80–125, Muito Alta 50–79, Alta 30–49, Média 15–29, Baixa 1–14.</p>
          <div className="pbar">{PRIOS.some((p) => pc[p]) ? PRIOS.map((p) => pc[p] ? <div key={p} className={`p-${PR[p]}`} style={{ flex: pc[p] }}>{pc[p]}</div> : null) : <div style={{ flex: 1, background: "var(--surface2)" }} />}</div>
          <div className="plegend">{PRIOS.map((p) => <span key={p}><Chip p={p} /> <b>{pc[p]}</b></span>)}</div>
        </div>
        <div className="grid">{bars("Por país", d.by_country, "country")}{bars("Por filial", d.by_branch, "branch")}{bars("Por departamento", d.by_department, "department")}</div>
        <div className="grid">
          <div className="span6 panel"><h2>Por status</h2><p className="sub">Todos os problemas, inclusive os encerrados.</p>
            {d.by_status.map((x) => (
              <button key={x.name} className={"brow" + (x.count ? "" : " zero")} onClick={() => nav(to({ status: x.name }))}>
                <span>{statusLabel(x.name)}</span><span className="track"><span className={"stbar" + (x.name === "Completed" ? " done" : "")} style={{ width: `${(x.count / smax) * 100}%` }} /></span><span className="num">{x.count}</span>
              </button>))}
          </div>
          <div className="span6 panel"><h2>Atualizações recentes</h2><p className="sub">Atividades mais recentes que você pode ver.</p>
            {feed.length ? <ul className="feed">{feed.map((e) => <FeedItem key={e.id} e={e} />)}</ul> : <p className="muted">Nenhuma atividade ainda.</p>}
            <Link className="btn ghost sm" to="/updates">Ver todas as atualizações</Link></div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="pagehead"><div><h1>Painel</h1><p>Problemas abertos, ordenados pela nota GUT validada quando disponível. Atualiza automaticamente quando alguém altera os dados.</p></div></div>
      <div className="filters">
        <label>País<select value={f.country} onChange={(e) => setF({ country: e.target.value, branch: "", department: f.department })}>{options(meta.countries, "Todos")}</select></label>
        <label>Filial<select value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}>{options(branches, "Todos")}</select></label>
        <label>Departamento<select value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>{options(meta.departments, "Todos")}</select></label>
      </div>
      {body}
    </>
  );
}
