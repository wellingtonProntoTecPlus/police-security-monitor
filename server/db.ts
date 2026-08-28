import { eq, and, or, desc, sql, like, inArray, gte, lte, ne, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  managingCompanies, InsertManagingCompany,
  partnerCompanies, InsertPartnerCompany,
  registrationDocuments,
  tacticalMobiles, InsertTacticalMobile,
  clients, InsertClient,
  clientContacts, InsertClientContact,
  alarmSystems, InsertAlarmSystem,
  alarmZones, InsertAlarmZone,
  alarmUsers, InsertAlarmUser,
  cameras, InsertCamera,
  alarmEvents, InsertAlarmEvent,
  incidents, InsertIncident,
  contactIdCodes,
  systemTechnicalAccounts,
  systemKeepAliveSamples,
  systemDisconnectAlerts,
  alarmRemoteCommands, InsertAlarmRemoteCommand,
  alarmRemoteCredentials,
} from "../drizzle/schema";
import {
  alarmPgms, InsertAlarmPgm,
  alarmSchedules, InsertAlarmSchedule,
  clientProcedures, InsertClientProcedure,
  partnerHolidays, InsertPartnerHoliday,
  occurrences, InsertOccurrence,
  managingHolidays, InsertManagingHoliday,
} from "../drizzle/schema";
import { finalizations, InsertFinalization } from "../drizzle/schema";
import { ENV } from './_core/env';
import { findCapturedPanelCandidates, resolveUniqueCapturedPanelCandidate, type SafeCaptureFrame } from "./receiver/safeCapture";
import { canCloseIncidentAfterReport } from "./occurrenceClosureContract";
import { getLatestArmDisarmStatusBySystem } from "./armDisarmStatus";
import { enrichOccurrenceReportClients, filterOccurrenceReportRowsByPartner } from "./occurrenceReportEnrichment";
import { verifyPersistedAlarmUser } from "./alarmUserPersistence";
import { formatRegistrationFields, formatRegistrationText, normalizeRegistrationPayload } from "./registrationText";
import { validateOptionalBrazilianDocument } from "@shared/documentValidation";
import { getAlarmSystemIdentifierValidationError, isJflVersion5OrLater as isJflVersion5OrLaterByProfile } from "@shared/alarmSystemProfiles";
import { prepareAlarmSystemCreatePayload, prepareClientProcedurePayload, prepareFinalizationPayload, prepareSystemUserCreatePayload } from "./registrationCrudPayloads";
import { measureKeepAlive } from "./keepAliveTracking";
import { getKeepAliveConnectionStatus } from "./keepAliveStatus";
import { processKeepAliveDisconnectCandidates, restoreKeepAliveDisconnectAlerts, type KeepAliveDisconnectCandidate } from "./keepAliveDisconnectWorkflow";
import { enrichClientsWithAccounts } from "./clientAccountList";
import { matchesOperationalEventGroup, resolveOperationalEventCategory, type EventReportGroup } from "./operationalEventReport";
import { decryptRemoteCommandCredential, encryptRemoteCommandCredential } from "./remoteCommandCredentials";
import { deriveVettiCommandUser } from "@shared/remoteCommandCredentialProfiles";

let _db: ReturnType<typeof drizzle> | null = null;

/** Exclusivo para testes: permite validar os payloads persistidos sem depender da conexão externa. */
export function setDbForTesting(db: ReturnType<typeof drizzle> | null) {
  _db = db;
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============================================================
// USERS
// ============================================================
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = 'admin';
    updateSet.role = 'admin';
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============================================================
// MANAGING COMPANIES
// ============================================================
export async function listManagingCompanies() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(managingCompanies).orderBy(managingCompanies.name);
}

export async function getManagingCompany(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(managingCompanies).where(eq(managingCompanies.id, id)).limit(1);
  return result[0];
}

export async function createManagingCompany(data: InsertManagingCompany) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Filtrar campos undefined para evitar erro SQL
  const cleanData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== '') cleanData[key] = value;
  }
  Object.assign(cleanData, formatRegistrationFields(cleanData, ["name", "address", "city"]));
  if (!cleanData.name || !cleanData.cnpj) throw new Error("Nome e CNPJ são obrigatórios");
  const result = await db.insert(managingCompanies).values(cleanData as InsertManagingCompany);
  return { id: result[0].insertId };
}

export async function updateManagingCompany(id: number, data: Partial<InsertManagingCompany>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Filtrar campos undefined
  const cleanData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) cleanData[key] = value;
  }
  Object.assign(cleanData, formatRegistrationFields(cleanData, ["name", "address", "city"]));
  if (Object.keys(cleanData).length === 0) return;
  await db.update(managingCompanies).set(cleanData).where(eq(managingCompanies.id, id));
}

// ============================================================
// PARTNER COMPANIES
// ============================================================
export async function listPartnerCompanies(managingCompanyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (managingCompanyId) {
    return db.select().from(partnerCompanies).where(eq(partnerCompanies.managingCompanyId, managingCompanyId)).orderBy(partnerCompanies.name);
  }
  return db.select().from(partnerCompanies).orderBy(partnerCompanies.name);
}

export async function getPartnerCompany(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(partnerCompanies).where(eq(partnerCompanies.id, id)).limit(1);
  return result[0];
}

export async function createPartnerCompany(data: InsertPartnerCompany) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Filtrar campos undefined para evitar erro SQL
  const cleanData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== '') cleanData[key] = value;
  }
  Object.assign(cleanData, formatRegistrationFields(cleanData, ["name", "address", "city"]));
  if (!cleanData.name || !cleanData.managingCompanyId) throw new Error("Nome e Empresa Gestora são obrigatórios");
  const documentCheck = validateOptionalBrazilianDocument(cleanData.cnpj, "cnpj");
  if (documentCheck.error) throw new Error(documentCheck.error);
  cleanData.cnpj = documentCheck.document ?? undefined;
  await assertDocumentAvailable(db, documentCheck.document, "partner");
  const result = await db.insert(partnerCompanies).values(cleanData as InsertPartnerCompany);
  const id = Number(result[0].insertId);
  await syncRegistrationDocument(db, documentCheck.document, "partner", id);
  return { id };
}

export async function updatePartnerCompany(id: number, data: Partial<InsertPartnerCompany>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Filtrar campos undefined
  const cleanData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) cleanData[key] = value;
  }
  Object.assign(cleanData, formatRegistrationFields(cleanData, ["name", "address", "city"]));
  if (Object.keys(cleanData).length === 0) return;
  if (Object.prototype.hasOwnProperty.call(cleanData, "cnpj")) {
    const documentCheck = validateOptionalBrazilianDocument(cleanData.cnpj, "cnpj");
    if (documentCheck.error) throw new Error(documentCheck.error);
    cleanData.cnpj = documentCheck.document;
    await assertDocumentAvailable(db, documentCheck.document, "partner", id);
    await db.update(partnerCompanies).set(cleanData).where(eq(partnerCompanies.id, id));
    await syncRegistrationDocument(db, documentCheck.document, "partner", id);
    return;
  }
  await db.update(partnerCompanies).set(cleanData).where(eq(partnerCompanies.id, id));
}

// ============================================================
// TÁTICO MÓVEL
// ============================================================
export async function listTacticalMobiles(partnerCompanyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tacticalMobiles).where(eq(tacticalMobiles.partnerCompanyId, partnerCompanyId)).orderBy(tacticalMobiles.name);
}

export async function createTacticalMobile(data: InsertTacticalMobile) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tacticalMobiles).values(formatRegistrationFields(data, ["name", "vehicle"]));
  return { id: result[0].insertId };
}

export async function updateTacticalMobile(id: number, data: Partial<InsertTacticalMobile>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tacticalMobiles).set(formatRegistrationFields(data, ["name", "vehicle"])).where(eq(tacticalMobiles.id, id));
}

export async function deleteTacticalMobile(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(tacticalMobiles).where(eq(tacticalMobiles.id, id));
}

// ============================================================
// CLIENTS
// ============================================================
export async function listClients(partnerCompanyId?: number) {
  const db = await getDb();
  if (!db) return [];
  const clientRows = partnerCompanyId
    ? await db.select().from(clients).where(eq(clients.partnerCompanyId, partnerCompanyId)).orderBy(clients.name)
    : await db.select().from(clients).orderBy(clients.name);
  const systemRows = await db.select({ clientId: alarmSystems.clientId, account: alarmSystems.account }).from(alarmSystems);
  return enrichClientsWithAccounts(clientRows, systemRows);
}

export async function getClient(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return result[0];
}

export async function createClient(data: InsertClient) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const cleanData = formatRegistrationFields(data, ["name", "fantasyName", "address", "complement", "neighborhood", "city"]);
  const documentCheck = validateOptionalBrazilianDocument(cleanData.document, cleanData.type === "pf" ? "cpf" : "cnpj");
  if (documentCheck.error) throw new Error(documentCheck.error);
  cleanData.document = documentCheck.document;
  await assertDocumentAvailable(db, documentCheck.document, "client");
  const result = await db.insert(clients).values(cleanData);
  const id = Number(result[0].insertId);
  await syncRegistrationDocument(db, documentCheck.document, "client", id);
  return { id };
}

