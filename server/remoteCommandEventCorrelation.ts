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
  technicalUserCode?: string | null;
  panelUser?: string | null;
}) {
  const rows = [
    "[COMANDO REMOTO CONFIRMADO]",
    `Ação: ${input.commandLabel}`,
    `Solicitado por: ${input.requestedBy}`,
  ];
  if (input.panelUser) rows.push(`Usuário informado pela central: ${input.panelUser}`);
  if (input.technicalUserCode) rows.push(`Usuário técnico do comando: ${input.technicalUserCode}`);
  rows.push(`Auditoria do comando: #${input.commandId}`);
  return rows.join("\n");
}
