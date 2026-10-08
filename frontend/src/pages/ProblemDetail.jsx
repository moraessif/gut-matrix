import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { del, get, patch, post } from "../api.js";
import { useApp } from "../context.jsx";
import { Chip, CritGroup, LiveScore, Modal, options } from "../components.jsx";
import { PR, SOURCE_LABEL, STATUS_LABEL, code, fmtDT, fmtDate, labeled, sourceLabel, statusLabel, valueLabel } from "../util.js";

const TABS = [["overview", "Visão geral"], ["gut", "Avaliação GUT"], ["plan", "Plano de Ação"], ["updates", "Atualizações"], ["history", "Histórico"]];
const NULLABLE = ["responsible_id", "planned_start", "deadline", "v_gravity", "v_urgency", "v_trend"];
const CRIT_NAME = { gravity: "Gravidade", urgency: "Urgência", trend: "Tendência" };

export default function ProblemDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") || "overview";
  const { version, notify } = useApp();
  const [p, setP] = useState(null);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [askDelete, setAskDelete] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    setP(null); setError(""); setBanner(""); dirty.current = false;
    get(`/problems/${id}`).then(setP).catch((e) => setError(e.message));
  }, [id]);

  // atualização ao vivo: se outra pessoa alterou, recarrega (ou avisa quando há edição em andamento)
  useEffect(() => {
    if (!p) return;
    get(`/problems/${id}`).then((np) => {
      if (np.version === p.version) return;
      if (dirty.current) setBanner("Outra pessoa alterou este problema. Recarregue para ver a versão mais recente (suas edições não salvas serão perdidas).");
      else setP(np);
    }).catch(() => {});
  }, [version]); // eslint-disable-line

  const reload = () => { dirty.current = false; setBanner(""); get(`/problems/${id}`).then(setP).catch((e) => setError(e.message)); };

  const save = async (fields) => {
    const changed = {};
    Object.entries(fields).forEach(([k, val]) => {
      if (String(val ?? "") !== String(p[k] ?? "")) changed[k] = val === "" && NULLABLE.includes(k) ? null : val;
    });
    if (!Object.keys(changed).length) { notify("Nenhuma alteração para salvar"); return false; }
    try {
      const np = await patch(`/problems/${p.id}`, { version: p.version, ...changed });
      dirty.current = false; setBanner(""); setP(np); notify("Salvo");
      return true;
    } catch (e) {
      if (e.status === 409) setBanner(e.message); else notify(e.message, true);
      return false;
    }
  };

  if (error) return <div className="panel empty"><h2>Problema não encontrado</h2><p>{error}</p><Link className="btn" to="/problems">Voltar para problemas</Link></div>;
  if (!p) return <p className="muted">Carregando…</p>;

  const perms = new Set(p.permissions.fields);
  const doDelete = async () => {
    try { await del(`/problems/${p.id}`); notify("Problema excluído"); nav("/problems"); } catch (e) { notify(e.message, true); }
  };
  const mark = () => { dirty.current = true; };
  const props = { p, save, perms };

  return (
    <>
      <div className="pagehead" style={{ marginBottom: 6 }}><Link to="/problems" className="small muted">Voltar para problemas</Link></div>
      <div className="dhead">
        <div><div className="code">{code(p.id)} em {p.country} / {p.branch}, {p.department}</div><h1>{p.title}</h1></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className={`score p-${PR[p.priority]}`} style={{ fontSize: 22, padding: "6px 16px" }}>{p.final_score}</span>
          <Chip p={p.priority} />
          <span className="chip" style={{ border: "1px solid var(--line)" }}>{statusLabel(p.status)}</span>
          {p.overdue && <span className="late">Atrasado</span>}
          {p.permissions.can_delete && <button className="btn danger sm" onClick={() => setAskDelete(true)}>Excluir</button>}
        </div>
      </div>
      {banner && <div className="banner"><span>{banner}</span><button className="btn sm" onClick={reload}>Recarregar</button></div>}
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={k === tab} onClick={() => setSp({ tab: k }, { replace: true })}>{l}</button>)}
      </div>
      <div onChange={mark} onInput={mark} key={`${tab}-${p.version}`}>
        {tab === "overview" && <Overview {...props} />}
        {tab === "gut" && <GutTab {...props} />}
        {tab === "plan" && <PlanTab {...props} />}
        {tab === "updates" && <UpdatesTab p={p} onPosted={() => { dirty.current = false; reload(); }} refresh={version} />}
        {tab === "history" && <HistoryTab p={p} refresh={version} />}
      </div>
      {askDelete && (
        <Modal title={`Excluir ${code(p.id)}?`} onClose={() => setAskDelete(false)}>
          <p>O problema some de todas as listas. O histórico permanece na trilha de auditoria.</p>
          <div className="savebar"><button className="btn danger" onClick={doDelete}>Excluir problema</button><button className="btn ghost" onClick={() => setAskDelete(false)}>Cancelar</button></div>
        </Modal>
      )}
    </>
  );
}