export async function updateClient(id: number, data: Partial<InsertClient>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const cleanData = formatRegistrationFields(data, ["name", "fantasyName", "address", "complement", "neighborhood", "city"]);
  if (Object.prototype.hasOwnProperty.call(cleanData, "document") || Object.prototype.hasOwnProperty.call(cleanData, "type")) {
    const current = await getClient(id);
    if (!current) throw new Error("Cliente não encontrado");
    const type = cleanData.type ?? current.type;
    const hasDocumentChange = Object.prototype.hasOwnProperty.call(cleanData, "document");
    const documentCheck = validateOptionalBrazilianDocument(hasDocumentChange ? cleanData.document : current.document, type === "pf" ? "cpf" : "cnpj");
    if (documentCheck.error) throw new Error(documentCheck.error);
    if (hasDocumentChange) {
      cleanData.document = documentCheck.document;
      await assertDocumentAvailable(db, documentCheck.document, "client", id);
    }
    await db.update(clients).set(cleanData).where(eq(clients.id, id));
    if (hasDocumentChange) await syncRegistrationDocument(db, documentCheck.document, "client", id);
    return;
  }
  await db.update(clients).set(cleanData).where(eq(clients.id, id));
}

type DocumentOwnerType = "client" | "partner";

export async function assertDocumentAvailable(db: any, document: string | null, ownerType: DocumentOwnerType, ownerId?: number) {
  if (!document) return;
  const existing = await db.select().from(registrationDocuments).where(eq(registrationDocuments.document, document)).limit(1);
  if (existing[0] && (existing[0].ownerType !== ownerType || existing[0].ownerId !== ownerId)) {
    throw new Error("CPF/CNPJ já cadastrado em outro cliente ou empresa parceira");
  }
  const clientMatches = await db.select({ id: clients.id }).from(clients).where(eq(clients.document, document));
  if (clientMatches.some((row: { id: number }) => ownerType !== "client" || row.id !== ownerId)) {
    throw new Error("CPF/CNPJ já cadastrado em outro cliente ou empresa parceira");
  }
  const partnerMatches = await db.select({ id: partnerCompanies.id }).from(partnerCompanies).where(eq(partnerCompanies.cnpj, document));
  if (partnerMatches.some((row: { id: number }) => ownerType !== "partner" || row.id !== ownerId)) {
    throw new Error("CPF/CNPJ já cadastrado em outro cliente ou empresa parceira");
  }
}

async function syncRegistrationDocument(db: any, document: string | null, ownerType: DocumentOwnerType, ownerId: number) {
  await db.delete(registrationDocuments).where(and(eq(registrationDocuments.ownerType, ownerType), eq(registrationDocuments.ownerId, ownerId)));
  if (document) await db.insert(registrationDocuments).values({ document, ownerType, ownerId });
}

// ============================================================
// CLIENT CONTACTS
// ============================================================
export async function listClientContacts(clientId: number, alarmSystemId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (alarmSystemId) {
    return db.select().from(clientContacts)
      .where(and(eq(clientContacts.clientId, clientId), eq(clientContacts.alarmSystemId, alarmSystemId)))
      .orderBy(clientContacts.priority);
  }
  return db.select().from(clientContacts).where(eq(clientContacts.clientId, clientId)).orderBy(clientContacts.priority);
}

export async function createClientContact(data: InsertClientContact) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clientContacts).values(formatRegistrationFields(data, ["name", "role"]));
  return { id: result[0].insertId };
}

export async function updateClientContact(id: number, data: Partial<InsertClientContact>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clientContacts).set(formatRegistrationFields(data, ["name", "role"])).where(eq(clientContacts.id, id));
}

// ============================================================
// ALARM SYSTEMS
// ============================================================
export async function listAlarmSystems(clientId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (clientId) {
    return db.select().from(alarmSystems).where(eq(alarmSystems.clientId, clientId));
  }
  return db.select().from(alarmSystems);
}

export async function getAlarmSystemByAccount(account: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(alarmSystems).where(eq(alarmSystems.account, account)).limit(1);
  return result[0];
}

export async function getAlarmSystemByManualAccount(account: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalizedAccount = normalizePanelIdentifier(account);
  const systems = await db.select().from(alarmSystems);
  return systems.find((system) => normalizePanelIdentifier(system.account) === normalizedAccount)
    || systems.find((system) => {
      const systemAccount = normalizePanelIdentifier(system.account);
      return normalizedAccount.length >= 4
        && systemAccount.length >= 4
        && normalizedAccount.slice(-4) === systemAccount.slice(-4);
    });
}

export async function getAlarmSystemByReceivedAccount(account: string, brand?: string, receiverPort?: number) {
  const db = await getDb();
  if (!db) return undefined;
  const normalizedAccount = normalizePanelIdentifier(account);
  const scopedConditions = [eq(alarmSystems.account, normalizedAccount)];
  if (brand) scopedConditions.push(eq(alarmSystems.brand, brand as any));
  if (receiverPort) scopedConditions.push(eq(alarmSystems.receiverPort, receiverPort));
  const scoped = await db.select().from(alarmSystems).where(and(...scopedConditions)).limit(2);
  // Se o receptor já conhece marca ou porta, o fallback somente pela conta é
  // inseguro: uma JFL poderia ser vinculada a uma Vetti de mesma conta. Sem
  // sistema compatível único, o evento seguirá para a Conta do Sistema 0000.
  // O limite de dois detecta uma conta repetida na mesma marca/porta e impede
  // que o primeiro cadastro seja escolhido arbitrariamente.
  const found = scoped.length === 1
    ? scoped[0]
    : (!brand && !receiverPort ? await getAlarmSystemByAccount(normalizedAccount) : undefined);
  if (!found) return undefined;

  // Evento Contact ID, por si só, não confirma a supervisão do painel. O status
  // Online é atualizado exclusivamente por recordSystemKeepAlive.
  return found;
}

/**
 * As datas de manutenção são informadas no dashboard no horário de Brasília e
 * a VPS registra DATETIME sem fuso. A referência operacional mantém a mesma
 * convenção para não encerrar uma manutenção três horas antes no servidor UTC.
 */
export function getMaintenanceOperationalNow() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}

export function isSystemInMaintenance(system: Pick<typeof alarmSystems.$inferSelect, "maintenanceStartAt" | "maintenanceEndAt"> | null | undefined, referenceTime = getMaintenanceOperationalNow()) {
  if (!system?.maintenanceStartAt || !system.maintenanceEndAt) return false;
  return system.maintenanceStartAt.getTime() <= referenceTime.getTime()
    && system.maintenanceEndAt.getTime() > referenceTime.getTime();
}

