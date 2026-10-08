import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { del, get, patch, post } from "../api.js";
import { useApp } from "../context.jsx";
import { Chip, CritGroup, LiveScore, Modal, options } from "../components.jsx";
import { PR, code, fmtDT, fmtDate } from "../util.js";

const TABS = [["overview", "Overview"], ["gut", "GUT Evaluation"], ["plan", "Action Plan"], ["updates", "Updates"], ["history", "History"]];
const NULLABLE = ["responsible_id", "planned_start", "deadline", "v_gravity", "v_urgency", "v_trend"];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

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
      if (dirty.current) setBanner("Someone else changed this problem. Reload to see the latest version (your unsaved edits will be lost).");
      else setP(np);
    }).catch(() => {});
  }, [version]); // eslint-disable-line

  const reload = () => { dirty.current = false; setBanner(""); get(`/problems/${id}`).then(setP).catch((e) => setError(e.message)); };

  const save = async (fields) => {
    const changed = {};
    Object.entries(fields).forEach(([k, val]) => {
      if (String(val ?? "") !== String(p[k] ?? "")) changed[k] = val === "" && NULLABLE.includes(k) ? null : val;
    });
    if (!Object.keys(changed).length) { notify("No changes to save"); return false; }
    try {
      const np = await patch(`/problems/${p.id}`, { version: p.version, ...changed });
      dirty.current = false; setBanner(""); setP(np); notify("Saved");
      return true;
    } catch (e) {
      if (e.status === 409) setBanner(e.message); else notify(e.message, true);
      return false;
    }
  };

  if (error) return <div className="panel empty"><h2>Problem not found</h2><p>{error}</p><Link className="btn" to="/problems">Back to problems</Link></div>;
  if (!p) return <p className="muted">Loading…</p>;

  const perms = new Set(p.permissions.fields);
  const doDelete = async () => {
    try { await del(`/problems/${p.id}`); notify("Problem deleted"); nav("/problems"); } catch (e) { notify(e.message, true); }
  };
  const mark = () => { dirty.current = true; };
  const props = { p, save, perms };

  return (
    <>
      <div className="pagehead" style={{ marginBottom: 6 }}><Link to="/problems" className="small muted">Back to problems</Link></div>
      <div className="dhead">
        <div><div className="code">{code(p.id)} in {p.country} / {p.branch}, {p.department}</div><h1>{p.title}</h1></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className={`score p-${PR[p.priority]}`} style={{ fontSize: 22, padding: "6px 16px" }}>{p.final_score}</span>
          <Chip p={p.priority} />
          <span className="chip" style={{ border: "1px solid var(--line)" }}>{p.status}</span>
          {p.overdue && <span className="late">Overdue</span>}
          {p.permissions.can_delete && <button className="btn danger sm" onClick={() => setAskDelete(true)}>Delete</button>}
        </div>
      </div>
      {banner && <div className="banner"><span>{banner}</span><button className="btn sm" onClick={reload}>Reload</button></div>}
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
        <Modal title={`Delete ${code(p.id)}?`} onClose={() => setAskDelete(false)}>
          <p>The problem disappears from every list. Its history stays in the audit trail.</p>
          <div className="savebar"><button className="btn danger" onClick={doDelete}>Delete problem</button><button className="btn ghost" onClick={() => setAskDelete(false)}>Cancel</button></div>
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
      <div className="panel"><h2>Edit details</h2>
        <div className="three" style={{ marginTop: 10 }}>
          <div className="f"><label className="l">Country</label><select value={f.country} disabled={!ed("country")} onChange={(e) => setF((x) => ({ ...x, country: e.target.value, branch: meta.branches.find((b) => b.country === e.target.value)?.name || "" }))}>{options(meta.countries)}</select></div>
          <div className="f"><label className="l">Branch</label><select value={f.branch} disabled={!ed("branch")} onChange={(e) => set("branch", e.target.value)}>{options(branches)}</select></div>
          <div className="f"><label className="l">Department</label><select value={f.department} disabled={!ed("department")} onChange={(e) => set("department", e.target.value)}>{options(meta.departments)}</select></div>
        </div>
        <div className="f"><label className="l">Title</label><input type="text" value={f.title} disabled={!ed("title")} onChange={(e) => set("title", e.target.value)} /></div>
        {area("description", "Description")}{area("evidence", "Evidence")}{area("operational_impact", "Operational impact")}{area("consequences", "Consequences if not solved")}{area("suggested_action", "Suggested action")}
        <div className="two">
          <div className="f"><label className="l">Impacted area</label><input type="text" value={f.impacted_area} disabled={!ed("impacted_area")} onChange={(e) => set("impacted_area", e.target.value)} /></div>
          <div className="f"><label className="l">Impacted process</label><input type="text" value={f.process} disabled={!ed("process")} onChange={(e) => set("process", e.target.value)} /></div>
        </div>
        <div className="f"><label className="l">Problem source</label><select value={f.source} disabled={!ed("source")} onChange={(e) => set("source", e.target.value)}>{options(meta.sources, "—")}</select></div>
        <div className="savebar"><button className="btn" onClick={async () => { const o = {}; Object.keys(f).forEach((k) => ed(k) && (o[k] = typeof f[k] === "string" ? f[k].trim() : f[k])); await save(o); }}>Save changes</button>
          <button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button></div>
      </div>
    );
  }
  const canEdit = ed("title") || ed("description");
  const block = (label, v) => <><span className="lab">{label}</span><p className="txt">{v || <span className="muted">Not provided</span>}</p></>;
  return (
    <div className="grid">
      <div className="span7"><div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2>Problem</h2>{canEdit && <button className="btn ghost sm" onClick={start}>Edit details</button>}</div>
        {block("Description", p.description)}{block("Evidence", p.evidence)}{block("Operational impact", p.operational_impact)}
        {block("Consequences if not solved", p.consequences)}{block("Suggested action (from submitter)", p.suggested_action)}
      </div></div>
      <div className="span5"><div className="panel"><h2>Record</h2>
        <dl className="kv" style={{ marginTop: 10 }}>
          <dt>Problem ID</dt><dd>{code(p.id)}</dd><dt>Created</dt><dd>{fmtDT(p.created_at)}</dd><dt>Created by</dt><dd>{p.created_by_name}</dd>
          <dt>Country</dt><dd>{p.country}</dd><dt>Branch</dt><dd>{p.branch}</dd><dt>Department</dt><dd>{p.department}</dd>
          <dt>Impacted process</dt><dd>{p.process || "—"}</dd><dt>Impacted area</dt><dd>{p.impacted_area || "—"}</dd><dt>Source</dt><dd>{p.source || "—"}</dd>
          <dt>Responsible</dt><dd>{p.responsible_name || "Unassigned"}</dd><dt>Deadline</dt><dd>{fmtDate(p.deadline)}</dd><dt>Status</dt><dd>{p.status}</dd>
          <dt>Last update</dt><dd>{fmtDT(p.updated_at)}</dd><dt>Updated by</dt><dd>{p.updated_by_name || "—"}</dd>
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
    if (n && n < 3) { setMsg("Set all three validated scores, or clear all three."); return; }
    setMsg("");
    save(Object.fromEntries(KEYS.map(([, , v]) => [v, s[v] === "" ? null : Number(s[v])])));
  };
  return (
    <div className="grid">
      <div className="span7"><div className="panel"><h2>Preliminary assessment</h2>
        <p className="sub">Submitted by {p.created_by_name}. Preliminary score: <b>{p.gut_score}</b>.</p>
        {KEYS.map(([k, j]) => (
          <div className="f" key={k}><span className="l">{cap(k)}</span>
            <CritGroup name={k} scale={meta.scales[k]} value={s[k]} disabled={!perms.has(k)} onChange={(x) => set(k, x)} />
            <textarea value={s[j]} disabled={!perms.has(k)} placeholder="Justification" onChange={(e) => set(j, e.target.value)} /></div>
        ))}
        <LiveScore g={s.gravity} u={s.urgency} t={s.trend} />
        {gEdit && <div className="savebar"><button className="btn" onClick={() => save(Object.fromEntries(KEYS.flatMap(([k, j]) => perms.has(k) ? [[k, Number(s[k])], [j, s[j].trim()]] : [])))}>Save preliminary scores</button></div>}
      </div></div>
      <div className="span5">
        <div className="panel"><h2>Validated assessment</h2>
          <p className="sub">{p.v_score ? `Validated by ${p.validated_by_name || "?"} on ${fmtDT(p.validated_at)}.` : "Not validated yet. The ranking uses the preliminary score."}</p>
          {KEYS.map(([k, , v]) => (
            <div key={v}><label className="lab">{cap(k)}</label>
              <select value={s[v]} disabled={!perms.has(v)} onChange={(e) => set(v, e.target.value)}>
                {options(meta.scales[k].map((t, i) => [i + 1, `${i + 1} – ${t}`]), "Not validated")}</select></div>))}
          {vEdit ? <><div className="savebar"><button className="btn" onClick={saveVal}>Save validation</button></div>
            {msg && <div className="err">{msg}</div>}<p className="small muted">Set all three, or clear all three to remove validation.</p></>
            : <p className="small muted" style={{ marginTop: 12 }}>Only a Super Admin can validate scores.</p>}
        </div>
        <div className="panel" style={{ marginTop: 18 }}><h2>Final score</h2>
          <div className="live"><span className={`score p-${PR[p.priority]}`} style={{ fontSize: 22, padding: "6px 16px" }}>{p.final_score}</span><Chip p={p.priority} />
            <span className="muted small">{p.v_score ? "validated" : "preliminary"}</span></div></div>
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
    <div className="panel" style={{ maxWidth: 820 }}><h2>Action plan</h2>
      <div className="two" style={{ marginTop: 10 }}>
        <div className="f"><label className="l">Responsible person</label>
          <select value={s.responsible_id} disabled={!perms.has("responsible_id")} onChange={(e) => set("responsible_id", e.target.value)}>{options(meta.users.map((u) => [u.id, u.name]), "Unassigned")}</select></div>
        <div className="f"><label className="l">Status</label>
          <select value={s.status} disabled={!perms.has("status")} onChange={(e) => set("status", e.target.value)}>{options(meta.statuses)}</select></div>
        <div className="f"><label className="l">Planned start</label><input type="date" value={s.planned_start} disabled={!perms.has("planned_start")} onChange={(e) => set("planned_start", e.target.value)} /></div>
        <div className="f"><label className="l">Deadline</label><input type="date" value={s.deadline} disabled={!perms.has("deadline")} onChange={(e) => set("deadline", e.target.value)} /></div>
      </div>
      <div className="f"><label className="l">Action plan</label><textarea style={{ minHeight: 140 }} value={s.action_plan} disabled={!perms.has("action_plan")} onChange={(e) => set("action_plan", e.target.value)} /></div>
      {anyEdit ? <div className="savebar"><button className="btn" onClick={() => {
        const o = {};
        if (perms.has("responsible_id")) o.responsible_id = s.responsible_id === "" ? "" : Number(s.responsible_id);
        if (perms.has("status")) o.status = s.status;
        if (perms.has("planned_start")) o.planned_start = s.planned_start;
        if (perms.has("deadline")) o.deadline = s.deadline;
        if (perms.has("action_plan")) o.action_plan = s.action_plan.trim();
        save(o);
      }}>Save action plan</button></div> : <p className="small muted">You can view but not change the action plan.</p>}
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
    try { await post(`/problems/${p.id}/updates`, { body: text.trim() }); setText(""); notify("Update posted"); onPosted(); }
    catch (e) { notify(e.message, true); }
  };
  return (
    <div className="panel" style={{ maxWidth: 820 }}><h2>Progress updates</h2>
      <p className="sub">Add information as the problem evolves. Each update is also recorded in History.</p>
      {p.permissions.can_update ? <>
        <textarea maxLength={3000} placeholder="What changed? What was done? What is blocking?" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="savebar"><button className="btn" onClick={send}>Post update</button></div></>
        : <p className="small muted">You can read updates but not post them.</p>}
      <ul className="timeline" style={{ marginTop: 22 }}>
        {list === null ? <li className="muted">Loading…</li> : list.length ? list.map((u) => (
          <li key={u.id} className="k-update"><span className="who">{u.user_name}</span> <span className="at">{fmtDT(u.created_at)}</span><p className="txt" style={{ marginTop: 4 }}>{u.body}</p></li>
        )) : <li><span className="muted">No updates yet.</span></li>}
      </ul>
    </div>
  );
}