function Overview({ p, save, perms }) {
  const { meta } = useApp();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({});
  const start = () => { setF({ country: p.country, branch: p.branch, department: p.department, title: p.title, description: p.description, evidence: p.evidence,
    operational_impact: p.operational_impact, consequences: p.consequences, suggested_action: p.suggested_action, impacted_area: p.impacted_area,
    source: p.source, process: p.process }); setEditing(true); };
  const ed = (k) => perms.has(k);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  if (editing) {
    const branches = meta.branches.filter((b) => b.country === f.country).map((b) => b.name);
    const area = (k, label) => <div className="f"><label className="l">{label}</label><textarea value={f[k]} disabled={!ed(k)} onChange={(e) => set(k, e.target.value)} /></div>;
    return (
      <div className="panel"><h2>Editar detalhes</h2>
        <div className="three" style={{ marginTop: 10 }}>
          <div className="f"><label className="l">País</label><select value={f.country} disabled={!ed("country")} onChange={(e) => setF((x) => ({ ...x, country: e.target.value, branch: meta.branches.find((b) => b.country === e.target.value)?.name || "" }))}>{options(meta.countries)}</select></div>
          <div className="f"><label className="l">Filial</label><select value={f.branch} disabled={!ed("branch")} onChange={(e) => set("branch", e.target.value)}>{options(branches)}</select></div>
          <div className="f"><label className="l">Departamento</label><select value={f.department} disabled={!ed("department")} onChange={(e) => set("department", e.target.value)}>{options(meta.departments)}</select></div>
        </div>
        <div className="f"><label className="l">Título</label><input type="text" value={f.title} disabled={!ed("title")} onChange={(e) => set("title", e.target.value)} /></div>
        {area("description", "Descrição")}{area("evidence", "Evidências")}{area("operational_impact", "Impacto operacional")}{area("consequences", "Consequências se não for resolvido")}{area("suggested_action", "Ação sugerida")}
        <div className="two">
          <div className="f"><label className="l">Área impactada</label><input type="text" value={f.impacted_area} disabled={!ed("impacted_area")} onChange={(e) => set("impacted_area", e.target.value)} /></div>
          <div className="f"><label className="l">Processo impactado</label><input type="text" value={f.process} disabled={!ed("process")} onChange={(e) => set("process", e.target.value)} /></div>
        </div>
        <div className="f"><label className="l">Origem do problema</label><select value={f.source} disabled={!ed("source")} onChange={(e) => set("source", e.target.value)}>{options(labeled(meta.sources, SOURCE_LABEL), "—")}</select></div>
        <div className="savebar"><button className="btn" onClick={async () => { const o = {}; Object.keys(f).forEach((k) => ed(k) && (o[k] = typeof f[k] === "string" ? f[k].trim() : f[k])); await save(o); }}>Salvar alterações</button>
          <button className="btn ghost" onClick={() => setEditing(false)}>Cancelar</button></div>
      </div>
    );
  }
  const canEdit = ed("title") || ed("description");
  const block = (label, v) => <><span className="lab">{label}</span><p className="txt">{v || <span className="muted">Não informado</span>}</p></>;
  return (
    <div className="grid">
      <div className="span7"><div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2>Problema</h2>{canEdit && <button className="btn ghost sm" onClick={start}>Editar detalhes</button>}</div>
        {block("Descrição", p.description)}{block("Evidências", p.evidence)}{block("Impacto operacional", p.operational_impact)}
        {block("Consequências se não for resolvido", p.consequences)}{block("Ação sugerida (por quem registrou)", p.suggested_action)}
      </div></div>
      <div className="span5"><div className="panel"><h2>Registro</h2>
        <dl className="kv" style={{ marginTop: 10 }}>
          <dt>ID do problema</dt><dd>{code(p.id)}</dd><dt>Criado em</dt><dd>{fmtDT(p.created_at)}</dd><dt>Criado por</dt><dd>{p.created_by_name}</dd>
          <dt>País</dt><dd>{p.country}</dd><dt>Filial</dt><dd>{p.branch}</dd><dt>Departamento</dt><dd>{p.department}</dd>
          <dt>Processo impactado</dt><dd>{p.process || "—"}</dd><dt>Área impactada</dt><dd>{p.impacted_area || "—"}</dd><dt>Origem</dt><dd>{sourceLabel(p.source) || "—"}</dd>
          <dt>Responsável</dt><dd>{p.responsible_name || "Sem responsável"}</dd><dt>Prazo</dt><dd>{fmtDate(p.deadline)}</dd><dt>Status</dt><dd>{statusLabel(p.status)}</dd>
          <dt>Última atualização</dt><dd>{fmtDT(p.updated_at)}</dd><dt>Atualizado por</dt><dd>{p.updated_by_name || "—"}</dd>
        </dl></div></div>
    </div>
  );
}