export async function scheduleSystemMaintenance(input: { systemId: number; startAt: Date; endAt: Date; notes?: string; operatorId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (input.endAt <= input.startAt) throw new Error("O fim da manutenção deve ser posterior ao início");
  await db.update(alarmSystems).set({
    maintenanceStartAt: input.startAt,
    maintenanceEndAt: input.endAt,
    maintenanceNotes: input.notes || null,
    maintenanceOperatorId: input.operatorId || null,
  }).where(eq(alarmSystems.id, input.systemId));
}

export async function endSystemMaintenance(systemId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.update(alarmSystems).set({
    maintenanceStartAt: null,
    maintenanceEndAt: null,
    maintenanceNotes: null,
    maintenanceOperatorId: null,
  }).where(eq(alarmSystems.id, systemId));
}

export async function listSystemsConnectionStatus(referenceTime = new Date()) {
  const systems = await listAlarmSystems();
  const db = await getDb();
  if (!db || systems.length === 0) return systems.map((system) => ({ ...system, connectionStatus: "offline" as const, cutoffMs: null }));

  const systemIds = systems.map((system) => system.id);
  const samples = await db.select({
    alarmSystemId: systemKeepAliveSamples.alarmSystemId,
    intervalMs: systemKeepAliveSamples.intervalMs,
  }).from(systemKeepAliveSamples)
    .where(inArray(systemKeepAliveSamples.alarmSystemId, systemIds))
    .orderBy(desc(systemKeepAliveSamples.receivedAt))
    .limit(Math.max(systemIds.length * 30, 30));

  const intervalsBySystem = new Map<number, Array<number | null>>();
  for (const sample of samples) {
    const current = intervalsBySystem.get(sample.alarmSystemId) || [];
    current.push(sample.intervalMs);
    intervalsBySystem.set(sample.alarmSystemId, current);
  }

  return systems.map((system) => {
    if (!system.keepAliveMonitoringEnabled) {
      return { ...system, connectionStatus: "not_monitored" as const, cutoffMs: null };
    }
    const status = getKeepAliveConnectionStatus({
      lastKeepAliveAt: system.lastKeepAliveAt,
      intervals: intervalsBySystem.get(system.id),
      configuredOfflineAfterMinutes: system.keepAliveOfflineAfterMinutes,
      now: referenceTime,
    });
    return { ...system, ...status };
  });
}

export async function recordSystemKeepAlive(systemId: number, receivedAt = new Date()) {
  const db = await getDb();
  if (!db) return undefined;
  const [system] = await db.select().from(alarmSystems).where(eq(alarmSystems.id, systemId)).limit(1);
  if (!system) return undefined;

  // Outros eventos podem atualizar lastCommunication. A frequência de supervisão
  // deve considerar exclusivamente o sinal Keep Alive anterior da mesma central.
  const measurement = measureKeepAlive(system.lastKeepAliveAt, receivedAt);
  await db.update(alarmSystems).set({
    isOnline: true,
    lastCommunication: receivedAt,
    lastKeepAliveAt: receivedAt,
    lastKeepAliveIntervalMs: measurement.intervalMs,
  }).where(eq(alarmSystems.id, systemId));
  await db.insert(systemKeepAliveSamples).values({
    alarmSystemId: systemId,
    brand: system.brand,
    receivedAt,
    intervalMs: measurement.intervalMs,
  });
  await markDisconnectAlertsRestored(systemId, receivedAt);
  return measurement;
}

export type KeepAliveDisconnectOpening = {
  id: number;
  incidentId: number;
  alarmSystemId: number;
  account: string;
  brand: string;
  eventCode: string;
  qualifier: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  receiverPort: number | null;
  receivedAt: Date;
};

function isDuplicateKeyError(error: unknown) {
  const code = (error as { code?: string } | undefined)?.code;
  return code === "ER_DUP_ENTRY";
}

/**
 * Cria apenas uma ocorrência por período contínuo sem Keep Alive. A chave única
 * combina sistema e o último sinal recebido, portanto qualquer novo Keep Alive
 * reinicia a janela e permite uma futura queda legítima sem somar períodos.
 */
export async function sweepKeepAliveDisconnects(referenceTime = new Date()) {
  const db = await getDb();
  if (!db) return { opened: [] as KeepAliveDisconnectOpening[], skipped: 0 };

  const systems = await listSystemsConnectionStatus(referenceTime);
  return processKeepAliveDisconnectCandidates<KeepAliveDisconnectOpening>({
    systems: systems as KeepAliveDisconnectCandidate[],
    isInMaintenance: (system) => isSystemInMaintenance({
      maintenanceStartAt: system.maintenanceStartAt,
      maintenanceEndAt: system.maintenanceEndAt,
    }, referenceTime),
    openOnce: async (system) => {
    const lastKeepAliveAt = new Date(system.lastKeepAliveAt);
    const description = "Painel desconectado — prazo de Keep Alive excedido";
    const notes = `Sem Keep Alive desde ${lastKeepAliveAt.toLocaleString("pt-BR")}. Prazo configurado: ${system.keepAliveOfflineAfterMinutes || Math.round((system.cutoffMs || 0) / 60_000)} minuto(s). Aguardando tratamento do operador.`;

    try {
      const opening = await db.transaction(async (tx) => {
        // A reserva vem antes do evento. Caso outro disparo concorrente já tenha
        // criado a mesma ocorrência, a chave única interrompe esta transação.
        const claim = await tx.insert(systemDisconnectAlerts).values({
          alarmSystemId: system.id,
          outageStartedAt: lastKeepAliveAt,
          detectedAt: referenceTime,
        });
        const alertId = Number(claim[0].insertId);
        const eventResult = await tx.insert(alarmEvents).values({
          alarmSystemId: system.id,
          account: system.account,
          brand: system.brand,
          qualifier: "E",
          eventCode: "KOFF",
          description,
          priority: "high",
          receiverPort: system.receiverPort || null,
          remoteIp: "SYSTEM",
          rawData: `KEEP_ALIVE_TIMEOUT|last=${lastKeepAliveAt.toISOString()}|cutoffMs=${system.cutoffMs || 0}`,
          receivedAt: referenceTime,
        });
        const eventId = Number(eventResult[0].insertId);
        const incidentResult = await tx.insert(incidents).values({
          eventId,
          alarmSystemId: system.id,
          clientId: system.clientId,
          status: "waiting",
          priority: "high",
          notes,
        });
        const incidentId = Number(incidentResult[0].insertId);
        await tx.update(systemDisconnectAlerts).set({ eventId, incidentId }).where(eq(systemDisconnectAlerts.id, alertId));
        return {
          id: eventId,
          incidentId,
          alarmSystemId: system.id,
          account: system.account,
          brand: system.brand,
          eventCode: "KOFF",
          qualifier: "E",
          description,
          priority: "high" as const,
          receiverPort: system.receiverPort || null,
          receivedAt: referenceTime,
        };
      });
      return opening;
    } catch (error) {
      if (isDuplicateKeyError(error)) return null;
      throw error;
    }
    },
  });
}

/** O retorno do Keep Alive não apaga o histórico: transfere a ocorrência de desconexão para Observação. */
export async function markDisconnectAlertsRestored(systemId: number, receivedAt = new Date()) {
  const db = await getDb();
  if (!db) return 0;
  const activeAlerts = await db.select().from(systemDisconnectAlerts).where(and(
    eq(systemDisconnectAlerts.alarmSystemId, systemId),
    sql`${systemDisconnectAlerts.restoredAt} IS NULL`,
  ));
  if (activeAlerts.length === 0) return 0;

  const message = `Keep Alive restabelecido em ${receivedAt.toLocaleString("pt-BR")}. Ocorrência em observação, aguardando finalização do operador.`;
  return restoreKeepAliveDisconnectAlerts({
    alerts: activeAlerts,
    markRestored: async (alertId) => {
      await db.update(systemDisconnectAlerts).set({ restoredAt: receivedAt, restoredKeepAliveAt: receivedAt }).where(eq(systemDisconnectAlerts.id, alertId));
    },
    moveIncidentToObservation: async (incidentId) => {
      await db.update(incidents).set({
        status: "observing",
        observationUntil: null,
        notes: sql`CONCAT(COALESCE(${incidents.notes}, ''), ${`\n${message}`})`,
      }).where(and(eq(incidents.id, incidentId), ne(incidents.status, "closed")));
    },
  });
}

export async function ensureSystemTechnicalAccount() {
  const db = await getDb();
  if (!db) return undefined;
  const existing = await db.select().from(systemTechnicalAccounts).where(eq(systemTechnicalAccounts.account, "0000")).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(systemTechnicalAccounts).values({
    account: "0000",
    name: "Conta do Sistema",
    description: "Conta técnica para eventos recebidos sem identificação de cliente ou de central cadastrada.",
    isActive: true,
  });
  const created = await db.select().from(systemTechnicalAccounts).where(eq(systemTechnicalAccounts.account, "0000")).limit(1);
  return created[0];
}

function normalizePanelIdentifier(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isJflVersion5OrLater(input: { brand?: string | null; firmwareVersion?: string | null }) {
  return isJflVersion5OrLaterByProfile(input.brand, input.firmwareVersion);
}

export function assertRequiredJflVersion5OrLaterSerial(input: { brand?: string | null; firmwareVersion?: string | null; serialNumber?: string | null }) {
  if (!isJflVersion5OrLater(input)) return;
  if (!/^\d{10}$/.test(input.serialNumber || "")) {
    throw new Error("A central JFL versão 5 ou superior exige o número de série com 10 dígitos");
  }
}

export function assertRequiredPanelIdentifier(input: { brand?: string | null; firmwareVersion?: string | null; macAddress?: string | null; imeiGprs?: string | null; serialNumber?: string | null }) {
  const error = getAlarmSystemIdentifierValidationError(input);
  if (error) throw new Error(error);
}

const ISEP_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function generateIsepId() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = Array.from({ length: 4 }, () => ISEP_CHARS[Math.floor(Math.random() * ISEP_CHARS.length)]).join("");
    const found = await db.select({ id: alarmSystems.id }).from(alarmSystems).where(eq(alarmSystems.isepId, candidate)).limit(1);
    if (!found[0]) return candidate;
  }

  throw new Error("Não foi possível gerar um ID ISEP exclusivo");
}

export async function getAlarmSystemByPanelIdentifier(identifier: string, identifierType: "isep" | "mac" | "imei" | "serial", brand?: string, receiverPort?: number) {
  const db = await getDb();
  if (!db) return undefined;
  const normalized = normalizePanelIdentifier(identifier);
  if (!normalized) return undefined;

  const identifierColumn = identifierType === "isep"
    ? alarmSystems.isepId
    : identifierType === "mac"
      ? alarmSystems.macAddress
      : identifierType === "imei"
        ? alarmSystems.imeiGprs
        : alarmSystems.serialNumber;

  const scopedConditions = [eq(identifierColumn, normalized)];
  if (identifierType === "isep") scopedConditions.push(eq(alarmSystems.brand, "VIAWEB"));
  if (brand) scopedConditions.push(eq(alarmSystems.brand, brand as any));
  if (receiverPort) scopedConditions.push(eq(alarmSystems.receiverPort, receiverPort));
  const scoped = await db.select().from(alarmSystems).where(and(...scopedConditions)).limit(1);
  if (scoped[0]) return scoped[0];

  const fallback = await db.select().from(alarmSystems).where(eq(identifierColumn, normalized)).limit(1);
  return fallback[0];
}

