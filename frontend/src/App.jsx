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
        <h1>GUT Matrix</h1>
        <p>Sign in to register, prioritise and track problems.</p>
        <div className="f"><label className="l" htmlFor="em">E-mail</label>
          <input id="em" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></div>
        <div className="f"><label className="l" htmlFor="pw">Password</label>
          <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <div className="err">{error}</div>}
        <button className="btn" type="submit" style={{ width: "100%", marginTop: 6 }}>Sign in</button>
        <p className="small" style={{ margin: "14px 0 0" }}>Need access? Ask your Super Admin to create your account.</p>
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
      <div className="f"><label className="l">{forced ? "Temporary password" : "Current password"}</label>
        <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus /></div>
      <div className="f"><label className="l">New password</label><p className="h">At least 10 characters, with letters and numbers.</p>
        <input type="password" autoComplete="new-password" value={nw} onChange={(e) => setNw(e.target.value)} /></div>
      {error && <div className="err">{error}</div>}
      <div className="savebar">
        <button className="btn" type="submit">Save{forced ? " and continue" : ""}</button>
        {forced && <button type="button" className="btn ghost" onClick={logout}>Sign out</button>}
      </div>
    </form>
  );
}

function ForcedPassword() {
  return (
    <div className="login"><div className="login-box">
      <h1>Choose a new password</h1>
      <p>Your account uses a temporary password. Set your own to continue.</p>
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
  const nav = [["/dashboard", "Dashboard"], ["/problems", "Problems"], ["/ranking", "GUT Ranking"], ["/updates", "Updates"], ["/plans", "Action Plans"],
    ...(isAdmin ? [["/users", "Users"]] : []), ["/reports", "Reports"]];
  const scope = scopeText(me);
  return (
    <>
      <header className="top"><div className="top-in">
        <Link className="brand" to="/dashboard"><b>GUT Matrix</b><span>Problem prioritisation</span></Link>
        <nav className="nav" aria-label="Main">{nav.map(([to, label]) => <NavLink key={to} to={to} end={to === "/problems"}>{label}</NavLink>)}</nav>
        <div className="top-r">
          {canCreate && <Link className="btn sm" to="/problems/new">New problem</Link>}
          <div className="who">{me.name}<small>{ROLE_LABEL[me.role]}{scope ? ", " + scope : ""}</small></div>
          <button className="btn ghost sm" onClick={() => setPwOpen(true)}>Password</button>
          <button className="btn ghost sm" onClick={cycleTheme}>Theme</button>
          <button className="btn ghost sm" onClick={logout}>Sign out</button>
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
          <Route path="*" element={<div className="panel empty"><h2>Page not found</h2><Link className="btn" to="/dashboard">Go to dashboard</Link></div>} />
        </Routes>
      </main>
      {pwOpen && <Modal title="Change password" onClose={() => setPwOpen(false)}><ChangePasswordForm onDone={() => setPwOpen(false)} /></Modal>}
    </>
  );
}

export default function App() {
  const { me, meta } = useApp();
  if (me === undefined) return <div className="login"><p className="muted">Loading…</p></div>;
  if (!me) return <Login />;
  if (me.must_change_password) return <ForcedPassword />;
  if (!meta) return <div className="login"><p className="muted">Loading…</p></div>;
  return <Shell />;
}
