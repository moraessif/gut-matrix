import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { del, get, patch, post } from "../api.js";
import { useApp } from "../context.jsx";
import { Modal, options } from "../components.jsx";
import { ROLE_LABEL, fmtDT, scopeText } from "../util.js";

const ROLE_HELP = {
  super_admin: "Acesso total.", manager: "Registra, visualiza e atualiza problemas dentro do seu escopo.",
  contributor: "Envia problemas; atualiza os próprios ou os atribuídos a ele.", viewer: "Somente leitura."
};

export default function Users() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") || "users";
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="pagehead"><div><h1>Usuários</h1><p>Contas, perfis e escopo de acesso. Usuários só podem ser criados por um Super Admin.</p></div>
        {tab === "users" && <button className="btn sm" onClick={() => setCreating(true)}>Novo usuário</button>}</div>
      <div className="chips">{[["users", "Usuários"], ["org", "Países, filiais e departamentos"], ["audit", "Log de auditoria"]]
        .map(([k, l]) => <button key={k} aria-pressed={k === tab} onClick={() => setSp({ tab: k })}>{l}</button>)}</div>
      {tab === "users" && <UsersTab creating={creating} setCreating={setCreating} />}
      {tab === "org" && <OrgTab />}
      {tab === "audit" && <AuditTab />}
    </>
  );
}

function UserForm({ user, onSaved, onClose, onPassword }) {
  const { meta, loadMeta } = useApp();
  const [s, setS] = useState({ name: user?.name || "", email: "", role: user?.role || "contributor", scope_country: user?.scope_country || "",
    scope_branch: user?.scope_branch || "", scope_department: user?.scope_department || "", active: user ? user.active : true });
  const [error, setError] = useState("");
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const branches = s.scope_country ? meta.branches.filter((b) => b.country === s.scope_country).map((b) => b.name) : [];
  const submit = async () => {
    const scope = { scope_country: s.scope_country || null, scope_branch: s.scope_branch || null, scope_department: s.scope_department || null };
    try {
      if (user) { await patch(`/users/${user.id}`, { name: s.name, role: s.role, active: s.active, ...scope }); await loadMeta(); onSaved(); }
      else { const r = await post("/users", { email: s.email, name: s.name, role: s.role, ...scope }); await loadMeta(); onPassword(r.user.name, r.temporary_password); onSaved(); }
    } catch (e) { setError(e.message); }
  };
  return (
    <Modal title={user ? "Editar usuário" : "Novo usuário"} onClose={onClose}>
      <div className="f"><label className="l">Nome</label><input type="text" value={s.name} onChange={(e) => set("name", e.target.value)} autoFocus /></div>
      {user ? <p className="small muted">{user.email}</p> : <div className="f"><label className="l">E-mail</label><input type="email" value={s.email} onChange={(e) => set("email", e.target.value)} /></div>}
      <div className="f"><label className="l">Perfil</label>
        <select value={s.role} onChange={(e) => set("role", e.target.value)}>{options(meta.roles.map((r) => [r, ROLE_LABEL[r]]))}</select>
        <p className="h" style={{ marginTop: 4 }}>{ROLE_HELP[s.role]}</p></div>
      <div className="three">
        <div className="f"><label className="l">Escopo de país</label><select value={s.scope_country} onChange={(e) => setS((x) => ({ ...x, scope_country: e.target.value, scope_branch: "" }))}>{options(meta.countries, "Todos")}</select></div>
        <div className="f"><label className="l">Escopo de filial</label><select value={s.scope_branch} onChange={(e) => set("scope_branch", e.target.value)}>{options(branches, "Todas")}</select></div>
        <div className="f"><label className="l">Escopo de departamento</label><select value={s.scope_department} onChange={(e) => set("scope_department", e.target.value)}>{options(meta.departments, "Todos")}</select></div>
      </div>
      <p className="small muted">Escopo vazio significa todos os países, filiais e departamentos (para Colaboradores: apenas os próprios problemas e os atribuídos a eles).</p>
      {user && <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}><input type="checkbox" style={{ width: "auto" }} checked={s.active} onChange={(e) => set("active", e.target.checked)} /> Ativo (pode entrar)</label>}
      {error && <div className="err">{error}</div>}
      <div className="savebar"><button className="btn" onClick={submit}>{user ? "Salvar" : "Criar usuário"}</button><button className="btn ghost" onClick={onClose}>Cancelar</button></div>
    </Modal>
  );
}