export async function getAlarmSystemByCapturedPanelIdentifier(input: { brand: string; frames: SafeCaptureFrame[] }) {
  const db = await getDb();
  if (!db || input.frames.length === 0) return undefined;

  const systems = await db.select().from(alarmSystems).where(eq(alarmSystems.brand, input.brand as any));
  const candidates = findCapturedPanelCandidates(input.brand, input.frames, systems);
  const candidate = resolveUniqueCapturedPanelCandidate(candidates);
  if (!candidate) return undefined;

  const found = systems.find((system) => system.id === candidate.systemId);
  if (!found) return undefined;

  // A identificação de conexão comprova qual é o painel, mas não substitui o
  // Keep Alive real como fonte de verdade para Online/Offline.
  return { ...found, capturedIdentifier: candidate };
}

export async function getAlarmSystem(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(alarmSystems).where(eq(alarmSystems.id, id)).limit(1);
  return result[0];
}

// ============================================================
// COMANDOS REMOTOS AUDITÁVEIS
// ============================================================
export async function createAlarmRemoteCommand(data: InsertAlarmRemoteCommand) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const result = await db.insert(alarmRemoteCommands).values(data);
  return { id: Number(result[0].insertId) };
}

export async function updateAlarmRemoteCommandDelivery(id: number, data: { status: string; responsePayload?: string | null; executedAt?: Date | null }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.update(alarmRemoteCommands).set(data).where(eq(alarmRemoteCommands.id, id));
}

/**
 * A Compatec abre conexões curtas para reportar identidade e Keep Alive. A
 * primeiro comando de bancada pode ficar aguardando até a próxima conexão
 * identificada; a seleção é restrita à central física que abriu a conexão.
 */
export async function getPendingCompatecBenchQuery(alarmSystemId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({
    id: alarmRemoteCommands.id,
    commandPayload: alarmRemoteCommands.commandPayload,
  }).from(alarmRemoteCommands).where(and(
    eq(alarmRemoteCommands.alarmSystemId, alarmSystemId),
    eq(alarmRemoteCommands.brand, "COMPATEC"),
    inArray(alarmRemoteCommands.commandType, ["query_status", "query_sectors", "disarm"]),
    eq(alarmRemoteCommands.transportMode, "microbus_bench"),
    eq(alarmRemoteCommands.status, "waiting_connection"),
  )).orderBy(alarmRemoteCommands.id).limit(1);
  return result[0];
}

/** A Vetti abre a conexão com a VPS; somente a consulta VSec 0x14 pode aguardar essa sessão. */
export async function getPendingVettiBenchStatusQuery(alarmSystemId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({
    id: alarmRemoteCommands.id,
  }).from(alarmRemoteCommands).where(and(
    eq(alarmRemoteCommands.alarmSystemId, alarmSystemId),
    eq(alarmRemoteCommands.brand, "VETTI"),
    eq(alarmRemoteCommands.commandType, "query_status"),
    eq(alarmRemoteCommands.transportMode, "vsec_bench"),
    eq(alarmRemoteCommands.status, "waiting_connection"),
  )).orderBy(alarmRemoteCommands.id).limit(1);
  return result[0];
}

export async function setAlarmSystemRemoteCommandLabEnabled(alarmSystemId: number, enabled: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.update(alarmSystems).set({ remoteCommandLabEnabled: enabled }).where(eq(alarmSystems.id, alarmSystemId));
  return getAlarmRemoteCredentialStatus(alarmSystemId);
}

export async function listAlarmRemoteCommands(alarmSystemId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: alarmRemoteCommands.id,
    incidentId: alarmRemoteCommands.incidentId,
    operatorId: alarmRemoteCommands.operatorId,
    operatorName: users.name,
    commandType: alarmRemoteCommands.commandType,
    transportMode: alarmRemoteCommands.transportMode,
    status: alarmRemoteCommands.status,
    partition: alarmRemoteCommands.partition,
    zoneNumber: alarmRemoteCommands.zoneNumber,
    pgmNumber: alarmRemoteCommands.pgmNumber,
    reason: alarmRemoteCommands.reason,
    commandPayload: alarmRemoteCommands.commandPayload,
    responsePayload: alarmRemoteCommands.responsePayload,
    confirmedAt: alarmRemoteCommands.confirmedAt,
    executedAt: alarmRemoteCommands.executedAt,
  }).from(alarmRemoteCommands)
    .leftJoin(users, eq(alarmRemoteCommands.operatorId, users.id))
    .where(eq(alarmRemoteCommands.alarmSystemId, alarmSystemId))
    .orderBy(desc(alarmRemoteCommands.id))
    .limit(limit);
}

/** Retorna somente o estado da credencial; o segredo cifrado nunca sai do servidor. */
export async function getAlarmRemoteCredentialStatus(alarmSystemId: number) {
  const db = await getDb();
  if (!db) return { configured: false as const, credentials: [] };
  const credentials = await db.select({
    credentialKind: alarmRemoteCredentials.credentialKind,
    technicalUserCode: alarmRemoteCredentials.technicalUserCode,
    updatedAt: alarmRemoteCredentials.updatedAt,
  }).from(alarmRemoteCredentials).where(eq(alarmRemoteCredentials.alarmSystemId, alarmSystemId));
  const system = await getAlarmSystem(alarmSystemId);
  return { configured: credentials.length > 0, credentials, laboratoryEnabled: Boolean(system?.remoteCommandLabEnabled) };
}

/** Uso exclusivo do transporte físico homologado; o segredo decifrado jamais atravessa a API. */
export async function getAlarmRemoteCredentialForTransport(alarmSystemId: number, credentialKind: "vetti_installer") {
  const db = await getDb();
  if (!db) return undefined;
  const [credential] = await db.select({ encryptedSecret: alarmRemoteCredentials.encryptedSecret })
    .from(alarmRemoteCredentials)
    .where(and(eq(alarmRemoteCredentials.alarmSystemId, alarmSystemId), eq(alarmRemoteCredentials.credentialKind, credentialKind)))
    .limit(1);
  if (!credential?.encryptedSecret) return undefined;
  return decryptRemoteCommandCredential(credential.encryptedSecret);
}