function GutTab({ p, save, perms }) {
  const { meta } = useApp();
  const KEYS = [["gravity", "g_just", "v_gravity"], ["urgency", "u_just", "v_urgency"], ["trend", "t_just", "v_trend"]];
  const [s, setS] = useState({ gravity: p.gravity, urgency: p.urgency, trend: p.trend, g_just: p.g_just, u_just: p.u_just, t_just: p.t_just,
    v_gravity: p.v_gravity ?? "", v_urgency: p.v_urgency ?? "", v_trend: p.v_trend ?? "" });
  const [msg, setMsg] = useState("");
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const gEdit = KEYS.some(([k]) => perms.has(k)), vEdit = KEYS.some(([, , v]) => perms.has(v));
  const saveVal = () => {
    const vals = KEYS.map(([, , v]) => s[v]);
    const n = vals.filter((x) => x !== "").length;
    if (n && n < 3) { setMsg("Defina as três notas validadas ou limpe as três."); return; }
    setMsg("");
    save(Object.fromEntries(KEYS.map(([, , v]) => [v, s[v] === "" ? null : Number(s[v])])));
  };
  return (
    <div className="grid">
      <div className="span7"><div className="panel"><h2>Avaliação preliminar</h2>
        <p className="sub">Enviada por {p.created_by_name}. Nota preliminar: <b>{p.gut_score}</b>.</p>
        {KEYS.map(([k, j]) => (
          <div className="f" key={k}><span className="l">{CRIT_NAME[k]}</span>
            <CritGroup name={k} scale={meta.scales[k]} value={s[k]} disabled={!perms.has(k)} onChange={(x) => set(k, x)} />
            <textarea value={s[j]} disabled={!perms.has(k)} placeholder="Justificativa" onChange={(e) => set(j, e.target.value)} /></div>
        ))}
        <LiveScore g={s.gravity} u={s.urgency} t={s.trend} />
        {gEdit && <div className="savebar"><button className="btn" onClick={() => save(Object.fromEntries(KEYS.flatMap(([k, j]) => perms.has(k) ? [[k, Number(s[k])], [j, s[j].trim()]] : [])))}>Salvar notas preliminares</button></div>}
      </div></div>
      <div className="span5">
        <div className="panel"><h2>Avaliação validada</h2>
          <p className="sub">{p.v_score ? `Validada por ${p.validated_by_name || "?"} em ${fmtDT(p.validated_at)}.` : "Ainda não validada. O ranking usa a nota preliminar."}</p>
          {KEYS.map(([k, , v]) => (
            <div key={v}><label className="lab">{CRIT_NAME[k]}</label>
              <select value={s[v]} disabled={!perms.has(v)} onChange={(e) => set(v, e.target.value)}>
                {options(meta.scales[k].map((t, i) => [i + 1, `${i + 1} – ${t}`]), "Não validada")}</select></div>))}
          {vEdit ? <><div className="savebar"><button className="btn" onClick={saveVal}>Salvar validação</button></div>
            {msg && <div className="err">{msg}</div>}<p className="small muted">Defina as três, ou limpe as três para remover a validação.</p></>
            : <p className="small muted" style={{ marginTop: 12 }}>Somente um Super Admin pode validar notas.</p>}
        </div>
        <div className="panel" style={{ marginTop: 18 }}><h2>Nota final</h2>
          <div className="live"><span className={`score p-${PR[p.priority]}`} style={{ fontSize: 22, padding: "6px 16px" }}>{p.final_score}</span><Chip p={p.priority} />
            <span className="muted small">{p.v_score ? "validada" : "preliminar"}</span></div></div>
      </div>
    </div>
  );
}

