import { and, desc, eq, gte, inArray, isNull, like, lt, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { TRPCError } from "@trpc/server";
import { alarmEvents, alarmSystems, cameras, clientContacts, clients, incidentHistory, incidents } from "../drizzle/schema";

type Db = ReturnType<typeof drizzle>;
export type IncidentAuditActionInput = {
  incidentId: number;
  requestId: string;
  action: "attendance_opened" | "camera_viewed" | "contact_selected" | "contact_call_clicked" | "contact_whatsapp_clicked" | "police_action_registered" | "tactical_status_updated";
  targetId?: number;
  tacticalStatus?: "en_route" | "arrived" | "inspection" | "completed";
};
export const TACTICAL_AUDIT_STATUS_LABELS = {
  en_route: "Em deslocamento", arrived: "Chegou ao local", inspection: "Em verificação", completed: "Verificação concluída",
} as const;

const auditProjection = {
  id: incidentHistory.id, incidentId: incidentHistory.incidentId,
  operatorId: incidentHistory.operatorId, operatorName: incidentHistory.operatorName,
  action: incidentHistory.action, statusBefore: incidentHistory.statusBefore,
  statusAfter: incidentHistory.statusAfter, note: incidentHistory.note, createdAt: incidentHistory.createdAt,
};

export async function recordIncidentOperatorActionWithDb(db: Db, input: IncidentAuditActionInput, actor: { id: number; name: string }, lockSession: (tx: any) => Promise<void>) {
  return db.transaction(async (tx) => {
    await lockSession(tx);
    const [incident] = await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).for("update").limit(1);
    if (!incident) throw new TRPCError({ code: "NOT_FOUND", message: "Ocorrência não encontrada" });
    const [existing] = await tx.select(auditProjection).from(incidentHistory).where(eq(incidentHistory.requestId, input.requestId)).limit(1);
    if (existing) {
      if (existing.incidentId !== input.incidentId || existing.operatorId !== actor.id || existing.action !== input.action) throw new TRPCError({ code: "CONFLICT", message: "Chave de registro já utilizada em outra ação" });
      const targetMarker = input.action === "camera_viewed" ? `[câmera #${input.targetId}]` : input.action.startsWith("contact_") ? `[contato #${input.targetId}]` : null;
      if (targetMarker && !existing.note?.includes(targetMarker)) throw new TRPCError({ code: "CONFLICT", message: "Chave de registro já utilizada com outro alvo" });
      if (input.action === "tactical_status_updated" && (!input.tacticalStatus || !existing.note?.includes(`patrulheiro: ${TACTICAL_AUDIT_STATUS_LABELS[input.tacticalStatus]}.`))) throw new TRPCError({ code: "CONFLICT", message: "Chave de registro já utilizada com outro status" });
      return existing;
    }
    if (!inArrayStatus(incident.status) || incident.operatorId !== actor.id) throw new TRPCError({ code: "FORBIDDEN", message: "Somente o operador responsável por um atendimento aberto pode registrar esta ação" });
    const [system] = incident.alarmSystemId ? await tx.select({ clientId: alarmSystems.clientId }).from(alarmSystems).where(eq(alarmSystems.id, incident.alarmSystemId)).limit(1) : [];
    if (incident.clientId && system?.clientId && incident.clientId !== system.clientId) throw new TRPCError({ code: "CONFLICT", message: "Vínculo cliente/central divergente" });
    const clientId = incident.clientId ?? system?.clientId;
    let note: string;
    if (input.action === "camera_viewed") {
      if (!input.targetId || !clientId) throw new TRPCError({ code: "BAD_REQUEST", message: "Câmera cadastrada não identificada" });
      const clientCameras = await tx.select({ id: cameras.id, name: cameras.name }).from(cameras).where(and(eq(cameras.clientId, clientId), eq(cameras.isActive, true))).orderBy(cameras.id);
      const index = clientCameras.findIndex((camera) => camera.id === input.targetId);
      if (index < 0) throw new TRPCError({ code: "NOT_FOUND", message: "Câmera não pertence ao cliente desta ocorrência" });
      note = `Abriu Câmera ${index + 1} — ${clientCameras[index].name} [câmera #${input.targetId}]. A abertura não confirma reprodução ou visualização do vídeo.`;
    } else if (input.action.startsWith("contact_")) {
      if (!input.targetId || !clientId) throw new TRPCError({ code: "BAD_REQUEST", message: "Contato cadastrado não identificado" });
      const [contact] = await tx.select({ id: clientContacts.id, name: clientContacts.name }).from(clientContacts).where(and(
        eq(clientContacts.id, input.targetId), eq(clientContacts.clientId, clientId), eq(clientContacts.isActive, true),
        or(isNull(clientContacts.alarmSystemId), eq(clientContacts.alarmSystemId, incident.alarmSystemId ?? 0)),
      )).limit(1);
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contato não pertence ao cliente/central desta ocorrência" });
      note = input.action === "contact_selected" ? `Selecionou contato ${contact.name}.` : input.action === "contact_call_clicked" ? `Acionou a opção Ligar para ${contact.name}; não confirma ligação completada.` : `Acionou a opção WhatsApp para ${contact.name}; não confirma envio ou resposta.`;
      note += ` [contato #${input.targetId}]`;
    } else if (input.action === "tactical_status_updated") {
      if (incident.status !== "dispatched" || !input.tacticalStatus || !TACTICAL_AUDIT_STATUS_LABELS[input.tacticalStatus]) throw new TRPCError({ code: "BAD_REQUEST", message: "Encaminhe primeiro ao tático e selecione o status informado" });
      note = `Atualizou status informado do patrulheiro: ${TACTICAL_AUDIT_STATUS_LABELS[input.tacticalStatus]}. Registro manual do operador; não representa telemetria automática.`;
    } else if (input.action === "attendance_opened") {
      note = "Abriu a tela de atendimento da ocorrência sob sua responsabilidade.";
    } else if (input.action === "police_action_registered") {
      note = "Registrou acionamento manual da Polícia. O PoliceCentral não realiza chamada telefônica automaticamente.";
    } else {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Ação de auditoria não permitida" });
    }
    const createdAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    const entry = { incidentId: incident.id, parentIncidentId: incident.parentIncidentId, operatorId: actor.id, operatorName: actor.name.slice(0, 255), action: input.action, note, requestId: input.requestId, createdAt };
    const inserted = await tx.insert(incidentHistory).values(entry);
    return { id: Number(inserted[0].insertId), ...entry, statusBefore: null, statusAfter: null };
  });
}
function inArrayStatus(status: string) { return ["attending", "observing", "dispatched", "maintenance"].includes(status); }

