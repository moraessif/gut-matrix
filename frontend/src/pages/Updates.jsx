import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { get } from "../api.js";
import { useApp } from "../context.jsx";
import { FeedItem } from "./Dashboard.jsx";

const RANGES = { "1": "Hoje", "7": "Últimos 7 dias", "30": "Últimos 30 dias" };

export default function Updates() {
  const { version } = useApp();
  const [sp, setSp] = useSearchParams();
  const range = sp.get("range") || "7";
  const [events, setEvents] = useState(null);

  useEffect(() => {
    const since = range === "1" ? (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })() : new Date(Date.now() - Number(range) * 86400000);
    get("/updates?limit=500&since=" + encodeURIComponent(since.toISOString().slice(0, 19) + "Z")).then(setEvents).catch(() => setEvents([]));
  }, [range, version]);

  return (
    <>
      <div className="pagehead"><div><h1>Atualizações recentes</h1><p>Tudo o que mudou nos problemas que você pode acessar.</p></div></div>
      <div className="chips">{Object.entries(RANGES).map(([k, l]) => <button key={k} aria-pressed={k === range} onClick={() => setSp({ range: k })}>{l}</button>)}</div>
      <div className="panel">
        {events === null ? <p className="muted">Carregando…</p> : events.length
          ? <ul className="feed">{events.map((e) => <FeedItem key={e.id} e={e} />)}</ul>
          : <div className="empty"><h2>Nada neste período</h2><p>Nenhuma alteração foi registrada.</p></div>}
      </div>
    </>
  );
}
