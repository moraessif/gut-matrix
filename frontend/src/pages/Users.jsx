import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { del, get, patch, post } from "../api.js";
import { useApp } from "../context.jsx";
import { Modal, options } from "../components.jsx";
import { ROLE_LABEL, fmtDT, scopeText } from "../util.js";

const ROLE_HELP = {
  super_admin: "Full access.", manager: "Registers, views and updates problems in their scope.",
  contributor: "Submits problems; updates their own or assigned problems.", viewer: "Read-only."
};

export default function Users() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") || "users";
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="pagehead"><div><h1>Users</h1><p>Accounts, roles and access scope. Users can only be created by a Super Admin.</p></div>
        {tab === "users" && <button className="btn sm" onClick={() => setCreating(true)}>New user</button>}</div>
      <div className="chips">{[["users", "Users"], ["org", "Countries, branches and departments"], ["audit", "Audit log"]]
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
    <Modal title={user ? "Edit user" : "New user"} onClose={onClose}>
      <div className="f"><label className="l">Name</label><input type="text" value={s.name} onChange={(e) => set("name", e.target.value)} autoFocus /></div>
      {user ? <p className="small muted">{user.email}</p> : <div className="f"><label className="l">E-mail</label><input type="email" value={s.email} onChange={(e) => set("email", e.target.value)} /></div>}
      <div className="f"><label className="l">Role</label>
        <select value={s.role} onChange={(e) => set("role", e.target.value)}>{options(meta.roles.map((r) => [r, ROLE_LABEL[r]]))}</select>
        <p className="h" style={{ marginTop: 4 }}>{ROLE_HELP[s.role]}</p></div>
      <div className="three">
        <div className="f"><label className="l">Country scope</label><select value={s.scope_country} onChange={(e) => setS((x) => ({ ...x, scope_country: e.target.value, scope_branch: "" }))}>{options(meta.countries, "All")}</select></div>
        <div className="f"><label className="l">Branch scope</label><select value={s.scope_branch} onChange={(e) => set("scope_branch", e.target.value)}>{options(branches, "All")}</select></div>
        <div className="f"><label className="l">Department scope</label><select value={s.scope_department} onChange={(e) => set("scope_department", e.target.value)}>{options(meta.departments, "All")}</select></div>
      </div>
      <p className="small muted">Empty scope means all countries, branches and departments (for Contributors: only their own and assigned problems).</p>
      {user && <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}><input type="checkbox" style={{ width: "auto" }} checked={s.active} onChange={(e) => set("active", e.target.checked)} /> Active (can sign in)</label>}
      {error && <div className="err">{error}</div>}
      <div className="savebar"><button className="btn" onClick={submit}>{user ? "Save" : "Create user"}</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
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
    if (!window.confirm(`Reset the password of ${u.name}? They will be signed out.`)) return;
    try { const r = await post(`/users/${u.id}/reset-password`); setPw({ title: "New temporary password", pw: r.temporary_password }); load(); }
    catch (e) { notify(e.message, true); }
  };
  return (
    <>
      <div className="tw"><table className="t" style={{ minWidth: 900 }}>
        <thead><tr><th>Name</th><th>E-mail</th><th>Role</th><th>Scope</th><th>Last sign-in</th><th /></tr></thead>
        <tbody>{users.map((u) => (
          <tr key={u.id} className={u.active ? "" : "off"}>
            <td><b>{u.name}</b>{u.active ? "" : " (inactive)"}</td><td>{u.email}</td><td><span className="role">{ROLE_LABEL[u.role]}</span></td>
            <td>{scopeText(u) || "All"}</td>
            <td>{u.last_login ? fmtDT(u.last_login) : "Never"}{u.must_change_password && <span className="small muted"> (temporary password)</span>}</td>
            <td style={{ whiteSpace: "nowrap" }}><button className="btn ghost sm" onClick={() => setEditing(u)}>Edit</button>{" "}
              <button className="btn ghost sm" onClick={() => reset(u)}>Reset password</button></td>
          </tr>))}</tbody></table></div>
      {creating && <UserForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} onPassword={(name, p) => setPw({ title: `User created: ${name}`, pw: p })} />}
      {editing && <UserForm user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); notify("User saved"); load(); }} />}
      {pw && (
        <Modal title={pw.title} onClose={() => setPw(null)}>
          <p>Share this temporary password securely. It is shown only once; the user must choose a new one at first sign-in.</p>
          <div className="pw">{pw.pw}</div>
          <div className="savebar"><button className="btn" onClick={() => setPw(null)}>Done</button></div>
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
  if (!org) return <p className="muted">Loading…</p>;
  const li = (label, kind, id) => <li key={`${kind}${id}`}><span>{label}</span><button onClick={() => run(() => del(`/org/${kind}/${id}`), "Removed")}>remove</button></li>;
  return (
    <div className="grid">
      <div className="span4 panel"><h2>Countries</h2><ul className="orglist">{org.countries.map((c) => li(c.name, "countries", c.id))}</ul>
        <div style={{ display: "flex", gap: 8 }}><input type="text" placeholder="New country" value={country} onChange={(e) => setCountry(e.target.value)} />
          <button className="btn sm" onClick={() => run(async () => { await post("/org/countries", { name: country }); setCountry(""); }, "Added")}>Add</button></div></div>
      <div className="span4 panel"><h2>Branches</h2><ul className="orglist">{org.branches.map((b) => li(`${b.country} / ${b.name}`, "branches", b.id))}</ul>
        <div className="two"><select value={branch.country} onChange={(e) => setBranch({ ...branch, country: e.target.value })}>{options(meta.countries)}</select>
          <input type="text" placeholder="New branch" value={branch.name} onChange={(e) => setBranch({ ...branch, name: e.target.value })} /></div>
        <button className="btn sm" style={{ marginTop: 8 }} onClick={() => run(async () => { await post("/org/branches", branch); setBranch({ ...branch, name: "" }); }, "Added")}>Add branch</button></div>
      <div className="span4 panel"><h2>Departments</h2><ul className="orglist">{org.departments.map((d) => li(d.name, "departments", d.id))}</ul>
        <div style={{ display: "flex", gap: 8 }}><input type="text" placeholder="New department" value={dept} onChange={(e) => setDept(e.target.value)} />
          <button className="btn sm" onClick={() => run(async () => { await post("/org/departments", { name: dept }); setDept(""); }, "Added")}>Add</button></div></div>
    </div>
  );
}

function AuditTab() {
  const [rows, setRows] = useState(null);
  useEffect(() => { get("/audit").then(setRows).catch(() => setRows([])); }, []);
  if (!rows) return <p className="muted">Loading…</p>;
  return (
    <div className="tw"><table className="t" style={{ minWidth: 760 }}>
      <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}><td>{fmtDT(r.at)}</td><td>{r.user_name || "—"}</td><td>{r.action}</td><td>{r.entity || ""} {r.entity_id || ""}</td><td>{r.detail || ""}</td></tr>)}</tbody>
    </table></div>
  );
}
