import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { get } from "../api.js";
import { useApp } from "../context.jsx";
import { Chip, options } from "../components.jsx";
import { PRIOS, PRIO_LABEL, STATUS_LABEL, code, fmtDate, ago, labeled, statusLabel } from "../util.js";

const DEFAULTS = {
  problems: { sort: "created_at", dir: "desc" },
  ranking: { sort: "score", dir: "desc", open: "1" },
  plans: { sort: "deadline", dir: "asc", view: "plans" }
};
const TITLES = {
  problems: ["Problemas", "Todos os problemas que você tem permissão para ver."],
  ranking: ["Ranking GUT", "Problemas abertos da maior para a menor nota final (validada quando disponível)."],
  plans: ["Planos de ação", "Quem está fazendo o quê, e até quando."]
};
const KEYS = ["country", "branch", "department", "responsible", "priority", "status", "created_from", "created_to",
  "deadline_from", "deadline_to", "q", "view", "open", "sort", "dir"];
const LIMIT = 25;

export default function List({ kind }) {
  const { meta, version, canCreate } = useApp();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const f = { ...DEFAULTS[kind], ...Object.fromEntries(sp) };
  const offset = Number(sp.get("offset") || 0);
  const [data, setData] = useState(null);
  const [search, setSearch] = useState(f.q || "");

  const set = (patch, keepOffset = false) => {
    const next = { ...Object.fromEntries(sp), ...patch };
    if (!keepOffset) next.offset = "0";
    Object.keys(next).forEach((k) => next[k] === undefined && delete next[k]);
    setSp(next, { replace: true });
  };

  // busca com debounce
  useEffect(() => {
    if (search === (f.q || "")) return undefined;
    const t = setTimeout(() => set({ q: search }), 250);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line

  const qs = new URLSearchParams();
  KEYS.forEach((k) => f[k] && qs.set(k, f[k]));
  const qsKey = qs.toString();

  useEffect(() => {
    const p = new URLSearchParams(qsKey);
    p.set("limit", LIMIT); p.set("offset", offset);
    get("/problems?" + p).then(setData).catch(() => setData({ items: [], total: 0 }));
  }, [qsKey, offset, version]);

  const branches = f.country ? meta.branches.filter((b) => b.country === f.country).map((b) => b.name) : [...new Set(meta.branches.map((b) => b.name))];
  const sel = (key, label, list, blank) => (
    <label>{label}<select value={f[key] || ""} onChange={(e) => set(key === "country" ? { country: e.target.value, branch: "" } : { [key]: e.target.value })}>{options(list, blank)}</select></label>
  );
  const date = (key, label) => <label>{label}<input type="date" value={f[key] || ""} onChange={(e) => set({ [key]: e.target.value })} /></label>;
  const sortBy = (key) => set({ sort: key, dir: f.sort === key && f.dir === "desc" ? "asc" : "desc" });
  const Th = ({ label, k, cls }) => (
    <th className={cls}>{k ? <button onClick={() => sortBy(k)}>{label}{f.sort === k ? (f.dir === "asc" ? " ▲" : " ▼") : ""}</button> : label}</th>
  );
  const deadline = (p) => p.deadline ? <span className={p.overdue ? "late" : ""}>{fmtDate(p.deadline)}{p.overdue ? " (atrasado)" : ""}</span> : "—";

  const csvQs = new URLSearchParams(qs); csvQs.delete("sort"); csvQs.delete("dir");

  let table = <p className="muted">Carregando…</p>;
  if (data && !data.items.length) table = <div className="panel empty"><h2>Nenhum problema encontrado</h2><p>Altere ou limpe os filtros.</p></div>;
  else if (data) {
    const to = Math.min(offset + LIMIT, data.total);
    table = (
      <>
        <div className="tw"><table className="t"><thead><tr>
          {kind === "plans" ? (<>
            <Th label="Problema" k="title" /><Th label="Prioridade" k="score" /><Th label="Responsável" k="responsible" /><th>Plano de ação</th>
            <Th label="Prazo" k="deadline" /><Th label="Status" k="status" /><Th label="Última atualização" k="updated_at" /></>
          ) : (<>
            {kind === "ranking" ? <th className="c">Posição</th> : <Th label="ID" k="id" />}<Th label="Problema" k="title" /><Th label="País / Filial" k="country" />
            <Th label="Departamento" k="department" /><th className="c">G</th><th className="c">U</th><th className="c">T</th><Th label="GUT" k="score" cls="c" />
            <th>Prioridade</th><Th label="Responsável" k="responsible" /><Th label="Status" k="status" /><Th label="Prazo" k="deadline" /><Th label="Atualizado" k="updated_at" /></>)}
        </tr></thead><tbody>
          {data.items.map((p, i) => {
            const v = !!p.v_score;
            return (
              <tr key={p.id} className="row" tabIndex={0} onClick={() => nav(`/problems/${p.id}`)} onKeyDown={(e) => e.key === "Enter" && nav(`/problems/${p.id}`)}>
                {kind === "plans" ? (<>
                  <td><span className="ttl">{p.title}</span><span className="code">{code(p.id)}, {p.country} / {p.branch}</span></td>
                  <td><Chip p={p.priority} /> <b>{p.final_score}</b></td><td>{p.responsible_name || "Sem responsável"}</td>
                  <td>{p.action_plan || <span className="muted">Sem plano de ação</span>}</td><td>{deadline(p)}</td><td>{statusLabel(p.status)}</td>
                  <td><span className={p.stale ? "stale" : ""}>{ago(p.updated_at)}</span></td></>
                ) : (<>
                  <td className="c">{kind === "ranking" ? <b>{offset + i + 1}</b> : code(p.id)}</td>
                  <td><span className="ttl">{p.title}</span>{kind === "ranking" && <span className="code">{code(p.id)}</span>}</td>
                  <td>{p.country} / {p.branch}</td><td>{p.department}</td>
                  <td className="c">{v ? p.v_gravity : p.gravity}</td><td className="c">{v ? p.v_urgency : p.urgency}</td><td className="c">{v ? p.v_trend : p.trend}</td>
                  <td className="c"><b>{p.final_score}</b><span className="code" style={v ? { color: "var(--violet)" } : undefined}>{v ? "validada" : "preliminar"}</span></td>
                  <td><Chip p={p.priority} /></td><td>{p.responsible_name || "—"}</td><td>{statusLabel(p.status)}</td><td>{deadline(p)}</td>
                  <td><span className={p.stale ? "stale" : ""}>{ago(p.updated_at)}</span></td></>)}
              </tr>
            );
          })}
        </tbody></table></div>
        <div className="pager"><span>{offset + 1}–{to} de {data.total}</span>
          <button className="btn ghost sm" disabled={!offset} onClick={() => set({ offset: String(Math.max(0, offset - LIMIT)) }, true)}>Anterior</button>
          <button className="btn ghost sm" disabled={to >= data.total} onClick={() => set({ offset: String(offset + LIMIT) }, true)}>Próxima</button></div>
      </>
    );
  }

  return (
    <>
      <div className="pagehead"><div><h1>{TITLES[kind][0]}</h1><p>{TITLES[kind][1]}</p></div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn ghost sm" href={"/api/export/problems.csv?" + csvQs}>Exportar CSV</a>
          {canCreate && <Link className="btn sm" to="/problems/new">Novo problema</Link>}
        </div></div>
      {kind === "plans" && (
        <div className="chips">{[["plans", "Todos abertos"], ["no_plan", "Sem plano de ação"], ["overdue", "Atrasados"], ["mine", "Atribuídos a mim"], ["stale", "Sem atualização recente"]]
          .map(([v, l]) => <button key={v} aria-pressed={f.view === v} onClick={() => set({ view: v })}>{l}</button>)}</div>
      )}
      <div className="filters">
        {sel("country", "País", meta.countries, "Todos")}{sel("branch", "Filial", branches, "Todas")}{sel("department", "Departamento", meta.departments, "Todos")}
        {sel("responsible", "Responsável", [["none", "Sem responsável"], ...meta.users.map((u) => [u.id, u.name])], "Qualquer um")}
        {sel("priority", "Prioridade", labeled(PRIOS, PRIO_LABEL), "Todas")}{sel("status", "Status", labeled(meta.statuses, STATUS_LABEL), "Todos")}
        {kind === "problems" && <>{date("created_from", "Criado de")}{date("created_to", "Criado até")}</>}
        {kind !== "ranking" && <>{date("deadline_from", "Prazo de")}{date("deadline_to", "Prazo até")}</>}
        <label className="grow">Buscar<input type="search" placeholder="Título, descrição, ID ou pessoa" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        {kind === "ranking" && <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={!f.open} onChange={(e) => set({ open: e.target.checked ? "" : "1" })} /> Incluir encerrados</label>}
        <button className="btn ghost sm" onClick={() => { setSearch(""); setSp(kind === "ranking" ? { open: "1" } : kind === "plans" ? { view: "plans" } : {}, { replace: true }); }}>Limpar</button>
      </div>
      {table}
    </>
  );
}
