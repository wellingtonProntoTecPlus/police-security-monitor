export const INCIDENT_AUDIT_OPERATOR_ACTIONS = [
  "attendance_opened",
  "camera_viewed",
  "contact_selected",
  "contact_call_clicked",
  "contact_whatsapp_clicked",
  "police_action_registered",
  "tactical_status_updated",
] as const;

export type IncidentAuditOperatorAction = (typeof INCIDENT_AUDIT_OPERATOR_ACTIONS)[number];

/** getRandomValues funciona também em HTTP; randomUUID pode exigir contexto HTTPS. */
export function createIncidentAuditRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== "function") throw new Error("Gerador seguro de auditoria indisponível neste navegador");
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type IncidentAuditRow = {
  id: number;
  incidentId: number;
  operatorName: string;
  action: string;
  statusBefore?: string | null;
  statusAfter?: string | null;
  note?: string | null;
  createdAt: Date | string;
};

export function incidentAuditActionLabel(entry: Pick<IncidentAuditRow, "action" | "statusAfter">) {
  switch (entry.action) {
    case "claimed": return "Abriu e assumiu o atendimento";
    case "resumed": return "Retomou o atendimento";
    case "assumed": return "Assumiu o atendimento";
    case "paused": return "Pausou o atendimento e registrou o motivo";
    case "maintenance": return "Colocou a ocorrência em manutenção";
    case "maintenance_scheduled": return "Agendou a manutenção";
    case "maintenance_released": return "Retirou a central da manutenção";
    case "maintenance_expired": return "Período de manutenção encerrado";
    case "observation_expired": return "Prazo de observação encerrado";
    case "status_changed":
      if (entry.statusAfter === "dispatched") return "Encaminhou o atendimento ao tático";
      if (entry.statusAfter === "attending") return "Retomou o atendimento";
      return "Alterou o status da ocorrência";
    case "observing": return "Colocou a ocorrência em observação";
    case "finalized": return "Finalizou a ocorrência";
    case "bulk_finalized": return "Finalizou ocorrências em massa";
    case "auto_restored": return "Falha restaurada automaticamente";
    case "attendance_opened": return "Abriu a tela do atendimento";
    case "camera_viewed": return "Abriu uma câmera";
    case "contact_selected": return "Selecionou um contato";
    case "contact_call_clicked": return "Acionou a opção de ligação";
    case "contact_whatsapp_clicked": return "Abriu a opção de WhatsApp";
    case "police_action_registered": return "Registrou acionamento manual da Polícia";
    case "tactical_status_updated": return "Atualizou status informado do patrulheiro";
    case "remote_command_reconciled": return "Conferiu manualmente o resultado de comando remoto";
    default: return entry.action.replaceAll("_", " ");
  }
}

export function formatIncidentAuditDateTime(value: Date | string | null | undefined) {
  if (!value) return "Horário não informado";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Horário não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}