function HistoryTab({ p, refresh }) {
  const [h, setH] = useState(null);
  useEffect(() => { get(`/problems/${p.id}/history`).then(setH).catch(() => setH([])); }, [p.id, p.version, refresh]);
  const val = (f, v) => (v == null ? "(empty)" : ["deadline", "planned_start"].includes(f) ? fmtDate(v) : v);
  return (
    <div className="panel" style={{ maxWidth: 900 }}><h2>Complete history</h2>
      <p className="sub">Every change: what, previous value, new value, who and when{h ? ` (${h.length} entries)` : ""}.</p>
      {h === null ? <p className="muted">Loading…</p> : (
        <ul className="timeline">{h.map((x) => x.kind === "created" ? (
          <li key={x.id} className="k-created"><span className="who">Problem registered</span> <span className="at">{fmtDT(x.at)}, by {x.user_name}</span></li>
        ) : x.kind === "update" ? (
          <li key={x.id} className="k-update"><span className="who">Progress update</span> <span className="at">{fmtDT(x.at)}, by {x.user_name}</span><div className="txt" style={{ marginTop: 4 }}>{x.new_value}</div></li>
        ) : x.kind === "deleted" ? (
          <li key={x.id}><span className="who">Deleted</span> <span className="at">{fmtDT(x.at)}, by {x.user_name}</span></li>
        ) : (
          <li key={x.id}><span className="who">{x.field_label} changed</span> <span className="at">{fmtDT(x.at)}, by {x.user_name || "?"}</span>
            <div className="diff"><div className="o"><small>Previous value</small>{val(x.field, x.old_value)}</div><div className="n"><small>New value</small>{val(x.field, x.new_value)}</div></div></li>
        ))}</ul>
      )}
    </div>
  );
}