/** Apenas a API administrativa recebe o texto curto, cifra-o e persiste o resultado. */
export async function setAlarmRemoteCredential(input: { alarmSystemId: number; credentialKind: string; credential: string; updatedBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const encryptedSecret = encryptRemoteCommandCredential(input.credential);
  const technicalUserCode = input.credentialKind === "vetti_command_user"
    ? deriveVettiCommandUser(input.credential)
    : null;
  await db.insert(alarmRemoteCredentials).values({
    alarmSystemId: input.alarmSystemId,
    credentialKind: input.credentialKind,
    technicalUserCode,
    encryptedSecret,
    updatedBy: input.updatedBy,
  }).onDuplicateKeyUpdate({
    set: { technicalUserCode, encryptedSecret, updatedBy: input.updatedBy, updatedAt: new Date() },
  });
  return getAlarmRemoteCredentialStatus(input.alarmSystemId);
}

export async function clearAlarmRemoteCredential(input: { alarmSystemId: number; credentialKind: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.delete(alarmRemoteCredentials).where(and(
    eq(alarmRemoteCredentials.alarmSystemId, input.alarmSystemId),
    eq(alarmRemoteCredentials.credentialKind, input.credentialKind),
  ));
  return getAlarmRemoteCredentialStatus(input.alarmSystemId);
}

export async function createAlarmSystem(data: InsertAlarmSystem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const formattedData = prepareAlarmSystemCreatePayload(data);
  const normalizedData: InsertAlarmSystem = {
    ...formattedData,
    model: formattedData.model ? formatRegistrationText(formattedData.model) : null,
    account: normalizePanelIdentifier(data.account),
    macAddress: data.macAddress ? normalizePanelIdentifier(data.macAddress) : null,
    imeiGprs: data.imeiGprs ? normalizePanelIdentifier(data.imeiGprs) : null,
    serialNumber: data.serialNumber ? normalizePanelIdentifier(data.serialNumber) : null,
    isepId: data.brand === "VIAWEB" ? (data.isepId ? normalizePanelIdentifier(data.isepId) : await generateIsepId()) : null,
  };
  assertRequiredJflVersion5OrLaterSerial(normalizedData);
  assertRequiredPanelIdentifier(normalizedData);
  const result = await db.insert(alarmSystems).values(normalizedData);
  return { id: result[0].insertId };
}

export async function updateAlarmSystem(id: number, data: Partial<InsertAlarmSystem>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const current = await getAlarmSystem(id);
  const formattedData = prepareAlarmSystemCreatePayload(data);
  const normalizedData: Partial<InsertAlarmSystem> = {
    ...formattedData,
    ...(formattedData.model !== undefined ? { model: formattedData.model ? formatRegistrationText(formattedData.model) : null } : {}),
    ...(data.account !== undefined ? { account: normalizePanelIdentifier(data.account) } : {}),
    ...(data.macAddress !== undefined ? { macAddress: data.macAddress ? normalizePanelIdentifier(data.macAddress) : null } : {}),
    ...(data.imeiGprs !== undefined ? { imeiGprs: data.imeiGprs ? normalizePanelIdentifier(data.imeiGprs) : null } : {}),
    ...(data.serialNumber !== undefined ? { serialNumber: data.serialNumber ? normalizePanelIdentifier(data.serialNumber) : null } : {}),
  };
  const effectiveBrand = normalizedData.brand || current?.brand;
  assertRequiredJflVersion5OrLaterSerial({
    brand: effectiveBrand,
    firmwareVersion: normalizedData.firmwareVersion ?? current?.firmwareVersion,
    serialNumber: normalizedData.serialNumber ?? current?.serialNumber,
  });
  assertRequiredPanelIdentifier({
    brand: effectiveBrand,
    firmwareVersion: normalizedData.firmwareVersion ?? current?.firmwareVersion,
    macAddress: normalizedData.macAddress ?? current?.macAddress,
    imeiGprs: normalizedData.imeiGprs ?? current?.imeiGprs,
    serialNumber: normalizedData.serialNumber ?? current?.serialNumber,
  });
  if (effectiveBrand === "VIAWEB" && !current?.isepId && !normalizedData.isepId) normalizedData.isepId = await generateIsepId();
  if (effectiveBrand !== "VIAWEB") normalizedData.isepId = null;
  await db.update(alarmSystems).set(normalizedData).where(eq(alarmSystems.id, id));
}

// ============================================================
// ALARM ZONES
// ============================================================
export async function listAlarmZones(alarmSystemId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(alarmZones).where(eq(alarmZones.alarmSystemId, alarmSystemId)).orderBy(alarmZones.zoneNumber);
}

export async function createAlarmZone(data: InsertAlarmZone) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(alarmZones).values(formatRegistrationFields(data, ["name"]));
  return { id: result[0].insertId };
}

// ============================================================
// ALARM USERS
// ============================================================
export async function listAlarmUsers(alarmSystemId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(alarmUsers).where(eq(alarmUsers.alarmSystemId, alarmSystemId)).orderBy(alarmUsers.userNumber);
}

export async function createAlarmUser(data: InsertAlarmUser) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalizedData = formatRegistrationFields(data, ["name"]);
  const result = await db.insert(alarmUsers).values(normalizedData);
  const insertedId = Number(result[0].insertId);
  const [saved] = await db.select().from(alarmUsers).where(eq(alarmUsers.id, insertedId)).limit(1);
  return verifyPersistedAlarmUser(saved, {
    alarmSystemId: normalizedData.alarmSystemId,
    userNumber: normalizedData.userNumber,
    name: normalizedData.name,
    password: normalizedData.password,
    counterPassword: normalizedData.counterPassword,
    coercionPassword: normalizedData.coercionPassword,
  });
}

// ============================================================
// CAMERAS
// ============================================================
export async function listCameras(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cameras).where(eq(cameras.clientId, clientId));
}

export async function createCamera(data: InsertCamera) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(cameras).values(formatRegistrationFields(data, ["name", "location"]));
  return { id: result[0].insertId };
}

export async function updateCamera(id: number, data: Partial<InsertCamera>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(cameras).set(formatRegistrationFields(data, ["name", "location"])).where(eq(cameras.id, id));
}

/** Padroniza registros antigos de forma idempotente, sem tocar em códigos e identificadores técnicos. */
export async function normalizeExistingRegistrationText() {
  const db = await getDb();
  if (!db) return 0;

  const sources: Array<{ table: any; fields: string[] }> = [
    { table: managingCompanies, fields: ["name", "address", "city"] },
    { table: partnerCompanies, fields: ["name", "address", "city"] },
    { table: tacticalMobiles, fields: ["name", "vehicle"] },
    { table: clients, fields: ["name", "fantasyName", "address", "complement", "neighborhood", "city"] },
    { table: clientContacts, fields: ["name", "role"] },
    { table: alarmSystems, fields: ["model"] },
    { table: alarmZones, fields: ["name"] },
    { table: alarmUsers, fields: ["name"] },
    { table: cameras, fields: ["name", "location"] },
    { table: alarmPgms, fields: ["name"] },
    { table: alarmSchedules, fields: ["name"] },
    { table: clientProcedures, fields: ["title"] },
    { table: partnerHolidays, fields: ["name"] },
    { table: users, fields: ["name"] },
    { table: finalizations, fields: ["title"] },
  ];

  let updated = 0;
  for (const source of sources) {
    const rows = await db.select().from(source.table);
    for (const row of rows as Array<Record<string, unknown>>) {
      const changes: Record<string, string> = {};
      for (const field of source.fields) {
        const current = row[field];
        if (typeof current !== "string") continue;
        const normalized = formatRegistrationText(current) ?? current;
        if (normalized !== current) changes[field] = normalized;
      }
      if (Object.keys(changes).length > 0) {
        await db.update(source.table).set(changes).where(eq(source.table.id, row.id as number));
        updated += 1;
      }
    }
  }

  return updated;
}

// ============================================================
// ALARM EVENTS
// ============================================================
export async function createAlarmEvent(data: InsertAlarmEvent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(alarmEvents).values(data);
  return { id: result[0].insertId };
}

/**
 * Um evento que precisa de atendimento só pode ser exibido depois que o evento
 * e o incidente foram gravados juntos. Assim, reinício ou troca de usuário não
 * transforma uma ocorrência aberta em um card apenas temporário do Socket.IO.
 */
export async function createAlarmEventWithOpenIncident(input: {
  event: InsertAlarmEvent;
  incident: Omit<InsertIncident, "eventId">;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  return db.transaction(async (tx) => {
    const eventResult = await tx.insert(alarmEvents).values(input.event);
    const eventId = Number(eventResult[0].insertId);
    const incidentResult = await tx.insert(incidents).values({ ...input.incident, eventId });
    return { eventId, incidentId: Number(incidentResult[0].insertId) };
  });
}

export async function listAlarmEvents(limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(alarmEvents).orderBy(desc(alarmEvents.receivedAt)).limit(limit).offset(offset);
}

export async function listOperationalEventReport(opts?: {
  limit?: number; offset?: number; account?: string; clientId?: number; partnerCompanyId?: number;
  dateFrom?: string; dateTo?: string; eventGroup?: EventReportGroup;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts?.account?.trim()) conditions.push(like(alarmEvents.account, `%${opts.account.trim()}%`));
  if (opts?.dateFrom) conditions.push(gte(alarmEvents.receivedAt, new Date(`${opts.dateFrom}T00:00:00`)));
  if (opts?.dateTo) conditions.push(lte(alarmEvents.receivedAt, new Date(`${opts.dateTo}T23:59:59.999`)));
  let query = db.select().from(alarmEvents);
  if (conditions.length) query = query.where(and(...conditions)) as any;
  query = query.orderBy(desc(alarmEvents.receivedAt)) as any;
  const eventRows = await query;
  const systemIds = Array.from(new Set(eventRows.map((row: any) => row.alarmSystemId).filter((id: unknown): id is number => typeof id === "number")));
  const systems = systemIds.length ? await db.select().from(alarmSystems).where(inArray(alarmSystems.id, systemIds)) : [];
  const clientIds = Array.from(new Set(systems.map((system: any) => system.clientId).filter((id: unknown): id is number => typeof id === "number")));
  const reportClients = clientIds.length ? await db.select().from(clients).where(inArray(clients.id, clientIds)) : [];
  const codes = await db.select().from(contactIdCodes);
  const systemsById = new Map(systems.map((system: any) => [system.id, system]));
  const clientsById = new Map(reportClients.map((client: any) => [client.id, client]));
  const enriched = eventRows.map((event: any) => {
    const system = event.alarmSystemId ? systemsById.get(event.alarmSystemId) : undefined;
    const client = system?.clientId ? clientsById.get(system.clientId) : undefined;
    const category = resolveOperationalEventCategory(event, codes);
    return {
      ...event,
      category,
      clientId: system?.clientId || null,
      clientName: client?.fantasyName || client?.name || (event.account === "0000" ? "Conta do Sistema" : null),
      partnerCompanyId: client?.partnerCompanyId || null,
    };
  });
  const scoped = enriched.filter((event: any) =>
    (!opts?.clientId || event.clientId === opts.clientId)
    && (!opts?.partnerCompanyId || event.partnerCompanyId === opts.partnerCompanyId)
    && matchesOperationalEventGroup(event, event.category, opts?.eventGroup),
  );
  const offset = opts?.offset || 0;
  const limit = opts?.limit || 100;
  return scoped.slice(offset, offset + limit);
}

export async function listOperationalConnectionReport(opts?: { clientId?: number; partnerCompanyId?: number; status?: "online" | "offline" }) {
  const systems = await listSystemsConnectionStatus();
  const db = await getDb();
  if (!db) return [];
  const clientIds = Array.from(new Set(systems.map((system: any) => system.clientId).filter((id: unknown): id is number => typeof id === "number")));
  const reportClients = clientIds.length ? await db.select().from(clients).where(inArray(clients.id, clientIds)) : [];
  const clientsById = new Map(reportClients.map((client: any) => [client.id, client]));
  return systems.map((system: any) => {
    const client = system.clientId ? clientsById.get(system.clientId) : undefined;
    return { ...system, clientName: client?.fantasyName || client?.name || null, partnerCompanyId: client?.partnerCompanyId || null };
  }).filter((system: any) =>
    (!opts?.clientId || system.clientId === opts.clientId)
    && (!opts?.partnerCompanyId || system.partnerCompanyId === opts.partnerCompanyId)
    && (!opts?.status || system.connectionStatus === opts.status),
  );
}

export async function getRecentEvents(minutes = 5) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - minutes * 60 * 1000);
  return db.select().from(alarmEvents).where(sql`${alarmEvents.receivedAt} >= ${since}`).orderBy(desc(alarmEvents.receivedAt));
}

