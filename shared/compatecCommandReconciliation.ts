export const COMPATEC_RECONCILIATION_OUTCOMES = [
  "applied",
  "not_applied",
  "partial",
  "verified",
  "unavailable",
] as const;

export type CompatecReconciliationOutcome = (typeof COMPATEC_RECONCILIATION_OUTCOMES)[number];

export const COMPATEC_MANUAL_NON_APPLICATION_MARKER = "[CANCELAMENTO APÓS VERIFICAÇÃO: NÃO APLICADO]";
export const COMPATEC_MANUAL_APPLICATION_MARKER = "[CONFERÊNCIA MANUAL: APLICADO]";
export const COMPATEC_MANUAL_VERIFIED_MARKER = "[CONFERÊNCIA MANUAL: ESTADO FINAL VERIFICADO]";
export const COMPATEC_MANUAL_PARTIAL_MARKER = "[CONFERÊNCIA MANUAL: APLICAÇÃO PARCIAL]";
export const COMPATEC_MANUAL_APPLICATION_EVENT_BASELINE_MARKER = "[EVENTO DE ESTADO BASE DA CONFERÊNCIA MANUAL: #";

export function isManualCompatecNonApplication(response?: string | null) {
  return Boolean(response?.includes(COMPATEC_MANUAL_NON_APPLICATION_MARKER));
}

export function isManualCompatecApplication(response?: string | null) {
  return Boolean(response?.includes(COMPATEC_MANUAL_APPLICATION_MARKER) || response?.includes(COMPATEC_MANUAL_PARTIAL_MARKER));
}

export function isManualCompatecVerified(response?: string | null) {
  return Boolean(response?.includes(COMPATEC_MANUAL_VERIFIED_MARKER));
}

export function getManualCompatecApplicationEventBaseline(response?: string | null) {
  const match = response?.match(/^\[EVENTO DE ESTADO BASE DA CONFERÊNCIA MANUAL: #(\d+)\]$/m);
  if (!match) return null;
  const eventId = Number(match[1]);
  return Number.isSafeInteger(eventId) && eventId >= 0 ? eventId : null;
}

const CHANGE_OUTCOMES: CompatecReconciliationOutcome[] = ["applied", "not_applied"];

export function isCompatecReconciliationOutcomeAllowed(commandType: string, outcome: CompatecReconciliationOutcome) {
  if (commandType === "query_status" || commandType === "query_sectors") return outcome === "verified" || outcome === "unavailable";
  if (commandType === "configure_zones") return CHANGE_OUTCOMES.includes(outcome) || outcome === "partial" || outcome === "verified";
  return ["arm", "disarm", "isolate_zone", "restore_zone"].includes(commandType)
    && (CHANGE_OUTCOMES.includes(outcome) || outcome === "verified");
}

export function getCompatecReconciliationOutcomeLabel(commandType: string, outcome: CompatecReconciliationOutcome) {
  if (commandType === "query_status" || commandType === "query_sectors") {
    if (outcome === "verified") return "Resultado da consulta conferido por outro meio";
    if (outcome === "unavailable") return "Consulta sem resposta; central conferida por outro meio";
  }
  if (outcome === "verified") return "Estado final confirmado em nova conferência direta";
  if (outcome === "applied") return "Alteração solicitada confirmada na central";
  if (outcome === "not_applied") return "Não aplicado; estado atual conferido manualmente";
  if (outcome === "partial" && commandType === "configure_zones") return "Aplicação parcial confirmada; bloqueio mantido até conferência completa";
  return "Resultado inválido para este comando";
}

export function getCompatecReconciledStatus(commandType: string, outcome: CompatecReconciliationOutcome) {
  if (outcome === "not_applied") return "cancelled" as const;
  if (outcome === "applied" || outcome === "partial") return "dispatch_unknown" as const;
  return "reconciled" as const;
}

export function getCompatecReconciliationOptions(commandType: string, applicationPending = false) {
  if (applicationPending) {
    return (commandType === "configure_zones" ? ["partial", "verified"] as const : ["verified"] as const)
      .map((value) => ({ value, label: getCompatecReconciliationOutcomeLabel(commandType, value) }));
  }
  const outcomes: CompatecReconciliationOutcome[] = commandType === "query_status" || commandType === "query_sectors"
    ? ["verified", "unavailable"]
    : commandType === "configure_zones"
      ? ["applied", "not_applied", "partial"]
      : ["applied", "not_applied"];
  return outcomes.map((value) => ({ value, label: getCompatecReconciliationOutcomeLabel(commandType, value) }));
}
