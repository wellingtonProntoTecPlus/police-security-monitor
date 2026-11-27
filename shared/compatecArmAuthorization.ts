export const COMPATEC_ARM_AUTHORIZATION_BASES = [
  "customer_request",
  "scheduled_time_due",
  "scheduled_arm_overdue",
] as const;

export type CompatecArmAuthorizationBasis = (typeof COMPATEC_ARM_AUTHORIZATION_BASES)[number];

export const COMPATEC_MANUAL_VERIFICATION_SOURCES = [
  "panel_event_history",
  "official_app_command_history",
  "other_direct_record",
  "external_report",
] as const;
export type CompatecManualVerificationSource = (typeof COMPATEC_MANUAL_VERIFICATION_SOURCES)[number];

const DIRECT_VERIFICATION_SOURCES: CompatecManualVerificationSource[] = [
  "panel_event_history",
  "official_app_command_history",
  "other_direct_record",
];

const VERIFICATION_SOURCE_LABELS: Record<CompatecManualVerificationSource, string> = {
  panel_event_history: "Histórico de eventos da central",
  official_app_command_history: "Histórico de comandos do aplicativo oficial",
  other_direct_record: "Outro registro técnico direto",
  external_report: "Relato externo (não comprova aplicação nem não aplicação)",
};

export function getCompatecManualVerificationSourceOptions() {
  return COMPATEC_MANUAL_VERIFICATION_SOURCES.map((value) => ({ value, label: VERIFICATION_SOURCE_LABELS[value] }));
}

export function getCompatecManualVerificationSourceLabel(source: string) {
  return VERIFICATION_SOURCE_LABELS[source as CompatecManualVerificationSource] || source;
}

export const COMPATEC_MANUAL_OBSERVED_STATES = [
  "armed",
  "disarmed",
  "zone_isolated",
  "zone_normal",
  "all_targets_applied",
  "all_targets_unchanged",
  "some_targets_changed",
  "query_verified",
  "unavailable",
] as const;
export type CompatecManualObservedState = (typeof COMPATEC_MANUAL_OBSERVED_STATES)[number];

const OBSERVED_STATE_LABELS: Record<CompatecManualObservedState, string> = {
  armed: "Painel ARMADO",
  disarmed: "Painel DESARMADO",
  zone_isolated: "Setor permanece isolado/anulado",
  zone_normal: "Setor normal/restaurado",
  all_targets_applied: "Todos os setores solicitados conferidos no estado desejado",
  all_targets_unchanged: "Todos os setores continuam no estado anterior; nenhuma alteração foi aplicada",
  some_targets_changed: "Somente parte das alterações solicitadas foi aplicada",
  query_verified: "Resultado da consulta conferido por outra fonte direta",
  unavailable: "Estado indisponível/não conclusivo",
};

export function getCompatecManualObservedStateOptions(commandType: string, outcome?: string) {
  let values: CompatecManualObservedState[];
  if (commandType === "arm") values = outcome === "not_applied" ? ["disarmed"] : ["armed"];
  else if (commandType === "disarm") values = outcome === "not_applied" ? ["armed"] : ["disarmed"];
  else if (commandType === "isolate_zone") values = outcome === "not_applied" ? ["zone_normal"] : ["zone_isolated"];
  else if (commandType === "restore_zone") values = outcome === "not_applied" ? ["zone_isolated"] : ["zone_normal"];
  else if (commandType === "configure_zones") {
    values = outcome === "not_applied" ? ["all_targets_unchanged"]
      : outcome === "partial" ? ["some_targets_changed"]
        : ["all_targets_applied"];
  } else {
    values = outcome === "unavailable" ? ["unavailable"] : ["query_verified"];
  }
  return values.map((value) => ({ value, label: OBSERVED_STATE_LABELS[value] }));
}

export function getCompatecManualObservedStateLabel(observedState: string) {
  return OBSERVED_STATE_LABELS[observedState as CompatecManualObservedState] || observedState;
}

