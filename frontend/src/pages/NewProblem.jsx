import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { post } from "../api.js";
import { useApp } from "../context.jsx";
import { CritGroup, LiveScore, options } from "../components.jsx";
import { SOURCE_LABEL, code, labeled } from "../util.js";

const CRIT_Q = { gravity: "Qual a gravidade do impacto deste problema?", urgency: "Com que rapidez ele precisa ser tratado?", trend: "O que acontece se nada for feito?" };
const CRIT_NAME = { gravity: "Gravidade", urgency: "Urgência", trend: "Tendência" };

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

  if (!canCreate) return <div className="panel empty"><h2>Acesso somente leitura</h2><p>Seu perfil não pode registrar problemas.</p></div>;

  const submit = async () => {
    const e = {};
    [["title", "Informe o título."], ["description", "Informe a descrição."], ["evidence", "Informe as evidências."], ["operational_impact", "Informe o impacto operacional."], ["consequences", "Informe as consequências."]]
      .forEach(([k, m]) => { if (!v[k].trim()) e[k] = m; });
    if (!v.department) e.department = "Selecione o departamento.";
    ["gravity", "urgency", "trend"].forEach((k) => { if (!v[k]) e[k] = "Escolha uma nota de 1 a 5."; });
    setErrors(e);
    if (Object.keys(e).length) { setFormError("Corrija os campos destacados."); return; }
    setBusy(true); setFormError("");
    try {
      const p = await post("/problems", v);
      notify(`Problema ${code(p.id)} registrado`);
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
      <span className="l">{n}. {CRIT_NAME[k]} (1 a 5)</span><p className="h">{CRIT_Q[k]}</p>
      <CritGroup name={k} scale={meta.scales[k]} value={v[k]} onChange={(x) => set(k, x)} />
      {errors[k] && <div className="err">{errors[k]}</div>}
      <label className="l" style={{ fontWeight: 500 }}>Justificativa</label>
      <textarea maxLength={2000} placeholder="Por que esta nota?" value={v[jk]} onChange={(e) => set(jk, e.target.value)} />
    </div>
  );

  return (
    <>
      <div className="pagehead"><div><h1>Novo problema</h1><p>Suas notas são uma avaliação preliminar; um Super Admin as valida depois.</p></div></div>
      <div className="grid">
        <div className="span7">
          <div className="panel"><h2>Onde</h2>
            <div className="three" style={{ marginTop: 10 }}>
              <div className="f"><label className="l">País</label>
                <select value={v.country} onChange={(e) => setV((x) => ({ ...x, country: e.target.value, branch: branchesFor(e.target.value)[0] || "" }))}>{options(countries)}</select></div>
              <div className="f"><label className="l">Filial</label>
                <select value={v.branch} onChange={(e) => set("branch", e.target.value)}>{options(branchesFor(v.country))}</select></div>
              <div className="f"><label className="l">Departamento / Área</label>
                <select value={v.department} aria-invalid={!!errors.department} onChange={(e) => set("department", e.target.value)}>{options(depts, depts.length === 1 ? null : "Selecione…")}</select></div>
            </div>
            {errors.department && <div className="err">{errors.department}</div>}
          </div>
          <div className="panel" style={{ marginTop: 18 }}><h2>O problema</h2>
            {text("title", 1, "Título", "Uma linha.")}
            {text("description", 2, "Descrição", "O que está acontecendo, onde, desde quando, quem é afetado?", true)}
            {text("evidence", 3, "Evidências", "Dados, exemplos, relatórios, datas.", true)}
            {text("operational_impact", 4, "Impacto operacional", "Qual processo, equipe, cliente ou custo é afetado?", true)}
            {text("consequences", 5, "Consequências se nada for feito", "", true)}
            <div className="f"><label className="l">Origem do problema</label>
              <select value={v.source} onChange={(e) => set("source", e.target.value)}>{options(labeled(meta.sources, SOURCE_LABEL), "—")}</select></div>
          </div>
          <div className="panel" style={{ marginTop: 18 }}><h2>Avaliação GUT</h2>
            {crit("gravity", 6, "g_just")}{crit("urgency", 7, "u_just")}{crit("trend", 8, "t_just")}</div>
          <div className="panel" style={{ marginTop: 18 }}><h2>Sua sugestão</h2>
            {text("suggested_action", 9, "Ação ou solução sugerida", "Opcional.", true)}
            {formError && <div className="err">{formError}</div>}
            <button className="btn" disabled={busy} onClick={submit}>Enviar problema</button></div>
        </div>
        <div className="span5"><div className="panel" style={{ position: "sticky", top: 90 }}>
          <h2>Nota preliminar</h2><p className="sub">G × U × T, de 1 a 125.</p>
          <LiveScore g={v.gravity} u={v.urgency} t={v.trend} /></div></div>
      </div>
    </>
  );
}