function UsersTab({ creating, setCreating }) {
  const { notify, version } = useApp();
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [pw, setPw] = useState(null);
  const load = useCallback(() => get("/users").then(setUsers).catch((e) => notify(e.message, true)), [notify]);
  useEffect(() => { load(); }, [load, version]);
  const reset = async (u) => {
    if (!window.confirm(`Redefinir a senha de ${u.name}? A sessão dessa pessoa será encerrada.`)) return;
    try { const r = await post(`/users/${u.id}/reset-password`); setPw({ title: "Nova senha temporária", pw: r.temporary_password }); load(); }
    catch (e) { notify(e.message, true); }
  };
  return (
    <>
      <div className="tw"><table className="t" style={{ minWidth: 900 }}>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Escopo</th><th>Último acesso</th><th /></tr></thead>
        <tbody>{users.map((u) => (
          <tr key={u.id} className={u.active ? "" : "off"}>
            <td><b>{u.name}</b>{u.active ? "" : " (inativo)"}</td><td>{u.email}</td><td><span className="role">{ROLE_LABEL[u.role]}</span></td>
            <td>{scopeText(u) || "Todos"}</td>
            <td>{u.last_login ? fmtDT(u.last_login) : "Nunca"}{u.must_change_password && <span className="small muted"> (senha temporária)</span>}</td>
            <td style={{ whiteSpace: "nowrap" }}><button className="btn ghost sm" onClick={() => setEditing(u)}>Editar</button>{" "}
              <button className="btn ghost sm" onClick={() => reset(u)}>Redefinir senha</button></td>
          </tr>))}</tbody></table></div>
      {creating && <UserForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} onPassword={(name, p) => setPw({ title: `Usuário criado: ${name}`, pw: p })} />}
      {editing && <UserForm user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); notify("Usuário salvo"); load(); }} />}
      {pw && (
        <Modal title={pw.title} onClose={() => setPw(null)}>
          <p>Compartilhe esta senha temporária com segurança. Ela é exibida apenas uma vez; o usuário deverá escolher uma nova no primeiro acesso.</p>
          <div className="pw">{pw.pw}</div>
          <div className="savebar"><button className="btn" onClick={() => setPw(null)}>Concluir</button></div>
        </Modal>
      )}
    </>
  );
}

function OrgTab() {
  const { notify, loadMeta, meta } = useApp();
  const [org, setOrg] = useState(null);
  const [country, setCountry] = useState("");
  const [branch, setBranch] = useState({ country: meta.countries[0] || "", name: "" });
  const [dept, setDept] = useState("");
  const load = useCallback(() => get("/org").then(setOrg).catch((e) => notify(e.message, true)), [notify]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn, okMsg) => { try { await fn(); await loadMeta(); await load(); notify(okMsg); } catch (e) { notify(e.message, true); } };
  if (!org) return <p className="muted">Carregando…</p>;
  const li = (label, kind, id) => <li key={`${kind}${id}`}><span>{label}</span><button onClick={() => run(() => del(`/org/${kind}/${id}`), "Removido")}>remover</button></li>;
  return (
    <div className="grid">
      <div className="span4 panel"><h2>Países</h2><ul className="orglist">{org.countries.map((c) => li(c.name, "countries", c.id))}</ul>
        <div style={{ display: "flex", gap: 8 }}><input type="text" placeholder="Novo país" value={country} onChange={(e) => setCountry(e.target.value)} />
          <button className="btn sm" onClick={() => run(async () => { await post("/org/countries", { name: country }); setCountry(""); }, "Adicionado")}>Adicionar</button></div></div>
      <div className="span4 panel"><h2>Filiais</h2><ul className="orglist">{org.branches.map((b) => li(`${b.country} / ${b.name}`, "branches", b.id))}</ul>
        <div className="two"><select value={branch.country} onChange={(e) => setBranch({ ...branch, country: e.target.value })}>{options(meta.countries)}</select>
          <input type="text" placeholder="Nova filial" value={branch.name} onChange={(e) => setBranch({ ...branch, name: e.target.value })} /></div>
        <button className="btn sm" style={{ marginTop: 8 }} onClick={() => run(async () => { await post("/org/branches", branch); setBranch({ ...branch, name: "" }); }, "Adicionada")}>Adicionar filial</button></div>
      <div className="span4 panel"><h2>Departamentos</h2><ul className="orglist">{org.departments.map((d) => li(d.name, "departments", d.id))}</ul>
        <div style={{ display: "flex", gap: 8 }}><input type="text" placeholder="Novo departamento" value={dept} onChange={(e) => setDept(e.target.value)} />
          <button className="btn sm" onClick={() => run(async () => { await post("/org/departments", { name: dept }); setDept(""); }, "Adicionado")}>Adicionar</button></div></div>
    </div>
  );
}

function AuditTab() {
  const [rows, setRows] = useState(null);
  useEffect(() => { get("/audit").then(setRows).catch(() => setRows([])); }, []);
  if (!rows) return <p className="muted">Carregando…</p>;
  return (
    <div className="tw"><table className="t" style={{ minWidth: 760 }}>
      <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Alvo</th><th>Detalhe</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}><td>{fmtDT(r.at)}</td><td>{r.user_name || "—"}</td><td>{r.action}</td><td>{r.entity || ""} {r.entity_id || ""}</td><td>{r.detail || ""}</td></tr>)}</tbody>
    </table></div>
  );
}
