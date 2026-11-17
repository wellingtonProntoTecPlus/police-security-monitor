export type RemoteCommandEventCandidate = {
  brand: string;
  commandType: string;
  transportMode: string;
  status: string;
  panelConfirmedAt: Date | null;
  remoteEventId: number | null;
};

export type IncomingRemoteEvent = {
  brand: string;
  qualifier: string;
  eventCode: string;
  receivedAt: Date;
};

export type CompatecZoneChangeAudit = {
  zoneNumber: number;
  armState?: "armed" | "disarmed";
  bypassState?: "annulled" | "restored";
};

export function formatCompatecZoneChanges(changes: CompatecZoneChangeAudit[] = []) {
  return changes.map((change) => {
    const states = [
      change.armState === "armed" ? "armado" : change.armState === "disarmed" ? "desarmado" : null,
      change.bypassState === "annulled" ? "anulado" : change.bypassState === "restored" ? "anulação retirada" : null,
    ].filter(Boolean);
    return `Setor ${change.zoneNumber}: ${states.join(" e ")}`;
  });
}

export function getRemoteCommandActionLabel(commandType: string) {
  return commandType === "configure_zones"
    ? "Configuração de setores via PoliceCentral"
    : commandType === "arm"
    ? "Arme remoto via PoliceCentral"
    : commandType === "disarm"
      ? "Desarme remoto via PoliceCentral"
      : commandType === "isolate_zone"
        ? "Inibição de zona via PoliceCentral"
        : commandType === "restore_zone"
          ? "Restauração de zona via PoliceCentral"
      : `Comando remoto via PoliceCentral: ${commandType}`;
}

export function getRemoteCommandOutcomeLabel(status: string, commandType?: string, response?: string | null) {
  const isZoneBypassCommand = commandType === "isolate_zone" || commandType === "restore_zone" || commandType === "configure_zones";
  const isCompatecArmDisarmAck = (commandType === "arm" || commandType === "disarm")
    && /(?:^|\n)MB=KA4(?:\[[^\]\r\n]*\])?\r?$/m.test(response || "");
  switch (status) {
    case "queued":
      return "Solicitado; aguardando envio à central.";
    case "waiting_connection":
      return isZoneBypassCommand
        ? "Ainda não enviado; aguardando sessão TCP identificada pelo cadastro físico Compatec e porta do receptor."
        : "Ainda não enviado; aguardando conexão autenticada da central.";
    case "dispatching":
      return "Despacho reservado; aguardando confirmação da transmissão.";
    case "dispatch_unknown":
      return "Resultado indeterminado; conferir a central antes de qualquer novo comando.";
    case "reconciled":
      return "Resultado conferido manualmente; não é confirmação eletrônica do painel.";
    case "sent":
      return isZoneBypassCommand ? "Enviado à central; aguardando resposta KA1." : "Enviado à central; aguardando confirmação.";
    case "responded":
      if (commandType === "configure_zones") return "Resposta KA1 recebida; indica recebimento da configuração, não confirma os estados finais dos setores. Confira a central.";
      if (isZoneBypassCommand) return "Resposta KA1 recebida; indica recebimento do comando, não confirmação do estado final do bypass.";
      if (isCompatecArmDisarmAck) return "Resposta KA4 recebida; indica resposta ao comando, não confirma o estado final. Confira o estado/evento da central.";
      return "Confirmado pela central.";
    case "failed":
      return "Falha; a central não confirmou o comando.";
    case "expired":
      return "Expirado sem envio à central.";
    case "cancelled":
      return "Cancelado; não enviado à central.";
    case "simulated":
      return "Simulação; nenhum comando físico foi enviado.";
    default:
      return `Status do comando: ${status}.`;
  }
}

export function buildRemoteCommandRequestNote(input: {
  commandId: number;
  commandType: string;
  operatorName: string;
  reason: string;
  requestedBy?: string | null;
  zoneNumber?: number | null;
  zoneChanges?: CompatecZoneChangeAudit[];
}) {
  return [
    `[COMANDO REMOTO #${input.commandId} SOLICITADO]`,
    `Ação: ${getRemoteCommandActionLabel(input.commandType)}`,
    "Origem: PoliceCentral (Central de Monitoramento)",
    `Operador: ${input.operatorName}`,
    input.requestedBy ? `Solicitado por: ${input.requestedBy}` : null,
    input.zoneNumber ? `Zona: ${input.zoneNumber}` : null,
    ...(input.zoneChanges || []).length ? formatCompatecZoneChanges(input.zoneChanges) : [],
    `Motivo: ${input.reason}`,
    input.commandType === "configure_zones"
      ? "Resultado: aguardando envio e resposta KA1; esta resposta indica recebimento, não confirmação dos estados finais dos setores. Nenhum AK4 integra esta ação."
      : input.commandType === "isolate_zone" || input.commandType === "restore_zone"
      ? "Resultado: aguardando envio e resposta KA1; essa resposta indica recebimento, não o estado final do bypass."
      : "Resultado: aguardando envio e confirmação da central.",
    `Auditoria do comando: #${input.commandId}`,
  ].filter(Boolean).join("\n");
}