// ============================================================
// INCIDENTS
// ============================================================
export async function createIncident(data: InsertIncident) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(incidents).values(data);
  return { id: result[0].insertId };
}

export async function listIncidents(status?: string) {
  const db = await getDb();
  if (!db) return [];
  if (status) {
    return db.select().from(incidents).where(eq(incidents.status, status as any)).orderBy(desc(incidents.createdAt));
  }
  return db.select().from(incidents).orderBy(desc(incidents.createdAt)).limit(100);
}

export async function listOpenQueueEvents() {
  const db = await getDb();
  if (!db) return [];
  const now = getMaintenanceOperationalNow();

  const expiredMaintenances = await db.select({ id: alarmSystems.id })
    .from(alarmSystems)
    .where(lte(alarmSystems.maintenanceEndAt, now));
  const expiredMaintenanceIds = expiredMaintenances.map((system) => system.id);
  if (expiredMaintenanceIds.length > 0) {
    await db.update(alarmSystems).set({
      maintenanceStartAt: null,
      maintenanceEndAt: null,
      maintenanceNotes: null,
      maintenanceOperatorId: null,
    }).where(inArray(alarmSystems.id, expiredMaintenanceIds));
    await db.update(incidents).set({
      status: "attending",
      notes: sql`CONCAT(COALESCE(${incidents.notes}, ''), '\nPeríodo de manutenção encerrado. Ocorrência retornada para atendimento.')`,
    }).where(and(eq(incidents.status, "maintenance"), inArray(incidents.alarmSystemId, expiredMaintenanceIds)));
  }

  const activeMaintenances = await db.select({
    id: alarmSystems.id,
    maintenanceEndAt: alarmSystems.maintenanceEndAt,
    maintenanceNotes: alarmSystems.maintenanceNotes,
  }).from(alarmSystems).where(and(
    lte(alarmSystems.maintenanceStartAt, now),
    gte(alarmSystems.maintenanceEndAt, now),
  ));
  for (const maintenance of activeMaintenances) {
    if (!maintenance.maintenanceEndAt) continue;
    await ensureMaintenanceIncident({
      systemId: maintenance.id,
      endAt: maintenance.maintenanceEndAt,
      notes: maintenance.maintenanceNotes || `Sistema em manutenção até ${maintenance.maintenanceEndAt.toLocaleString("pt-BR")}`,
    });
  }

  await db.update(incidents).set({
    status: "attending",
    observationUntil: null,
    notes: sql`CONCAT(COALESCE(${incidents.notes}, ''), '\nPrazo de observação encerrado. Ocorrência retornada para atendimento.')`,
  }).where(and(eq(incidents.status, "observing"), lte(incidents.observationUntil, now)));

  const rows = await db
    .select({ incident: incidents, event: alarmEvents })
    .from(incidents)
    .innerJoin(alarmEvents, eq(incidents.eventId, alarmEvents.id))
    .where(inArray(incidents.status, ["waiting", "attending", "observing", "dispatched", "maintenance"]))
    .orderBy(desc(alarmEvents.receivedAt));
  return rows.map(({ incident, event }) => ({
    ...event,
    incidentId: incident.id,
    incidentStatus: incident.status,
    incidentClientId: incident.clientId,
    incidentSystemId: incident.alarmSystemId,
    incidentOperatorId: incident.operatorId,
    incidentNotes: incident.notes,
    observationUntil: incident.observationUntil,
  }));
}

export async function putIncidentInObservation(input: { incidentId: number; until: Date; notes?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (input.until <= new Date()) throw new Error("Informe uma data e hora futura para a observação");
  await db.update(incidents).set({
    status: "observing",
    observationUntil: input.until,
    notes: input.notes || "Ocorrência colocada em observação",
  }).where(eq(incidents.id, input.incidentId));
}

export async function putIncidentInMaintenance(input: { incidentId: number; endAt: Date; notes?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.update(incidents).set({
    status: "maintenance",
    notes: input.notes || `Sistema em manutenção até ${input.endAt.toLocaleString("pt-BR")}`,
  }).where(eq(incidents.id, input.incidentId));
}

export async function putSystemIncidentsInMaintenance(input: { systemId: number; endAt: Date; notes?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.update(incidents).set({
    status: "maintenance",
    observationUntil: null,
    notes: input.notes || `Sistema em manutenção até ${input.endAt.toLocaleString("pt-BR")}`,
  }).where(and(
    eq(incidents.alarmSystemId, input.systemId),
    inArray(incidents.status, ["waiting", "attending", "observing", "dispatched", "maintenance"]),
  ));
}

export async function ensureMaintenanceIncident(input: { systemId: number; endAt: Date; notes: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const existing = await db.select({ id: incidents.id }).from(incidents).where(and(
    eq(incidents.alarmSystemId, input.systemId),
    eq(incidents.status, "maintenance"),
  )).limit(1);
  if (existing[0]) return existing[0];

  const system = (await db.select().from(alarmSystems).where(eq(alarmSystems.id, input.systemId)).limit(1))[0];
  if (!system) throw new Error("Sistema de alarme não encontrado");
  const saved = await createAlarmEventWithOpenIncident({
    event: {
      alarmSystemId: system.id,
      account: system.account,
      brand: system.brand,
      qualifier: "E",
      eventCode: "MAINTENANCE",
      description: "Sistema em manutenção",
      priority: "low",
      receiverPort: system.receiverPort || null,
      remoteIp: "SYSTEM",
      rawData: `Manutenção operacional até ${input.endAt.toISOString()}`,
    },
    incident: {
      alarmSystemId: system.id,
      clientId: system.clientId,
      status: "maintenance",
      priority: "low",
      notes: input.notes,
    },
  });
  return { id: saved.incidentId };
}

export async function releaseMaintenanceIncidents(systemId: number, message: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.update(incidents).set({
    status: "attending",
    notes: sql`CONCAT(COALESCE(${incidents.notes}, ''), ${`\n${message}`})`,
  }).where(and(eq(incidents.status, "maintenance"), eq(incidents.alarmSystemId, systemId)));
}

export async function updateIncident(id: number, data: Partial<InsertIncident>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(incidents).set(data).where(eq(incidents.id, id));
}

export async function getIncident(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
  return result[0];
}

export async function createAutomaticIncident(data: { eventId: number; alarmSystemId?: number | null; clientId?: number | null; priority: "critical" | "high" | "medium" | "low" }) {
  return createIncident({
    eventId: data.eventId,
    alarmSystemId: data.alarmSystemId || null,
    clientId: data.clientId || null,
    status: "waiting",
    priority: data.priority,
    notes: "Aguardando tratamento automático por restauração",
  });
}

export async function findIncidentForRestoration(input: { alarmSystemId?: number | null; account: string; restorationCode: string }) {
  const db = await getDb();
  if (!db) return undefined;

  const candidates = await db
    .select({ incident: incidents, event: alarmEvents })
    .from(incidents)
    .innerJoin(alarmEvents, eq(incidents.eventId, alarmEvents.id))
    .where(and(
      eq(alarmEvents.account, input.account),
      input.alarmSystemId ? eq(incidents.alarmSystemId, input.alarmSystemId) : sql`1=1`,
      inArray(incidents.status, ["waiting", "attending", "observing", "dispatched"]),
    ))
    .orderBy(desc(incidents.createdAt));

  for (const candidate of candidates) {
    const config = await getContactIdDescription(candidate.event.eventCode, candidate.event.qualifier);
    if (config?.fechaComRestauracao && (config.codigoRestauracao === input.restorationCode || candidate.event.eventCode === input.restorationCode)) {
      return candidate;
    }
  }
  return undefined;
}

export async function finalizeIncidentWithRestoration(input: { incident: typeof incidents.$inferSelect; event: typeof alarmEvents.$inferSelect }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const message = "Finalizado com a restauração do evento";
  const finalizedAt = new Date();
  await db.update(incidents).set({ status: "closed", resolution: message, closedAt: finalizedAt }).where(eq(incidents.id, input.incident.id));
  return createOccurrence({
    account: input.event.account,
    eventCode: input.event.eventCode,
    qualifier: input.event.qualifier,
    partition: input.event.partition,
    zoneUser: input.event.zoneUser,
    description: input.event.description,
    priority: input.event.priority,
    brand: input.event.brand,
    clientId: input.incident.clientId || null,
    systemId: input.incident.alarmSystemId || null,
    operatorName: "Sistema",
    observations: message,
    logs: JSON.stringify([`[${finalizedAt.toLocaleTimeString("pt-BR")}] ${message}`]),
    attendingTimeMs: input.incident.createdAt ? Math.max(0, finalizedAt.getTime() - input.incident.createdAt.getTime()) : 0,
    eventReceivedAt: input.event.receivedAt,
    finalizedAt,
  });
}

// ============================================================
// CONTACT ID CODES
// ============================================================
export async function getContactIdDescription(code: string, qualifier?: string, fabricante?: string) {
  const db = await getDb();
  if (!db) return undefined;
  // O código do fabricante identificado tem prioridade sobre o universal.
  // Isso evita que, por exemplo, uma descrição JFL seja substituída por outra
  // central que use o mesmo número Contact ID.
  if (qualifier && fabricante) {
    const manufacturerResult = await db.select().from(contactIdCodes).where(
      and(
        eq(contactIdCodes.code, code),
        eq(contactIdCodes.qualifier, qualifier as any),
        eq(contactIdCodes.fabricante, fabricante),
      )
    ).limit(1);
    if (manufacturerResult.length > 0) return manufacturerResult[0];

    const universalResult = await db.select().from(contactIdCodes).where(
      and(
        eq(contactIdCodes.code, code),
        eq(contactIdCodes.qualifier, qualifier as any),
        eq(contactIdCodes.isUniversal, true),
      )
    ).limit(1);
    if (universalResult.length > 0) return universalResult[0];
  }
  // Mantém a compatibilidade com as consultas administrativas sem fabricante.
  if (qualifier) {
    const result = await db.select().from(contactIdCodes).where(
      and(eq(contactIdCodes.code, code), eq(contactIdCodes.qualifier, qualifier as any))
    ).limit(1);
    if (result.length > 0) return result[0];
  }
  // Fallback: buscar qualquer um com esse código
  const result = await db.select().from(contactIdCodes).where(eq(contactIdCodes.code, code)).limit(1);
  return result[0];
}

export async function listContactIdCodes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contactIdCodes).orderBy(contactIdCodes.code);
}

// ============================================================
// DASHBOARD STATS
// ============================================================
export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return { activeConnections: 0, pendingEvents: 0, eventsPerMin: 0, totalClients: 0 };

  const [pendingResult] = await db.select({ count: sql<number>`count(*)` }).from(incidents).where(eq(incidents.status, 'waiting'));
  const [clientsResult] = await db.select({ count: sql<number>`count(*)` }).from(clients).where(eq(clients.isActive, true));
  const connectionSystems = await listSystemsConnectionStatus();

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const [eventsResult] = await db.select({ count: sql<number>`count(*)` }).from(alarmEvents).where(sql`${alarmEvents.receivedAt} >= ${fiveMinAgo}`);

  return {
    activeConnections: connectionSystems.filter((system) => system.connectionStatus === "online").length,
    pendingEvents: pendingResult?.count ?? 0,
    eventsPerMin: Math.round((eventsResult?.count ?? 0) / 5),
    totalClients: clientsResult?.count ?? 0,
  };
}

// ============================================================
// PGMs
// ============================================================
export async function listAlarmPgms(alarmSystemId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(alarmPgms).where(eq(alarmPgms.alarmSystemId, alarmSystemId)).orderBy(alarmPgms.pgmNumber);
}

export async function createAlarmPgm(data: InsertAlarmPgm) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(alarmPgms).values(formatRegistrationFields(data, ["name"]));
  return { id: result[0].insertId };
}

