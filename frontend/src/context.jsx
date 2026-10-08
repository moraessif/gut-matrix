import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { get, post, setUnauthorizedHandler } from "./api.js";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [me, setMe] = useState(undefined);   // undefined = carregando, null = deslogado
  const [meta, setMeta] = useState(null);
  const [version, setVersion] = useState(0); // muda sempre que alguém altera dados (polling)
  const [toast, setToast] = useState(null);
  const lastVersion = useRef(null);
  const timer = useRef(null);

  const notify = useCallback((msg, error = false) => {
    setToast({ msg, error });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const loadMeta = useCallback(async () => setMeta(await get("/meta")), []);

  const loadSession = useCallback(async () => {
    try {
      const user = await get("/auth/me");
      setMe(user);
      if (!user.must_change_password) await loadMeta();
    } catch {
      setMe(null);
    }
  }, [loadMeta]);

  useEffect(() => {
    setUnauthorizedHandler(() => { setMe(null); setMeta(null); });
    loadSession();
  }, [loadSession]);

  // Atualização "ao vivo": consulta a versão dos dados a cada 15 s
  useEffect(() => {
    if (!me || me.must_change_password || !meta) return undefined;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const { v } = await get("/version");
        if (lastVersion.current !== null && v !== lastVersion.current) setVersion((x) => x + 1);
        lastVersion.current = v;
      } catch { /* offline ou deslogado */ }
    };
    tick();
    const id = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [me, meta]);

  const login = async (email, password) => {
    const user = await post("/auth/login", { email, password });
    setMe(user);
    if (!user.must_change_password) await loadMeta();
  };
  const logout = async () => {
    try { await post("/auth/logout"); } finally { setMe(null); setMeta(null); lastVersion.current = null; }
  };
  const isAdmin = me?.role === "super_admin";
  const canCreate = !!me && me.role !== "viewer";

  return (
    <Ctx.Provider value={{ me, meta, version, notify, login, logout, loadSession, loadMeta, isAdmin, canCreate }}>
      {children}
      {toast && <div className={"toast" + (toast.error ? " err" : "")} role="status">{toast.msg}</div>}
    </Ctx.Provider>
  );
}