function PlanTab({ p, save, perms }) {
  const { meta } = useApp();
  const [s, setS] = useState({ responsible_id: p.responsible_id ?? "", status: p.status, planned_start: p.planned_start || "", deadline: p.deadline || "", action_plan: p.action_plan });
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const anyEdit = ["responsible_id", "status", "action_plan", "deadline", "planned_start"].some((k) => perms.has(k));
  return (
    <div className="panel" style={{ maxWidth: 820 }}><h2>Plano de ação</h2>
      <div className="two" style={{ marginTop: 10 }}>
        <div className="f"><label className="l">Pessoa responsável</label>
          <select value={s.responsible_id} disabled={!perms.has("responsible_id")} onChange={(e) => set("responsible_id", e.target.value)}>{options(meta.users.map((u) => [u.id, u.name]), "Sem responsável")}</select></div>
        <div className="f"><label className="l">Status</label>
          <select value={s.status} disabled={!perms.has("status")} onChange={(e) => set("status", e.target.value)}>{options(labeled(meta.statuses, STATUS_LABEL))}</select></div>
        <div className="f"><label className="l">Início planejado</label><input type="date" value={s.planned_start} disabled={!perms.has("planned_start")} onChange={(e) => set("planned_start", e.target.value)} /></div>
        <div className="f"><label className="l">Prazo</label><input type="date" value={s.deadline} disabled={!perms.has("deadline")} onChange={(e) => set("deadline", e.target.value)} /></div>
      </div>
      <div className="f"><label className="l">Plano de ação</label><textarea style={{ minHeight: 140 }} value={s.action_plan} disabled={!perms.has("action_plan")} onChange={(e) => set("action_plan", e.target.value)} /></div>
      {anyEdit ? <div className="savebar"><button className="btn" onClick={() => {
        const o = {};
        if (perms.has("responsible_id")) o.responsible_id = s.responsible_id === "" ? "" : Number(s.responsible_id);
        if (perms.has("status")) o.status = s.status;
        if (perms.has("planned_start")) o.planned_start = s.planned_start;
        if (perms.has("deadline")) o.deadline = s.deadline;
        if (perms.has("action_plan")) o.action_plan = s.action_plan.trim();
        save(o);
      }}>Salvar plano de ação</button></div> : <p className="small muted">Você pode ver, mas não alterar, o plano de ação.</p>}
    </div>
  );
}