// ============================================================
// ALARM SCHEDULES
// ============================================================
export async function listAlarmSchedules(alarmSystemId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(alarmSchedules).where(eq(alarmSchedules.alarmSystemId, alarmSystemId));
}

export async function createAlarmSchedule(data: InsertAlarmSchedule) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(alarmSchedules).values(formatRegistrationFields(data, ["name"]));
  return { id: result[0].insertId };
}

export async function updateAlarmSchedule(id: number, data: Partial<InsertAlarmSchedule>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(alarmSchedules).set(formatRegistrationFields(data, ["name"])).where(eq(alarmSchedules.id, id));
}

// ============================================================
// CLIENT PROCEDURES
// ============================================================
export async function listClientProcedures(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clientProcedures).where(eq(clientProcedures.clientId, clientId)).orderBy(clientProcedures.priority);
}

export async function createClientProcedure(data: InsertClientProcedure) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clientProcedures).values(prepareClientProcedurePayload(data));
  return { id: result[0].insertId };
}

// ============================================================
// PARTNER HOLIDAYS
// ============================================================
export async function listPartnerHolidays(partnerCompanyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(partnerHolidays).where(eq(partnerHolidays.partnerCompanyId, partnerCompanyId)).orderBy(partnerHolidays.date);
}

export async function createPartnerHoliday(data: InsertPartnerHoliday) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(partnerHolidays).values(formatRegistrationFields(data, ["name"]));
  return { id: result[0].insertId };
}

export async function deletePartnerHoliday(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(partnerHolidays).where(eq(partnerHolidays.id, id));
}

export async function updatePartnerHoliday(id: number, data: Partial<InsertPartnerHoliday>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(partnerHolidays).set(formatRegistrationFields(data, ["name"])).where(eq(partnerHolidays.id, id));
}

// ============================================================
// OCORRÊNCIAS FINALIZADAS
// ============================================================
export async function createOccurrence(data: InsertOccurrence) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(occurrences).values(data);
  return { id: result[0].insertId };
}

/** Fecha a ocorrência somente quando o relatório foi gravado com sucesso. */
export async function createOccurrenceAndCloseIncident(incidentId: number, occurrence: InsertOccurrence) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    const current = await tx.select({ status: incidents.status }).from(incidents).where(eq(incidents.id, incidentId)).limit(1);
    if (!current[0]) throw new Error("Ocorrência aberta não encontrada");
    if (current[0].status === "closed") throw new Error("Ocorrência já está finalizada");
    const reportResult = await tx.insert(occurrences).values(occurrence);
    const reportId = Number(reportResult[0].insertId);
    if (!canCloseIncidentAfterReport(reportId)) throw new Error("Relatório não foi persistido; ocorrência permanece aberta");
    await tx.update(incidents).set({
      status: "closed",
      resolution: occurrence.observations || "Finalizada pelo operador",
      closedAt: new Date(),
    }).where(eq(incidents.id, incidentId));
    return { id: reportId };
  });
}

export async function listOccurrences(opts?: { limit?: number; offset?: number; account?: string; clientId?: number; partnerCompanyId?: number; dateFrom?: string; dateTo?: string; operatorName?: string }) {
  const db = await getDb();
  if (!db) return [];
  return listOccurrencesWithDb(db, opts);
}

export async function listOccurrencesWithDb(db: any, opts?: { limit?: number; offset?: number; account?: string; clientId?: number; partnerCompanyId?: number; dateFrom?: string; dateTo?: string; operatorName?: string }) {
  const conditions = [];
  if (opts?.account?.trim()) conditions.push(like(occurrences.account, `%${opts.account.trim()}%`));
  if (opts?.operatorName?.trim()) conditions.push(like(occurrences.operatorName, `%${opts.operatorName.trim()}%`));
  if (opts?.dateFrom) conditions.push(gte(occurrences.finalizedAt, new Date(`${opts.dateFrom}T00:00:00`)));
  if (opts?.dateTo) conditions.push(lte(occurrences.finalizedAt, new Date(`${opts.dateTo}T23:59:59.999`)));
  let query = db.select().from(occurrences);
  if (conditions.length) query = query.where(and(...conditions)) as any;
  query = query.orderBy(desc(occurrences.finalizedAt)) as any;
  const rows = await query;
  const systemIds: number[] = Array.from(new Set(
    rows.map((row: any) => row.systemId).filter((id: unknown): id is number => typeof id === "number"),
  ));
  const directClientIds: number[] = rows
    .map((row: any) => row.clientId)
    .filter((id: unknown): id is number => typeof id === "number");
  const systems = systemIds.length
    ? await db.select().from(alarmSystems).where(inArray(alarmSystems.id, systemIds))
    : [];
  const systemClientIds: number[] = systems
    .map((system: { clientId: number | null }) => system.clientId)
    .filter((id: number | null): id is number => typeof id === "number");
  const clientIds: number[] = Array.from(new Set([
    ...directClientIds,
    ...systemClientIds,
  ]));
  const reportClients = clientIds.length
    ? await db.select().from(clients).where(inArray(clients.id, clientIds))
    : [];

  const enrichedRows = enrichOccurrenceReportClients(rows, systems, reportClients);
  const clientFilteredRows = opts?.clientId
    ? enrichedRows.filter((row) => row.clientId === opts.clientId)
    : enrichedRows;
  const scopedRows = filterOccurrenceReportRowsByPartner(clientFilteredRows, opts?.partnerCompanyId);
  const offset = opts?.offset || 0;
  const limit = opts?.limit || 100;
  return scopedRows.slice(offset, offset + limit);
}