export async function listIncidentAuditTrailWithDb(db: Db, incidentId: number, beforeId?: number) {
  const conditions = [eq(incidentHistory.incidentId, incidentId)];
  if (beforeId) {
    const [cursor] = await db.select({ id: incidentHistory.id, createdAt: incidentHistory.createdAt }).from(incidentHistory).where(and(eq(incidentHistory.incidentId, incidentId), eq(incidentHistory.id, beforeId))).limit(1);
    if (!cursor) throw new TRPCError({ code: "BAD_REQUEST", message: "Cursor não pertence a esta ocorrência" });
    conditions.push(or(lt(incidentHistory.createdAt, cursor.createdAt), and(eq(incidentHistory.createdAt, cursor.createdAt), lt(incidentHistory.id, cursor.id)))!);
  }
  const rows = await db.select(auditProjection).from(incidentHistory).where(and(...conditions)).orderBy(desc(incidentHistory.createdAt), desc(incidentHistory.id)).limit(101);
  const items = rows.slice(0, 100);
  return { items, nextCursor: rows.length > 100 ? items.at(-1)!.id : null };
}

export type IncidentAuditReportInput = { from?: Date; to?: Date; account?: string; clientId?: number; partnerCompanyId?: number; operatorName?: string; incidentId?: number; offset?: number };
export async function listIncidentAuditReportWithDb(db: Db, input: IncidentAuditReportInput) {
  const conditions = [];
  if (input.from) conditions.push(gte(incidentHistory.createdAt, input.from));
  if (input.to) conditions.push(lte(incidentHistory.createdAt, input.to));
  if (input.account?.trim()) conditions.push(like(alarmEvents.account, `%${input.account.trim()}%`));
  if (input.clientId) conditions.push(eq(clients.id, input.clientId));
  if (input.partnerCompanyId) conditions.push(eq(clients.partnerCompanyId, input.partnerCompanyId));
  if (input.operatorName?.trim()) conditions.push(like(incidentHistory.operatorName, `%${input.operatorName.trim()}%`));
  if (input.incidentId) conditions.push(eq(incidentHistory.incidentId, input.incidentId));
  const rows = await db.select({ ...auditProjection, account: alarmEvents.account, clientName: clients.name, fantasyName: clients.fantasyName, alarmSystemId: incidents.alarmSystemId })
    .from(incidentHistory)
    .leftJoin(incidents, eq(incidents.id, incidentHistory.incidentId))
    .leftJoin(alarmEvents, eq(alarmEvents.id, incidents.eventId))
    .leftJoin(alarmSystems, eq(alarmSystems.id, incidents.alarmSystemId))
    .leftJoin(clients, eq(clients.id, sql`COALESCE(${incidents.clientId}, ${alarmSystems.clientId})`))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(incidentHistory.createdAt), desc(incidentHistory.id))
    .limit(101).offset(Math.max(0, input.offset ?? 0));
  return { items: rows.slice(0, 100), hasMore: rows.length > 100 };
}