function UpdatesTab({ p, onPosted, refresh }) {
  const { notify } = useApp();
  const [list, setList] = useState(null);
  const [text, setText] = useState("");
  const load = useCallback(() => get(`/problems/${p.id}/updates`).then(setList).catch(() => setList([])), [p.id]);
  useEffect(() => { load(); }, [load, refresh]);
  const send = async () => {
    if (!text.trim()) return;
    try { await post(`/problems/${p.id}/updates`, { body: text.trim() }); setText(""); notify("Atualização publicada"); onPosted(); }
    catch (e) { notify(e.message, true); }
  };
  return (
    <div className="panel" style={{ maxWidth: 820 }}><h2>Atualizações de andamento</h2>
      <p className="sub">Adicione informações conforme o problema evolui. Cada atualização também fica registrada no Histórico.</p>
      {p.permissions.can_update ? <>
        <textarea maxLength={3000} placeholder="O que mudou? O que foi feito? O que está travando?" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="savebar"><button className="btn" onClick={send}>Publicar atualização</button></div></>
        : <p className="small muted">Você pode ler as atualizações, mas não publicá-las.</p>}
      <ul className="timeline" style={{ marginTop: 22 }}>
        {list === null ? <li className="muted">Carregando…</li> : list.length ? list.map((u) => (
          <li key={u.id} className="k-update"><span className="who">{u.user_name}</span> <span className="at">{fmtDT(u.created_at)}</span><p className="txt" style={{ marginTop: 4 }}>{u.body}</p></li>
        )) : <li><span className="muted">Nenhuma atualização ainda.</span></li>}
      </ul>
    </div>
  );
}

function HistoryTab({ p, refresh }) {
  const [h, setH] = useState(null);
  useEffect(() => { get(`/problems/${p.id}/history`).then(setH).catch(() => setH([])); }, [p.id, p.version, refresh]);
  const val = (f, v) => (v == null ? "(vazio)" : ["deadline", "planned_start"].includes(f) ? fmtDate(v) : valueLabel(f, v));
  return (
    <div className="panel" style={{ maxWidth: 900 }}><h2>Histórico completo</h2>
      <p className="sub">Todas as alterações: o quê, valor anterior, novo valor, quem e quando{h ? ` (${h.length} registros)` : ""}.</p>
      {h === null ? <p className="muted">Carregando…</p> : (
        <ul className="timeline">{h.map((x) => x.kind === "created" ? (
          <li key={x.id} className="k-created"><span className="who">Problema registrado</span> <span className="at">{fmtDT(x.at)}, por {x.user_name}</span></li>
        ) : x.kind === "update" ? (
          <li key={x.id} className="k-update"><span className="who">Atualização de andamento</span> <span className="at">{fmtDT(x.at)}, por {x.user_name}</span><div className="txt" style={{ marginTop: 4 }}>{x.new_value}</div></li>
        ) : x.kind === "deleted" ? (
          <li key={x.id}><span className="who">Excluído</span> <span className="at">{fmtDT(x.at)}, por {x.user_name}</span></li>
        ) : (
          <li key={x.id}><span className="who">Alteração em {x.field_label}</span> <span className="at">{fmtDT(x.at)}, por {x.user_name || "?"}</span>
            <div className="diff"><div className="o"><small>Valor anterior</small>{val(x.field, x.old_value)}</div><div className="n"><small>Novo valor</small>{val(x.field, x.new_value)}</div></div></li>
        ))}</ul>
      )}
    </div>
  );
}
