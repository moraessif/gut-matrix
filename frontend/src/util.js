export const PRIOS = ["Critical", "Very High", "High", "Medium", "Low"];
export const PR = { Critical: "crit", "Very High": "vhigh", High: "high", Medium: "med", Low: "low" };
export const ROLE_LABEL = { super_admin: "Super Admin", manager: "Gestor", contributor: "Colaborador", viewer: "Visualizador" };

// Os valores abaixo são gravados em inglês no backend; aqui ficam só os rótulos exibidos.
export const PRIO_LABEL = { Critical: "Crítica", "Very High": "Muito Alta", High: "Alta", Medium: "Média", Low: "Baixa" };
export const STATUS_LABEL = {
  New: "Novo", "Under Review": "Em análise", Prioritized: "Priorizado", "Action Plan Defined": "Plano de ação definido",
  "In Progress": "Em andamento", "Waiting for Third Party": "Aguardando terceiros", Completed: "Concluído", Cancelled: "Cancelado"
};
export const SOURCE_LABEL = {
  "Employee observation": "Observação de colaborador", "Customer / consultant complaint": "Reclamação de cliente / consultor",
  "Audit or review": "Auditoria ou revisão", "KPI / dashboard alert": "Alerta de KPI / painel",
  "Management review": "Análise da gestão", "Incident or failure": "Incidente ou falha", Other: "Outra"
};
export const prioLabel = (p) => PRIO_LABEL[p] || p;
export const statusLabel = (s) => STATUS_LABEL[s] || s;
export const sourceLabel = (s) => SOURCE_LABEL[s] || s;
// Pares [valor, rótulo] para usar em <select>
export const labeled = (list, map) => list.map((v) => [v, map[v] || v]);
// Traduz o valor de um campo do histórico quando ele é uma lista fixa
export const valueLabel = (field, v) =>
  field === "status" ? statusLabel(v) : field === "priority" ? prioLabel(v) : field === "source" ? sourceLabel(v) : v;

export const code = (id) => "#" + String(id).padStart(3, "0");
export const prioOf = (s) => (s >= 80 ? "Critical" : s >= 50 ? "Very High" : s >= 30 ? "High" : s >= 15 ? "Medium" : "Low");
export const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fmtDT = (iso) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora mesmo";
  if (s < 3600) return "há " + Math.floor(s / 60) + " min";
  if (s < 86400) return "há " + Math.floor(s / 3600) + " h";
  if (s < 86400 * 30) return "há " + Math.floor(s / 86400) + " d";
  return fmtDT(iso);
}
export const scopeText = (u) => [u.scope_country, u.scope_branch, u.scope_department].filter(Boolean).join(" / ");

// Frases do feed "Atualizações recentes"
export function sentence(e) {
  const c = "O problema " + code(e.problem_id);
  const cc = code(e.problem_id);
  const who = e.user_name || "Alguém";
  const o = e.old_value, n = e.new_value;
  if (e.kind === "created") return `${c} foi registrado por ${who}.`;
  if (e.kind === "deleted") return `${c} foi excluído por ${who}.`;
  if (e.kind === "update") return `${who} publicou uma atualização em ${cc}.`;
  switch (e.field) {
    case "priority": return `A prioridade de ${cc} mudou de ${prioLabel(o)} para ${prioLabel(n)}.`;
    case "status": return n === "Completed" ? `${c} foi concluído.` : `O status de ${cc} mudou de ${statusLabel(o)} para ${statusLabel(n)}.`;
    case "responsible_id": return n ? `${c} foi atribuído a ${n}.` : `${c} ficou sem responsável (era ${o}).`;
    case "deadline": return n ? (o ? `O prazo de ${cc} mudou de ${fmtDate(o)} para ${fmtDate(n)}.` : `O prazo de ${cc} foi definido para ${fmtDate(n)}.`) : `O prazo de ${cc} foi removido.`;
    case "final_score": return `A nota GUT de ${cc} mudou de ${o} para ${n}.`;
    case "action_plan": return `${who} atualizou o plano de ação de ${cc}.`;
    default: return `${who} alterou ${(e.field_label || e.field || "").toLowerCase()} em ${cc}.`;
  }
}
