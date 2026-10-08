import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { get } from "../api.js";
import { useApp } from "../context.jsx";
import { Chip, GutMap, Field, options, StackRow } from "../components.jsx";
import { PR, PRIOS, code, sentence, ago, fmtDT } from "../util.js";

export function FeedItem({ e }) {
  const nav = useNavigate();
  return (
    <li onClick={() => nav(`/problems/${e.problem_id}`)} tabIndex={0} onKeyDown={(k) => k.key === "Enter" && nav(`/problems/${e.problem_id}`)}>
      <span className="when" title={fmtDT(e.at)}>{ago(e.at)}</span>
      <span>
        <span className="s">{sentence(e)}</span>
        <span className="m" style={{ display: "block" }}>{e.problem_title}{e.kind !== "update" && e.user_name ? ", by " + e.user_name : ""}</span>
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

  let body = <p className="muted">Loading…</p>;
  if (error) body = <div className="panel empty"><h2>Could not load</h2><p>{error}</p></div>;
  else if (d && !d.kpis.total) body = (
    <div className="panel empty"><h2>No problems yet</h2><p>Register the first problem to start the ranking.</p>
      {canCreate && <Link className="btn" to="/problems/new">New problem</Link>}</div>
  );
  else if (d) {
    const k = d.kpis;
    const st = (n, label, href) => <button className="stat" disabled={!href} onClick={() => href && nav(href)}><span className="n">{n}</span><span className="l">{label}</span></button>;
    const pc = Object.fromEntries(d.by_priority.map((x) => [x.name, x.count]));
    const bars = (title, rows, key) => {
      const mx = Math.max(1, ...rows.map((r) => r.total));
      return (
        <div className="span4 panel"><h2>{title}</h2><p className="sub">Open, colored by priority.</p>
          {rows.length ? rows.map((r) => <StackRow key={r.name} name={r.name} d={r} max={mx} onClick={() => nav(to({ [key]: r.name, open: 1 }))} />) : <p className="muted">Nothing open.</p>}
        </div>
      );
    };
    const smax = Math.max(1, ...d.by_status.map((x) => x.count));
    body = (
      <>
        <div className="strip">
          {st(k.open, "Open problems", to({ open: 1, sort: "score" }))}
          {st(k.new, "New", to({ status: "New" }))}
          {st(k.critical, "Critical", to({ priority: "Critical", open: 1 }))}
          {st(k.high_priority, "High priority (Very High + High)", to({ open: 1, sort: "score" }))}
          {st(k.in_progress, "In progress", to({ status: "In Progress" }))}
          {st(k.overdue, "Overdue", to({ view: "overdue" }))}
          {st(k.completed, "Completed", to({ status: "Completed" }))}
          {st(k.stale, `No update in ${meta.stale_days} days`, to({ view: "stale" }))}
          {st(k.avg_score, "Average GUT score")}
        </div>
        <div className="grid">
          <div className="span7"><div className="mapwrap">
            <h2>GUT map</h2>
            <p className="sub">Open problems. Higher and further right is more grave and urgent; larger dots are worsening faster.</p>
            <GutMap items={d.map} />
            <div className="legend"><span>trend 1 = small dot, trend 5 = large dot</span><span>white ring = validated score</span></div>
          </div></div>
          <div className="span5"><div className="panel" style={{ height: "100%" }}>
            <h2>Top 10 priorities</h2><p className="sub">Highest final GUT score among open problems.</p>
            {d.top10.length ? (
              <ol className="toplist">{d.top10.map((x, i) => (
                <li key={x.id} tabIndex={0} onClick={() => nav(`/problems/${x.id}`)}>
                  <span className="rk">{i + 1}</span>
                  <span><span className="t">{x.title}</span><br />
                    <span className="m">{code(x.id)} in {x.country} / {x.branch}, {x.department}{x.overdue && <b className="late"> (overdue)</b>}</span></span>
                  <span className={`score p-${PR[x.priority]}`}>{x.final_score}</span>
                </li>))}</ol>
            ) : <p className="muted">No open problems.</p>}
          </div></div>
        </div>
        <div className="panel" style={{ marginBottom: 18 }}>
          <h2>Open problems by priority</h2><p className="sub">Critical 80–125, Very High 50–79, High 30–49, Medium 15–29, Low 1–14.</p>
          <div className="pbar">{PRIOS.some((p) => pc[p]) ? PRIOS.map((p) => pc[p] ? <div key={p} className={`p-${PR[p]}`} style={{ flex: pc[p] }}>{pc[p]}</div> : null) : <div style={{ flex: 1, background: "var(--surface2)" }} />}</div>
          <div className="plegend">{PRIOS.map((p) => <span key={p}><Chip p={p} /> <b>{pc[p]}</b></span>)}</div>
        </div>
        <div className="grid">{bars("By country", d.by_country, "country")}{bars("By branch", d.by_branch, "branch")}{bars("By department", d.by_department, "department")}</div>
        <div className="grid">
          <div className="span6 panel"><h2>By status</h2><p className="sub">All problems, including closed.</p>
            {d.by_status.map((x) => (
              <button key={x.name} className={"brow" + (x.count ? "" : " zero")} onClick={() => nav(to({ status: x.name }))}>
                <span>{x.name}</span><span className="track"><span className={"stbar" + (x.name === "Completed" ? " done" : "")} style={{ width: `${(x.count / smax) * 100}%` }} /></span><span className="num">{x.count}</span>
              </button>))}
          </div>
          <div className="span6 panel"><h2>Recent updates</h2><p className="sub">Latest activity you can see.</p>
            {feed.length ? <ul className="feed">{feed.map((e) => <FeedItem key={e.id} e={e} />)}</ul> : <p className="muted">No activity yet.</p>}
            <Link className="btn ghost sm" to="/updates">See all updates</Link></div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="pagehead"><div><h1>Dashboard</h1><p>Open problems, ranked by validated GUT score when available. Updates automatically when anyone changes data.</p></div></div>
      <div className="filters">
        <label>Country<select value={f.country} onChange={(e) => setF({ country: e.target.value, branch: "", department: f.department })}>{options(meta.countries, "All")}</select></label>
        <label>Branch<select value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}>{options(branches, "All")}</select></label>
        <label>Department<select value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>{options(meta.departments, "All")}</select></label>
      </div>
      {body}
    </>
  );
}
