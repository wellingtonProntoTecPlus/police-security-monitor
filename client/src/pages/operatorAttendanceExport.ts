import { OPERATOR_SHIFT_LABELS, type OperatorShiftCode } from "@shared/operatorShift";

export const OPERATOR_LOGOUT_LABELS: Record<string, string> = {
  logout: "Logoff normal", session_replaced: "Sessão substituída por novo login",
  session_expired: "Sessão expirada", revoked: "Sessão revogada",
};
export const OPERATOR_SCHEDULE_REASON_LABELS: Record<string, string> = {
  scale_swap: "Troquei minha escala", double_shift: "Estou fazendo uma dobra", vacation_coverage: "Estou cobrindo férias",
};

type AttendanceRow = {
  operatorName: string; role: string; loginAt: Date | string; logoutAt: Date | string | null;
  logoutReason: string | null; shiftCode: OperatorShiftCode | null; workDate: string | null;
  scheduleStatus?: "scheduled" | "outside_window" | null; outOfScheduleReason?: string | null;
};
function safeCsv(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function buildOperatorAttendanceCsv(rows: AttendanceRow[]) {
  const format = (date: Date | string | null) => date ? new Date(date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não registrado";
  const header = ["Operador", "Perfil", "Login", "Logoff", "Situação do logoff", "Escala no login", "Motivo fora da escala", "Turno", "Dia da escala"];
  return "\uFEFF" + [header, ...rows.map((row) => [row.operatorName, row.role, format(row.loginAt), format(row.logoutAt), row.logoutReason ? OPERATOR_LOGOUT_LABELS[row.logoutReason] || row.logoutReason : "Sessão não encerrada", row.scheduleStatus === "scheduled" ? "Escalado" : row.scheduleStatus === "outside_window" ? "Fora da escala" : "Sem classificação", row.outOfScheduleReason ? OPERATOR_SCHEDULE_REASON_LABELS[row.outOfScheduleReason] || row.outOfScheduleReason : row.scheduleStatus === "outside_window" ? "Aguardando justificativa" : "", row.shiftCode ? OPERATOR_SHIFT_LABELS[row.shiftCode] : "Sem turno vinculado", row.workDate || ""])].map((line) => line.map(safeCsv).join(";")).join("\n");
}