export async function getOccurrenceById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(occurrences).where(eq(occurrences.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

// ===== FERIADOS DA EMPRESA GESTORA =====
export async function listManagingHolidays(managingCompanyId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(managingHolidays).where(eq(managingHolidays.managingCompanyId, managingCompanyId)).orderBy(managingHolidays.date);
}

export async function createManagingHoliday(data: InsertManagingHoliday) {
  const db = await getDb(); if (!db) return;
  const result = await db.insert(managingHolidays).values(data);
  return { id: result[0].insertId };
}

export async function deleteManagingHoliday(id: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(managingHolidays).where(eq(managingHolidays.id, id));
}

// ===== DELETE FUNCTIONS =====
export async function deleteClientContact(id: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(clientContacts).where(eq(clientContacts.id, id));
}

export async function updateAlarmZone(id: number, data: Partial<InsertAlarmZone>) {
  const db = await getDb(); if (!db) return;
  await db.update(alarmZones).set(formatRegistrationFields(data, ["name"])).where(eq(alarmZones.id, id));
}

export async function deleteAlarmZone(id: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(alarmZones).where(eq(alarmZones.id, id));
}

export async function updateAlarmUser(id: number, data: Partial<InsertAlarmUser>) {
  const db = await getDb(); if (!db) return;
  await db.update(alarmUsers).set(formatRegistrationFields(data, ["name"])).where(eq(alarmUsers.id, id));
}

export async function deleteAlarmUser(id: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(alarmUsers).where(eq(alarmUsers.id, id));
}

export async function deleteCamera(id: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(cameras).where(eq(cameras.id, id));
}

export async function deletePartnerCompany(id: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(registrationDocuments).where(and(eq(registrationDocuments.ownerType, "partner"), eq(registrationDocuments.ownerId, id)));
  await db.delete(partnerCompanies).where(eq(partnerCompanies.id, id));
}

export async function deleteClient(id: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(registrationDocuments).where(and(eq(registrationDocuments.ownerType, "client"), eq(registrationDocuments.ownerId, id)));
  await db.delete(clients).where(eq(clients.id, id));
}

export async function deleteAlarmSystem(id: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(alarmSystems).where(eq(alarmSystems.id, id));
}

export async function listContactIdByFabricante(fabricante: string) {
  const db = await getDb();
  if (!db) return [];
  // Retorna códigos do fabricante + códigos universais
  const result = await db.select().from(contactIdCodes).where(
    sql`${contactIdCodes.fabricante} = ${fabricante} OR ${contactIdCodes.isUniversal} = 1`
  ).orderBy(contactIdCodes.code);
  return result;
}

export async function createContactId(data: any) {
  const db = await getDb();
  if (!db) return;
  await db.insert(contactIdCodes).values({
    code: data.code,
    qualifier: data.qualifier || 'E',
    fabricante: data.fabricante,
    isUniversal: data.isUniversal || false,
    description: data.description,
    tipo: data.tipo,
    cor: data.cor,
    abreTela: data.abreTela,
    fechaAutomatico: data.fechaAutomatico,
    fechaComRestauracao: data.fechaComRestauracao,
    codigoRestauracao: data.codigoRestauracao,
    tempoEsperaSegundos: data.tempoEsperaSegundos,
    prioridade: data.prioridade,
    category: 'alarm',
  });
}

export async function updateContactId(id: number, data: any) {
  const db = await getDb();
  if (!db) return;
  await db.update(contactIdCodes).set({
    code: data.code,
    qualifier: data.qualifier || 'E',
    fabricante: data.fabricante,
    isUniversal: data.isUniversal || false,
    description: data.description,
    tipo: data.tipo,
    cor: data.cor,
    abreTela: data.abreTela,
    fechaAutomatico: data.fechaAutomatico,
    fechaComRestauracao: data.fechaComRestauracao,
    codigoRestauracao: data.codigoRestauracao,
    tempoEsperaSegundos: data.tempoEsperaSegundos,
    prioridade: data.prioridade,
  }).where(eq(contactIdCodes.id, id));
}

export async function deleteContactId(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(contactIdCodes).where(eq(contactIdCodes.id, id));
}

// ============ SYSTEM USERS ============
export async function listSystemUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function createSystemUser(data: { name: string; email: string; password: string; role: string; partnerId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const values: Record<string, any> = {
    openId,
    name: prepareSystemUserCreatePayload({ name: data.name }).name,
    email: data.email,
    loginMethod: "local",
    role: data.role as any,
    ...(data.partnerId ? { partnerId: data.partnerId } : {}),
  };
  values.password = data.password; // Already hashed
  await db.insert(users).values(values as any);
  return { success: true };
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return null;
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user || null;
}

export async function updateUserLastSignedIn(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() } as any).where(eq(users.id, userId));
}

export async function updateSystemUser(id: number, data: { name?: string; email?: string; password?: string; role?: string; partnerId?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const values = prepareSystemUserCreatePayload(Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== "")));
  if (Object.keys(values).length === 0) return { success: true };
  await db.update(users).set(values as any).where(eq(users.id, id));
  return { success: true };
}

export async function deleteSystemUser(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(users).where(eq(users.id, id));
  return { success: true };
}

// ============================================================
// ARM/DISARM STATUS (Armados/Desarmados)
// ============================================================
export async function getArmDisarmStatus() {
  const db = await getDb();
  if (!db) return { armed: [], disarmed: [] };
  
  // Buscar o último evento de arme/desarme de cada conta
  const armDisarmCodes = ['401', '407', '408', '409', '441', '701'];
  
  const lastEvents = await db.select().from(alarmEvents)
    .where(and(
      inArray(alarmEvents.eventCode, armDisarmCodes),
      ne(alarmEvents.account, "0000"),
      isNotNull(alarmEvents.alarmSystemId),
    ))
    .orderBy(desc(alarmEvents.receivedAt));
  
  const systems = await db.select().from(alarmSystems);
  const systemsById = new Map(systems.map((system) => [system.id, system]));
  const latestStatuses = getLatestArmDisarmStatusBySystem(lastEvents, systems);
  
  const armed: any[] = [];
  const disarmed: any[] = [];

  for (const status of latestStatuses) {
    const { account } = status;
    let clientName = `Conta ${account}`;
    let clientId: number | null = null;
    let systemId = status.alarmSystemId;
    
    if (status.alarmSystemId) {
      const systemInfo = systemsById.get(status.alarmSystemId);
      if (systemInfo?.clientId) {
        const clientInfo = await db.select().from(clients).where(eq(clients.id, systemInfo.clientId)).limit(1);
        if (clientInfo.length > 0) {
          clientName = clientInfo[0].name;
          clientId = clientInfo[0].id;
        }
      }
    }
    
    const entry = {
      account,
      qualifier: status.qualifier,
      lastEvent: status.receivedAt,
      clientName,
      clientId,
      systemId,
    };
    
    if (status.qualifier === 'R') {
      armed.push(entry);
    } else {
      disarmed.push(entry);
    }
  }
  
  return { armed, disarmed };
}

export async function listRecentAutoFinalizedArmDisarmConfirmations(limit = 4) {
  const db = await getDb();
  if (!db) return [];

  const armDisarmCodes = ["401", "407", "408", "409", "441", "701"];
  const rows = await db.select({
    id: alarmEvents.id,
    account: alarmEvents.account,
    brand: alarmEvents.brand,
    qualifier: alarmEvents.qualifier,
    eventCode: alarmEvents.eventCode,
    description: alarmEvents.description,
    receivedAt: alarmEvents.receivedAt,
  }).from(alarmEvents)
    .where(and(
      eq(alarmEvents.autoFinalized, true),
      inArray(alarmEvents.eventCode, armDisarmCodes),
      ne(alarmEvents.account, "0000"),
      isNotNull(alarmEvents.alarmSystemId),
    ))
    .orderBy(desc(alarmEvents.receivedAt))
    .limit(limit);

  return rows.map((event) => ({
    ...event,
    stateLabel: event.qualifier === "R" ? "ARMADO" : "DESARMADO",
  }));
}
// ============================================================
// FINALIZATIONS (textos de finalização automática)
// ============================================================
export async function listFinalizations() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(finalizations).orderBy(finalizations.title);
}

export async function createFinalization(data: InsertFinalization) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(finalizations).values(prepareFinalizationPayload(data));
  return { id: result[0].insertId };
}

export async function updateFinalization(id: number, data: Partial<InsertFinalization>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(finalizations).set(prepareFinalizationPayload(data)).where(eq(finalizations.id, id));
}

export async function deleteFinalization(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(finalizations).where(eq(finalizations.id, id));
}
