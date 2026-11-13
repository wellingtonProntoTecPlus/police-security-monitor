export const PROCEDURE_TYPES = ["general", "alarm", "panic", "outside_schedule_disarm", "system_problem"] as const;
export type ProcedureType = typeof PROCEDURE_TYPES[number];
export const PROCEDURE_TYPE_LABELS: Record<ProcedureType, string> = {
  general: "Orientações gerais",
  alarm: "Disparos de alarme",
  panic: "Pânico / coação",
  outside_schedule_disarm: "Desarme fora de hora",
  system_problem: "Problemas / falhas técnicas",
};

export function classifyProcedureEvent(event: { eventCode?: string; qualifier?: string; description?: string | null }, outsideScheduleDisarm = false): ProcedureType {
  const code = String(event.eventCode || "").trim().toUpperCase();
  const qualifier = String(event.qualifier || "").trim().toUpperCase();
  const text = String(event.description || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (outsideScheduleDisarm) return "outside_schedule_disarm";
  // Restauração não é um novo disparo/pânico. Códigos de Arme/Desarme não são agrupados.
  if (qualifier === "E" && (["120", "121", "122", "123", "124", "125", "126"].includes(code) || /panico|coacao/.test(text))) return "panic";
  if (qualifier === "E" && /^1\d\d$/.test(code)) return "alarm";
  if (code === "KOFF" || /^[23]\d\d$/.test(code) || /falha|problema|desconectad|sem comunicacao/.test(text)) return "system_problem";
  return "general";
}

export function applicableProcedures<T extends { isActive?: boolean; procedureType?: string; priority?: number; id?: number }>(rows: T[], type: ProcedureType): T[] {
  return rows.filter(row => row.isActive !== false && (!row.procedureType || row.procedureType === "general" || row.procedureType === type))
    .sort((a, b) => Number(b.procedureType === type && type !== "general") - Number(a.procedureType === type && type !== "general") || (a.priority || 1) - (b.priority || 1) || (a.id || 0) - (b.id || 0));
}
