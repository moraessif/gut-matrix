import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { get } from "../api.js";
import { useApp } from "../context.jsx";
import { FeedItem } from "./Dashboard.jsx";

const RANGES = { "1": "Today", "7": "Last 7 days", "30": "Last 30 days" };

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
      <div className="pagehead"><div><h1>Recent updates</h1><p>Everything that changed on problems you can access.</p></div></div>
      <div className="chips">{Object.entries(RANGES).map(([k, l]) => <button key={k} aria-pressed={k === range} onClick={() => setSp({ range: k })}>{l}</button>)}</div>
      <div className="panel">
        {events === null ? <p className="muted">Loading…</p> : events.length
          ? <ul className="feed">{events.map((e) => <FeedItem key={e.id} e={e} />)}</ul>
          : <div className="empty"><h2>Nothing in this period</h2><p>No changes were recorded.</p></div>}
      </div>
    </>
  );
}
