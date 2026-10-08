export const PRIOS = ["Critical", "Very High", "High", "Medium", "Low"];
export const PR = { Critical: "crit", "Very High": "vhigh", High: "high", Medium: "med", Low: "low" };
export const ROLE_LABEL = { super_admin: "Super Admin", manager: "Manager", contributor: "Contributor", viewer: "Viewer" };

export const code = (id) => "#" + String(id).padStart(3, "0");
export const prioOf = (s) => (s >= 80 ? "Critical" : s >= 50 ? "Very High" : s >= 30 ? "High" : s >= 15 ? "Medium" : "Low");
export const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fmtDT = (iso) =>
  iso ? new Date(iso).toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  if (s < 86400 * 30) return Math.floor(s / 86400) + " d ago";
  return fmtDT(iso);
}
export const scopeText = (u) => [u.scope_country, u.scope_branch, u.scope_department].filter(Boolean).join(" / ");

// Frases do feed "Recent updates"
export function sentence(e) {
  const c = "Problem " + code(e.problem_id);
  const who = e.user_name || "Someone";
  const o = e.old_value, n = e.new_value;
  if (e.kind === "created") return `${c} was registered by ${who}.`;
  if (e.kind === "deleted") return `${c} was deleted by ${who}.`;
  if (e.kind === "update") return `${who} posted an update on ${c}.`;
  switch (e.field) {
    case "priority": return `${c} changed from ${o} to ${n}.`;
    case "status": return n === "Completed" ? `${c} was completed.` : `${c} status changed from ${o} to ${n}.`;
    case "responsible_id": return n ? `${c} was assigned to ${n}.` : `${c} was unassigned (was ${o}).`;
    case "deadline": return n ? (o ? `Deadline of ${c} changed from ${fmtDate(o)} to ${fmtDate(n)}.` : `Deadline of ${c} was set to ${fmtDate(n)}.`) : `Deadline of ${c} was removed.`;
    case "final_score": return `GUT score of ${c} changed from ${o} to ${n}.`;
    case "action_plan": return `${who} updated the action plan of ${c}.`;
    default: return `${who} changed ${(e.field_label || e.field || "").toLowerCase()} on ${c}.`;
  }
}