export function isCompatecManualEvidenceReferenceValid(source: string, reference: string) {
  const value = reference.trim();
  if (!value || value.length > 160) return false;
  if (source === "panel_event_history") return /\b(?:evento|event)\s*#?\s*[1-9]\d{0,11}\b/i.test(value);
  if (source === "official_app_command_history") {
    return /\b(?:registro|comando|log)\s*#?\s*[A-Za-z0-9_-]{1,30}\b/i.test(value)
      || /\b(?:\d{2}[/.\-]\d{2}[/.\-]\d{4}|\d{4}[/.\-]\d{2}[/.\-]\d{2})[ ,T]+\d{2}:\d{2}(?::\d{2})?\b/.test(value);
  }
  if (source !== "other_direct_record") return false;
  return /\b(?:id|ref(?:er[eê]ncia)?|protocolo|registro|ticket|laudo|ordem)\s*[:#-]?\s*[A-Z0-9_-]{3,40}\b/i.test(value)
    || /\b(?:\d{2}[/.\-]\d{2}[/.\-]\d{4}|\d{4}[/.\-]\d{2}[/.\-]\d{2})[ ,T]+\d{2}:\d{2}(?::\d{2})?\b/.test(value);
}

function expectedObservedState(commandType: string, outcome: string): CompatecManualObservedState | null {
  const confirmsAppliedState = outcome === "applied" || outcome === "verified";
  if (commandType === "arm") return outcome === "not_applied" ? "disarmed" : confirmsAppliedState ? "armed" : null;
  if (commandType === "disarm") return outcome === "not_applied" ? "armed" : confirmsAppliedState ? "disarmed" : null;
  if (commandType === "isolate_zone") return outcome === "not_applied" ? "zone_normal" : confirmsAppliedState ? "zone_isolated" : null;
  if (commandType === "restore_zone") return outcome === "not_applied" ? "zone_isolated" : confirmsAppliedState ? "zone_normal" : null;
  if (commandType === "configure_zones") {
    if (outcome === "not_applied") return "all_targets_unchanged";
    if (confirmsAppliedState) return "all_targets_applied";
    if (outcome === "partial") return "some_targets_changed";
  }
  if (commandType === "query_status" || commandType === "query_sectors") {
    if (outcome === "verified") return "query_verified";
    if (outcome === "unavailable") return "unavailable";
  }
  return null;
}

/** Manual state changes may be reconciled only with direct evidence matching the selected outcome. */
export function isCompatecManualReconciliationEvidenceValid(input: {
  commandType: string;
  outcome: string;
  verificationSource: string;
  observedState: string;
  evidenceReference: string;
}) {
  const expected = expectedObservedState(input.commandType, input.outcome);
  return expected !== null
    && input.observedState === expected
    && DIRECT_VERIFICATION_SOURCES.includes(input.verificationSource as CompatecManualVerificationSource)
    && isCompatecManualEvidenceReferenceValid(input.verificationSource, input.evidenceReference);
}

function getReceivedCompatecAccount(rawData: string | null | undefined) {
  if (!rawData) return null;
  // Conte qualquer menção ao campo, inclusive prefixos/espaços malformados,
  // para que um marcador bom não esconda uma segunda prova ambígua.
  const markerLines = rawData.split(/\r?\n/).filter((line) => /\bConta recebida\b/i.test(line));
  if (markerLines.length !== 1) return null;
  const match = markerLines[0].match(/^Conta recebida: (\S+)$/);
  if (!match) return null;
  const account = match[1];
  return account && !/^ausente$/i.test(account) ? account : null;
}

export function isCurrentCompatecStateEventSource(event: {
  brand?: string | null;
  account?: string | null;
  receiverPort?: number | null;
  rawData?: string | null;
}, system: {
  account: string;
  receiverPort?: number | null;
  macAddress?: string | null;
  imeiGprs?: string | null;
}) {
  const receivedAccount = getReceivedCompatecAccount(event.rawData);
  if (event.brand?.trim().toUpperCase() !== "COMPATEC"
    || event.account?.trim() !== system.account.trim()
    || receivedAccount !== system.account.trim()
    || !system.receiverPort
    || event.receiverPort !== system.receiverPort) return false;
  const match = event.rawData?.match(/Identificado por\s+(mac_ascii|imei_ascii):\s*([A-F0-9]{6})/i);
  if (!match) return false;
  const capturedType = match[1].toLowerCase();
  const capturedIdentifier = match[2].toUpperCase();
  const registeredIdentifier = (capturedType === "mac_ascii" ? system.macAddress : system.imeiGprs)
    ?.trim().toUpperCase().replace(/[^A-F0-9]/g, "");
  return Boolean(registeredIdentifier && /^[A-F0-9]{6}$/.test(registeredIdentifier) && registeredIdentifier === capturedIdentifier);
}

const AUTHORIZATION_LABELS: Record<CompatecArmAuthorizationBasis, string> = {
  customer_request: "Pedido do cliente",
  scheduled_time_due: "Horário programado de Arme atingido",
  scheduled_arm_overdue: "Arme programado já estava atrasado",
};

export function getCompatecArmAuthorizationLabel(basis: CompatecArmAuthorizationBasis) {
  return AUTHORIZATION_LABELS[basis];
}

export function getCompatecArmAuthorizationOptions() {
  return COMPATEC_ARM_AUTHORIZATION_BASES.map((value) => ({
    value,
    label: AUTHORIZATION_LABELS[value],
  }));
}

export function getCompatecArmAuditReason(basis: CompatecArmAuthorizationBasis, stateEventId?: number) {
  return `Base autorizadora do Arme: ${AUTHORIZATION_LABELS[basis]}${stateEventId ? `; estado desarmado conferido no evento #${stateEventId}` : ""}`;
}

export function getCompatecDisarmAuditReason(reason: string, stateEventId: number) {
  return `${reason.trim()}; estado armado conferido no evento #${stateEventId}`;
}

export function getCompatecArmAuthorizationBasisFromAuditReason(reason: string | null | undefined): CompatecArmAuthorizationBasis | null {
  const match = reason?.match(/^Base autorizadora do Arme: ([^;]+)(?:;|$)/);
  if (!match) return null;
  return COMPATEC_ARM_AUTHORIZATION_BASES.find((basis) => AUTHORIZATION_LABELS[basis] === match[1]) || null;
}

export function getCompatecArmStateEventIdFromAuditReason(reason: string | null | undefined) {
  const match = reason?.match(/(?:^|;\s*)estado desarmado conferido no evento #(\d+)(?:;|$)/i);
  return match ? Number(match[1]) : null;
}

export function getCompatecDisarmStateEventIdFromAuditReason(reason: string | null | undefined) {
  const match = reason?.match(/(?:^|;\s*)estado armado conferido no evento #(\d+)(?:;|$)/i);
  return match ? Number(match[1]) : null;
}

/**
 * Agenda só autoriza Arme quando o estado esperado vigente é ARMADO e a
 * transição de Arme já venceu. A tolerância diferencia “na hora” de “atrasado”.
 */
export function isCompatecArmScheduleBasisAllowed(
  basis: CompatecArmAuthorizationBasis,
  decision: {
    expectedState: "armed" | "disarmed" | "unknown";
    transition: { kind: "arm" | "disarm"; minutesFromNow: number } | null;
    toleranceMinutes: number;
    status?: "within_schedule" | "missed_arm" | "unexpected_disarm" | "report_only";
  },
) {
  if (basis === "customer_request") return true;
  const transition = decision.transition;
  if (decision.expectedState !== "armed" || transition?.kind !== "arm" || transition.minutesFromNow > 0) return false;
  const minutesLate = Math.abs(transition.minutesFromNow);
  if (basis === "scheduled_time_due") return decision.status === "within_schedule" && minutesLate <= decision.toleranceMinutes;
  return decision.status === "missed_arm" && minutesLate > decision.toleranceMinutes;
}

export function areCompatecArmScheduleBasesAllowed(
  basis: CompatecArmAuthorizationBasis,
  decisions: Array<Parameters<typeof isCompatecArmScheduleBasisAllowed>[1]>,
) {
  return decisions.length > 0 && decisions.every((decision) => isCompatecArmScheduleBasisAllowed(basis, decision));
}
