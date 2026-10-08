import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { post } from "../api.js";
import { useApp } from "../context.jsx";
import { CritGroup, LiveScore, options } from "../components.jsx";
import { code } from "../util.js";

const CRIT_Q = { gravity: "How severe is the impact of this problem?", urgency: "How soon must it be addressed?", trend: "What happens if nothing is done?" };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export default function NewProblem() {
  const { me, meta, canCreate, notify } = useApp();
  const nav = useNavigate();
  const countries = me.scope_country ? [me.scope_country] : meta.countries;
  const depts = me.scope_department ? [me.scope_department] : meta.departments;
  const branchesFor = (c) => (me.scope_branch ? [me.scope_branch] : meta.branches.filter((b) => b.country === c).map((b) => b.name));
  const [v, setV] = useState({ country: countries[0], branch: branchesFor(countries[0])[0] || "", department: depts.length === 1 ? depts[0] : "",
    title: "", description: "", evidence: "", operational_impact: "", consequences: "", source: "", suggested_action: "",
    gravity: 0, urgency: 0, trend: 0, g_just: "", u_just: "", t_just: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, val) => { setV((x) => ({ ...x, [k]: val })); setErrors((e) => ({ ...e, [k]: undefined })); };

  if (!canCreate) return <div className="panel empty"><h2>Read-only access</h2><p>Your role cannot register problems.</p></div>;

  const submit = async () => {
    const e = {};
    [["title", "Title required."], ["description", "Description required."], ["evidence", "Evidence required."], ["operational_impact", "Operational impact required."], ["consequences", "Consequences required."]]
      .forEach(([k, m]) => { if (!v[k].trim()) e[k] = m; });
    if (!v.department) e.department = "Select the department.";
    ["gravity", "urgency", "trend"].forEach((k) => { if (!v[k]) e[k] = "Choose a score from 1 to 5."; });
    setErrors(e);
    if (Object.keys(e).length) { setFormError("Fix the highlighted fields."); return; }
    setBusy(true); setFormError("");
    try {
      const p = await post("/problems", v);
      notify(`Problem ${code(p.id)} registered`);
      nav(`/problems/${p.id}`);
    } catch (er) { setFormError(er.message); setBusy(false); }
  };

  const text = (k, n, label, hint, area) => (
    <div className="f">
      <label className="l" htmlFor={k}>{n}. {label}</label>{hint && <p className="h">{hint}</p>}
      {area ? <textarea id={k} maxLength={5000} value={v[k]} aria-invalid={!!errors[k]} onChange={(e) => set(k, e.target.value)} />
        : <input id={k} type="text" maxLength={200} value={v[k]} aria-invalid={!!errors[k]} onChange={(e) => set(k, e.target.value)} />}
      {errors[k] && <div className="err">{errors[k]}</div>}
    </div>
  );
  const crit = (k, n, jk) => (
    <div className="f">
      <span className="l">{n}. {cap(k)} (1 to 5)</span><p className="h">{CRIT_Q[k]}</p>
      <CritGroup name={k} scale={meta.scales[k]} value={v[k]} onChange={(x) => set(k, x)} />
      {errors[k] && <div className="err">{errors[k]}</div>}
      <label className="l" style={{ fontWeight: 500 }}>Justification</label>
      <textarea maxLength={2000} placeholder="Why this score?" value={v[jk]} onChange={(e) => set(jk, e.target.value)} />
    </div>
  );

  return (
    <>
      <div className="pagehead"><div><h1>New problem</h1><p>Your scores are a preliminary assessment; a Super Admin validates them later.</p></div></div>
      <div className="grid">
        <div className="span7">
          <div className="panel"><h2>Where</h2>
            <div className="three" style={{ marginTop: 10 }}>
              <div className="f"><label className="l">Country</label>
                <select value={v.country} onChange={(e) => setV((x) => ({ ...x, country: e.target.value, branch: branchesFor(e.target.value)[0] || "" }))}>{options(countries)}</select></div>
              <div className="f"><label className="l">Branch</label>
                <select value={v.branch} onChange={(e) => set("branch", e.target.value)}>{options(branchesFor(v.country))}</select></div>
              <div className="f"><label className="l">Department / Area</label>
                <select value={v.department} aria-invalid={!!errors.department} onChange={(e) => set("department", e.target.value)}>{options(depts, depts.length === 1 ? null : "Select…")}</select></div>
            </div>
            {errors.department && <div className="err">{errors.department}</div>}
          </div>
          <div className="panel" style={{ marginTop: 18 }}><h2>The problem</h2>
            {text("title", 1, "Title", "One line.")}
            {text("description", 2, "Description", "What is happening, where, since when, who is affected?", true)}
            {text("evidence", 3, "Evidence", "Data, examples, reports, dates.", true)}
            {text("operational_impact", 4, "Operational impact", "Which process, team, customer or cost is affected?", true)}
            {text("consequences", 5, "Consequences if no action is taken", "", true)}
            <div className="f"><label className="l">Problem source</label>
              <select value={v.source} onChange={(e) => set("source", e.target.value)}>{options(meta.sources, "—")}</select></div>
          </div>
          <div className="panel" style={{ marginTop: 18 }}><h2>GUT evaluation</h2>
            {crit("gravity", 6, "g_just")}{crit("urgency", 7, "u_just")}{crit("trend", 8, "t_just")}</div>
          <div className="panel" style={{ marginTop: 18 }}><h2>Your suggestion</h2>
            {text("suggested_action", 9, "Suggested action or solution", "Optional.", true)}
            {formError && <div className="err">{formError}</div>}
            <button className="btn" disabled={busy} onClick={submit}>Submit problem</button></div>
        </div>
        <div className="span5"><div className="panel" style={{ position: "sticky", top: 90 }}>
          <h2>Preliminary score</h2><p className="sub">G × U × T, from 1 to 125.</p>
          <LiveScore g={v.gravity} u={v.urgency} t={v.trend} /></div></div>
      </div>
    </>
  );
}