export function buildRemoteCommandOccurrenceText(input: {
  commandId: number;
  commandType: string;
  operatorName: string;
  reason: string;
  status: string;
  response?: string | null;
  requestedBy?: string | null;
  zoneNumber?: number | null;
  zoneChanges?: CompatecZoneChangeAudit[];
}) {
  const action = getRemoteCommandActionLabel(input.commandType);
  const outcome = getRemoteCommandOutcomeLabel(input.status, input.commandType, input.response);
  return {
    eventCode: "REMOTE",
    qualifier: null,
    description: `${action} — ${outcome}`,
    observations: [
      `[COMANDO REMOTO #${input.commandId}]`,
      `Operação: ${action}`,
      "Origem: PoliceCentral (Central de Monitoramento)",
      `Operador: ${input.operatorName}`,
      input.requestedBy ? `Solicitado por: ${input.requestedBy}` : null,
      input.zoneNumber ? `Zona: ${input.zoneNumber}` : null,
      ...(input.zoneChanges || []).length ? formatCompatecZoneChanges(input.zoneChanges) : [],
      `Motivo: ${input.reason}`,
      `Resultado: ${outcome}`,
      input.response ? `Resposta da central: ${input.response}` : null,
      `Auditoria do comando: #${input.commandId}`,
    ].filter(Boolean).join("\n"),
  };
}

/**
 * A associação é deliberadamente restrita aos comandos físicos cuja
 * confirmação e evento Contact ID são conhecidos. Não se infere origem de
 * eventos de Arme, PGM ou Zona enquanto cada protocolo não for homologado.
 */
export function isConfirmedRemoteCommandEventMatch(
  command: RemoteCommandEventCandidate,
  event: IncomingRemoteEvent,
  windowMs = 90_000,
) {
  if (
    command.brand !== "VETTI"
    || command.commandType !== "disarm"
    || command.transportMode !== "vsec_bench"
    || (command.status !== "sent" && command.status !== "responded")
    || !command.panelConfirmedAt
    || command.remoteEventId !== null
  ) return false;

  if (event.brand !== "VETTI" || event.qualifier !== "E" || event.eventCode !== "401") return false;
  return Math.abs(event.receivedAt.getTime() - command.panelConfirmedAt.getTime()) <= windowMs;
}

export function buildRemoteCommandIncidentNotes(input: {
  commandId: number;
  commandLabel: string;
  requestedBy: string;
  requesterName?: string | null;
  zoneNumber?: number | null;
  reason?: string;
  response?: string | null;
  technicalUserCode?: string | null;
  panelUser?: string | null;
  commandType?: string;
  zoneChanges?: CompatecZoneChangeAudit[];
}) {
  const isZoneConfiguration = input.commandType === "configure_zones";
  const isZoneBypassCommand = input.commandType === "isolate_zone" || input.commandType === "restore_zone" || isZoneConfiguration;
  const isCompatecArmDisarmAck = (input.commandType === "arm" || input.commandType === "disarm")
    && /(?:^|\n)MB=KA4(?:\[[^\]\r\n]*\])?\r?$/m.test(input.response || "");
  const rows = [
    `[COMANDO REMOTO #${input.commandId} ${isZoneBypassCommand ? "RESPOSTA KA1 RECEBIDA" : isCompatecArmDisarmAck ? "RESPOSTA KA4 RECEBIDA" : "CONFIRMADO"}]`,
    `Ação: ${input.commandLabel}`,
    "Origem: PoliceCentral (Central de Monitoramento)",
    `Operador: ${input.requestedBy}`,
    `Solicitado por: ${input.requesterName || input.requestedBy}`,
    input.zoneNumber ? `Zona: ${input.zoneNumber}` : null,
    ...(input.zoneChanges || []).length ? formatCompatecZoneChanges(input.zoneChanges) : [],
  ];
  if (input.reason) rows.push(`Motivo: ${input.reason}`);
  rows.push(isZoneConfiguration
    ? "Resultado: resposta KA1 recebida; indica que a central recebeu a configuração. Os estados finais dos setores não foram confirmados; nenhum AK4 foi enviado."
    : isZoneBypassCommand
    ? "Resultado: resposta KA1 recebida; indica que a central recebeu o comando, não confirma o estado final do bypass."
    : isCompatecArmDisarmAck
      ? "Resultado: resposta KA4 recebida; indica resposta ao comando, não confirma o estado final do Arme/Desarme. Confira o estado/evento do painel."
      : "Resultado: confirmado pela central.");
  if (input.response) rows.push(`Resposta da central: ${input.response}`);
  if (input.panelUser) rows.push(`Usuário informado pela central: ${input.panelUser}`);
  if (input.technicalUserCode) rows.push(`Usuário técnico do comando: ${input.technicalUserCode}`);
  rows.push(`Auditoria do comando: #${input.commandId}`);
  return rows.join("\n");
}
