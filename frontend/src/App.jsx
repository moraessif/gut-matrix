import { useState } from "react";
import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useApp } from "./context.jsx";
import { post } from "./api.js";
import { Modal } from "./components.jsx";
import { ROLE_LABEL, scopeText } from "./util.js";
import Dashboard from "./pages/Dashboard.jsx";
import List from "./pages/List.jsx";
import ProblemDetail from "./pages/ProblemDetail.jsx";
import NewProblem from "./pages/NewProblem.jsx";
import Updates from "./pages/Updates.jsx";
import Reports from "./pages/Reports.jsx";
import Users from "./pages/Users.jsx";

function Login() {
  const { login } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try { await login(email, password); } catch (er) { setError(er.message); }
  };
  return (
    <div className="login">
      <form className="login-box" onSubmit={submit}>
        <h1>Matriz GUT</h1>
        <p>Entre para registrar, priorizar e acompanhar problemas.</p>
        <div className="f"><label className="l" htmlFor="em">E-mail</label>
          <input id="em" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></div>
        <div className="f"><label className="l" htmlFor="pw">Senha</label>
          <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <div className="err">{error}</div>}
        <button className="btn" type="submit" style={{ width: "100%", marginTop: 6 }}>Entrar</button>
        <p className="small" style={{ margin: "14px 0 0" }}>Precisa de acesso? Peça ao Super Admin para criar sua conta.</p>
      </form>
    </div>
  );
}

function ChangePasswordForm({ forced, onDone }) {
  const { loadSession, logout } = useApp();
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await post("/auth/change-password", { current_password: cur, new_password: nw });
      if (forced) await loadSession();
      onDone?.();
    } catch (er) { setError(er.message); }
  };
  return (
    <form onSubmit={submit}>
      <div className="f"><label className="l">{forced ? "Senha temporária" : "Senha atual"}</label>
        <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus /></div>
      <div className="f"><label className="l">Nova senha</label><p className="h">No mínimo 10 caracteres, com letras e números.</p>
        <input type="password" autoComplete="new-password" value={nw} onChange={(e) => setNw(e.target.value)} /></div>
      {error && <div className="err">{error}</div>}
      <div className="savebar">
        <button className="btn" type="submit">Salvar{forced ? " e continuar" : ""}</button>
        {forced && <button type="button" className="btn ghost" onClick={logout}>Sair</button>}
      </div>
    </form>
  );
}

function ForcedPassword() {
  return (
    <div className="login"><div className="login-box">
      <h1>Escolha uma nova senha</h1>
      <p>Sua conta usa uma senha temporária. Defina a sua para continuar.</p>
      <ChangePasswordForm forced />
    </div></div>
  );
}

function Shell() {
  const { me, logout, isAdmin, canCreate } = useApp();
  const [pwOpen, setPwOpen] = useState(false);
  const [theme, setTheme] = useState(null);
  const cycleTheme = () => {
    const next = theme === null ? "dark" : theme === "dark" ? "light" : null;
    setTheme(next);
    if (next) document.documentElement.setAttribute("data-theme", next); else document.documentElement.removeAttribute("data-theme");
  };
  const nav = [["/dashboard", "Painel"], ["/problems", "Problemas"], ["/ranking", "Ranking GUT"], ["/updates", "Atualizações"], ["/plans", "Planos de Ação"],
    ...(isAdmin ? [["/users", "Usuários"]] : []), ["/reports", "Relatórios"]];
  const scope = scopeText(me);
  return (
    <>
      <header className="top"><div className="top-in">
        <Link className="brand" to="/dashboard"><b>Matriz GUT</b><span>Priorização de problemas</span></Link>
        <nav className="nav" aria-label="Principal">{nav.map(([to, label]) => <NavLink key={to} to={to} end={to === "/problems"}>{label}</NavLink>)}</nav>
        <div className="top-r">
          {canCreate && <Link className="btn sm" to="/problems/new">Novo problema</Link>}
          <div className="who">{me.name}<small>{ROLE_LABEL[me.role]}{scope ? ", " + scope : ""}</small></div>
          <button className="btn ghost sm" onClick={() => setPwOpen(true)}>Senha</button>
          <button className="btn ghost sm" onClick={cycleTheme}>Tema</button>
          <button className="btn ghost sm" onClick={logout}>Sair</button>
        </div>
      </div></header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/problems" element={<List kind="problems" />} />
          <Route path="/problems/new" element={<NewProblem />} />
          <Route path="/problems/:id" element={<ProblemDetail />} />
          <Route path="/ranking" element={<List kind="ranking" />} />
          <Route path="/plans" element={<List kind="plans" />} />
          <Route path="/updates" element={<Updates />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/users" element={isAdmin ? <Users /> : <Navigate to="/dashboard" replace />} />
          <Route path="*" element={<div className="panel empty"><h2>Página não encontrada</h2><Link className="btn" to="/dashboard">Ir para o painel</Link></div>} />
        </Routes>
      </main>
      {pwOpen && <Modal title="Alterar senha" onClose={() => setPwOpen(false)}><ChangePasswordForm onDone={() => setPwOpen(false)} /></Modal>}
    </>
  );
}

export default function App() {
  const { me, meta } = useApp();
  if (me === undefined) return <div className="login"><p className="muted">Carregando…</p></div>;
  if (!me) return <Login />;
  if (me.must_change_password) return <ForcedPassword />;
  if (!meta) return <div className="login"><p className="muted">Carregando…</p></div>;
  return <Shell />;
}
