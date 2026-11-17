export const COMPATEC_RECONCILIATION_OUTCOMES = [
  "applied",
  "not_applied",
  "partial",
  "verified",
  "unavailable",
] as const;

export type CompatecReconciliationOutcome = (typeof COMPATEC_RECONCILIATION_OUTCOMES)[number];

const CHANGE_OUTCOMES: CompatecReconciliationOutcome[] = ["applied", "not_applied"];

export function isCompatecReconciliationOutcomeAllowed(commandType: string, outcome: CompatecReconciliationOutcome) {
  if (commandType === "query_status" || commandType === "query_sectors") return outcome === "verified" || outcome === "unavailable";
  if (commandType === "configure_zones") return CHANGE_OUTCOMES.includes(outcome) || outcome === "partial";
  return ["arm", "disarm", "isolate_zone", "restore_zone"].includes(commandType) && CHANGE_OUTCOMES.includes(outcome);
}

export function getCompatecReconciliationOutcomeLabel(commandType: string, outcome: CompatecReconciliationOutcome) {
  if (commandType === "query_status" || commandType === "query_sectors") {
    if (outcome === "verified") return "Resultado da consulta conferido por outro meio";
    if (outcome === "unavailable") return "Consulta sem resposta; central conferida por outro meio";
  }
  if (outcome === "applied") return "Alteração solicitada confirmada na central";
  if (outcome === "not_applied") return "Alteração não aplicada; estado atual conferido";
  if (outcome === "partial" && commandType === "configure_zones") return "Resultado parcial; estados atuais conferidos";
  return "Resultado inválido para este comando";
}

export function getCompatecReconciliationOptions(commandType: string) {
  const outcomes: CompatecReconciliationOutcome[] = commandType === "query_status" || commandType === "query_sectors"
    ? ["verified", "unavailable"]
    : commandType === "configure_zones"
      ? ["applied", "not_applied", "partial"]
      : ["applied", "not_applied"];
  return outcomes.map((value) => ({ value, label: getCompatecReconciliationOutcomeLabel(commandType, value) }));
}
