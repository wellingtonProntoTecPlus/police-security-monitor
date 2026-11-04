import { eq, and, or, desc, sql, like, inArray, gte, gt, lte, ne, isNotNull, isNull, notExists } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, authSessions,
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
  incidents, InsertIncident, incidentHistory,
  contactIdCodes,
  systemTechnicalAccounts,
  systemKeepAliveSamples,
  systemDisconnectAlerts,
  alarmRemoteCommands, InsertAlarmRemoteCommand,
  alarmRemoteCredentials,
  alarmScheduleOverrides, InsertAlarmScheduleOverride,
  alarmScheduleOverrideAudit,
  alarmScheduleAlerts,
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
import { getLatestArmDisarmStatusBySystem, isArmDisarmStatusEvent, STANDARD_ARM_DISARM_EVENT_CODES } from "./armDisarmStatus";
import { verifyPersistedAlarmUser } from "./alarmUserPersistence";
import { classifyContactIdOperationalEvent, evaluateAlarmSchedule } from "./alarmSchedulePolicy";
import { getScheduleOverrideWindow, type ScheduleOverrideDuration } from "./alarmScheduleOverrideWindow";
import { formatRegistrationFields, formatRegistrationText, normalizeRegistrationPayload } from "./registrationText";
import { validateOptionalBrazilianDocument } from "@shared/documentValidation";
import { getAlarmSystemIdentifierValidationError, isJflVersion5OrLater as isJflVersion5OrLaterByProfile } from "@shared/alarmSystemProfiles";
import { buildAlarmSystemDeletionConfirmation } from "@shared/alarmSystemDeletionConfirmation";
import { prepareAlarmSystemCreatePayload, prepareClientProcedurePayload, prepareFinalizationPayload, prepareSystemUserCreatePayload } from "./registrationCrudPayloads";
import { measureKeepAlive } from "./keepAliveTracking";
import { getKeepAliveConnectionStatus } from "./keepAliveStatus";
import { processKeepAliveDisconnectCandidates, restoreKeepAliveDisconnectAlerts, type KeepAliveDisconnectCandidate } from "./keepAliveDisconnectWorkflow";
import { enrichClientsWithAccounts } from "./clientAccountList";
import { matchesOperationalEventGroup, resolveOperationalEventCategory, type EventReportGroup } from "./operationalEventReport";
import { getPublicBrandingOrNull } from "./publicBrandingFallback";
import { decryptRemoteCommandCredential, encryptRemoteCommandCredential } from "./remoteCommandCredentials";
import { deriveVettiCommandUser } from "@shared/remoteCommandCredentialProfiles";
import { buildRemoteCommandIncidentNotes, buildRemoteCommandOccurrenceText, getRemoteCommandActionLabel, isConfirmedRemoteCommandEventMatch } from "./remoteCommandEventCorrelation";
import { resolveExistingActiveChildAction, resolveIncidentOwnershipAction, type IncidentOwnershipStatus } from "./incidentOwnershipPolicy";
import { canBulkFinalizeIncident } from "@shared/incidentBulkFinalization";
import { isClientMonitoringBlocked } from "@shared/clientMonitoringStatus";

let _db: ReturnType<typeof drizzle> | null = null;
const DB_CONNECT_TIMEOUT_MS = 3_500;

/** Exclusivo para testes: permite validar os payloads persistidos sem depender da conexão externa. */
export function setDbForTesting(db: ReturnType<typeof drizzle> | null) {
  _db = db;
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // O pool evita uma nova conexão por consulta e devolve falha previsível
      // quando o banco/gateway está indisponível, em vez de deixar a interface
      // operacional aguardando indefinidamente.
      _db = drizzle({
        connection: {
          uri: process.env.DATABASE_URL,
          connectTimeout: DB_CONNECT_TIMEOUT_MS,
          waitForConnections: true,
          connectionLimit: 10,
          maxIdle: 4,
          idleTimeout: 60_000,
          queueLimit: 30,
          enableKeepAlive: true,
          keepAliveInitialDelay: 0,
        },
      });
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

export async function replaceActiveAuthSession(userId: number, tokenHash: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível para iniciar sessão");
  return db.transaction(async (tx) => {
    // O lock da linha do usuário serializa logins simultâneos do mesmo operador.
    const userRows = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update").limit(1);
    if (!userRows[0]) throw new Error("Usuário não encontrado para iniciar sessão");
    const previous = await tx.select({ id: authSessions.id }).from(authSessions).where(and(
      eq(authSessions.userId, userId),
      isNull(authSessions.revokedAt),
    ));
    const now = new Date();
    if (previous.length) {
      await tx.update(authSessions).set({ revokedAt: now }).where(and(
        eq(authSessions.userId, userId),
        isNull(authSessions.revokedAt),
      ));
    }
    const inserted = await tx.insert(authSessions).values({ userId, tokenHash, expiresAt, lastSeenAt: now });
    return { sessionId: Number(inserted[0].insertId), revokedSessionIds: previous.map(row => Number(row.id)) };
  });
}

export async function getActiveAuthSessionByTokenHash(tokenHash: string, now = new Date()) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ sessionId: authSessions.id, user: users }).from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(and(
      eq(authSessions.tokenHash, tokenHash),
      isNull(authSessions.revokedAt),
      gt(authSessions.expiresAt, now),
    )).limit(1);
  return rows[0] || null;
}

export async function isAuthSessionActive(sessionId: number, now = new Date()) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ id: authSessions.id }).from(authSessions).where(and(
    eq(authSessions.id, sessionId),
    isNull(authSessions.revokedAt),
    gt(authSessions.expiresAt, now),
  )).limit(1);
  return rows.length > 0;
}

export async function revokeAuthSessionByTokenHash(tokenHash: string) {
  const db = await getDb();
  if (!db) return [];
  return db.transaction(async (tx) => {
    const rows = await tx.select({ id: authSessions.id }).from(authSessions).where(and(
      eq(authSessions.tokenHash, tokenHash),
      isNull(authSessions.revokedAt),
    ));
    if (rows.length) {
      await tx.update(authSessions).set({ revokedAt: new Date() }).where(and(
        eq(authSessions.tokenHash, tokenHash),
        isNull(authSessions.revokedAt),
      ));
    }
    return rows.map(row => Number(row.id));
  });
}

// ============================================================
// MANAGING COMPANIES
// ============================================================
export async function listManagingCompanies() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(managingCompanies).orderBy(managingCompanies.name);
}

export async function getPublicManagingBranding() {
  return getPublicBrandingOrNull(async () => {
    const db = await getDb();
    if (!db) return null;
    const result = await db
      .select({ name: managingCompanies.name, logoUrl: managingCompanies.logoUrl })
      .from(managingCompanies)
      .where(eq(managingCompanies.isActive, true))
      .orderBy(managingCompanies.id)
      .limit(1);
    return result[0] || null;
  }, () => {
    // A marca na página inicial é somente decorativa; nunca bloquear o acesso
    // nem gerar erro de API se o banco estiver temporariamente indisponível.
    console.warn("[Public Branding] Consulta indisponível; usando marca padrão.");
  });
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

/** Perfil mínimo do cliente usado pelo receptor para política e relatório operacional. */
export async function getClientOperationalProfile(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({
    id: clients.id,
    name: clients.name,
    fantasyName: clients.fantasyName,
    partnerCompanyId: clients.partnerCompanyId,
    monitoringStatus: clients.monitoringStatus,
    monitoringStatusReason: clients.monitoringStatusReason,
    monitoringStatusUntil: clients.monitoringStatusUntil,
  }).from(clients).where(eq(clients.id, id)).limit(1);
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
  // A tela operacional não pode contar cadastros desativados como Online ou
  // Offline. Eles continuam disponíveis nos cadastros e relatórios, mas não
  // fazem parte da supervisão em tempo real.
  const systems = (await listAlarmSystems()).filter((system) => system.isActive !== false);
  const db = await getDb();
  if (!db || systems.length === 0) return systems.map((system) => ({ ...system, connectionStatus: "offline" as const, cutoffMs: null }));

  const intervalsBySystem = new Map<number, Array<number | null>>();
  const systemsNeedingAdaptiveCutoff = systems.filter((system) =>
    !(Number.isFinite(system.keepAliveOfflineAfterMinutes) && (system.keepAliveOfflineAfterMinutes || 0) > 0),
  );
  for (let start = 0; start < systemsNeedingAdaptiveCutoff.length; start += 10) {
    const systemBatch = systemsNeedingAdaptiveCutoff.slice(start, start + 10);
    const sampleRows = await Promise.all(systemBatch.map((system) =>
      db.select({ intervalMs: systemKeepAliveSamples.intervalMs })
        .from(systemKeepAliveSamples)
        .where(eq(systemKeepAliveSamples.alarmSystemId, system.id))
        .orderBy(desc(systemKeepAliveSamples.receivedAt))
        .limit(30),
    ));
    systemBatch.forEach((system, index) => {
      intervalsBySystem.set(system.id, sampleRows[index].map((sample: { intervalMs: number | null }) => sample.intervalMs));
    });
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
  const clientIds = Array.from(new Set(systems.map((system) => system.clientId).filter((id): id is number => id != null)));
  const clientProfiles = clientIds.length ? await db.select({
    id: clients.id,
    monitoringStatus: clients.monitoringStatus,
    monitoringStatusUntil: clients.monitoringStatusUntil,
  }).from(clients).where(inArray(clients.id, clientIds)) : [];
  const clientById = new Map(clientProfiles.map((client) => [client.id, client]));
  return processKeepAliveDisconnectCandidates<KeepAliveDisconnectOpening>({
    systems: systems as KeepAliveDisconnectCandidate[],
    isMonitoringBlocked: (system) => isClientMonitoringBlocked(clientById.get(system.clientId || 0), referenceTime),
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

const ISEP_HEX_CHARS = "0123456789ABCDEF";

export function normalizeIsepId(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidIsepId(value: string | null | undefined) {
  return /^[0-9A-F]{4}$/.test(normalizeIsepId(value || ""));
}

function assertValidIsepId(value: string) {
  if (!isValidIsepId(value)) {
    throw new Error("O ID ISEP ViaWeb deve ter exatamente 4 caracteres hexadecimais, de 0 a 9 e A a F");
  }
}

export async function generateIsepId() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = Array.from({ length: 4 }, () => ISEP_HEX_CHARS[Math.floor(Math.random() * ISEP_HEX_CHARS.length)]).join("");
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
  if (identifierType === "isep" && !isValidIsepId(normalized)) return undefined;

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

/** Mantém o comando Compatec no relatório do cliente, sem criar evento/fila. */
async function syncCompatecRemoteCommandOccurrence(tx: any, command: typeof alarmRemoteCommands.$inferSelect) {
  if (
    command.brand !== "COMPATEC"
    || command.transportMode !== "microbus_compatec"
    || !["arm", "disarm"].includes(command.commandType)
  ) return null;

  const [system] = await tx.select().from(alarmSystems).where(eq(alarmSystems.id, command.alarmSystemId)).limit(1);
  const [client] = system?.clientId
    ? await tx.select().from(clients).where(eq(clients.id, system.clientId)).limit(1)
    : [];
  const [operator] = await tx.select({ name: users.name }).from(users).where(eq(users.id, command.operatorId)).limit(1);
  const operatorName = operator?.name || "Operador autenticado";
  const marker = `[COMANDO REMOTO #${command.id}]`;
  const text = buildRemoteCommandOccurrenceText({
    commandId: command.id,
    commandType: command.commandType,
    operatorName,
    reason: command.reason,
    status: command.status,
    response: command.responsePayload,
  });
  const occurredAt = command.panelConfirmedAt || command.executedAt || command.updatedAt || command.createdAt;
  const values = {
    account: system?.account || "0000",
    eventCode: text.eventCode,
    qualifier: text.qualifier,
    partition: null,
    zoneUser: null,
    description: text.description,
    priority: "low",
    brand: system?.brand || command.brand,
    clientId: system?.clientId || null,
    clientName: client?.fantasyName || client?.name || null,
    systemId: system?.id || command.alarmSystemId,
    partnerCompanyId: client?.partnerCompanyId || null,
    operatorId: command.operatorId,
    operatorName,
    status: "finalized" as const,
    observations: `${text.observations}\n${marker}`,
    logs: JSON.stringify([`[${occurredAt.toLocaleTimeString("pt-BR")}] ${text.description}`]),
    attendingTimeMs: 0,
    sendEmail: false,
    sendPush: false,
    eventReceivedAt: occurredAt,
    startedAt: command.createdAt,
    finalizedAt: occurredAt,
  };
  const [existing] = await tx.select({ id: occurrences.id }).from(occurrences)
    .where(like(occurrences.observations, `%${marker}%`))
    .limit(1);
  if (existing) {
    await tx.update(occurrences).set(values).where(eq(occurrences.id, existing.id));
    return existing.id as number;
  }
  const result = await tx.insert(occurrences).values(values);
  return Number(result[0].insertId);
}

/**
 * Reserva atomicamente a única sequência VSec permitida para a bancada Vetti.
 * O bloqueio da linha do sistema impede que dois operadores enfileirem ou
 * executem fluxos sobrepostos entre a verificação e a inserção.
 */
export async function createExclusiveVettiBenchCommand(data: InsertAlarmRemoteCommand) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    await tx.select({ id: alarmSystems.id })
      .from(alarmSystems)
      .where(eq(alarmSystems.id, data.alarmSystemId))
      .for("update");
    const [active] = await tx.select({ id: alarmRemoteCommands.id, status: alarmRemoteCommands.status })
      .from(alarmRemoteCommands)
      .where(and(
        eq(alarmRemoteCommands.alarmSystemId, data.alarmSystemId),
        eq(alarmRemoteCommands.brand, "VETTI"),
        eq(alarmRemoteCommands.transportMode, "vsec_bench"),
        inArray(alarmRemoteCommands.status, ["queued", "waiting_connection", "sent"]),
      ))
      .orderBy(alarmRemoteCommands.id)
      .limit(1);
    if (active) return { created: false as const, activeCommandId: active.id, activeStatus: active.status };
    const result = await tx.insert(alarmRemoteCommands).values(data);
    return { created: true as const, id: Number(result[0].insertId) };
  });
}

/** Reserva uma única ação física MicroBus na central Compatec identificada. */
export async function createExclusiveCompatecPhysicalCommand(data: InsertAlarmRemoteCommand) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    await tx.select({ id: alarmSystems.id })
      .from(alarmSystems)
      .where(eq(alarmSystems.id, data.alarmSystemId))
      .for("update");
    const [active] = await tx.select({ id: alarmRemoteCommands.id, status: alarmRemoteCommands.status })
      .from(alarmRemoteCommands)
      .where(and(
        eq(alarmRemoteCommands.alarmSystemId, data.alarmSystemId),
        eq(alarmRemoteCommands.brand, "COMPATEC"),
        eq(alarmRemoteCommands.transportMode, "microbus_compatec"),
        inArray(alarmRemoteCommands.commandType, ["arm", "disarm"]),
        inArray(alarmRemoteCommands.status, ["queued", "waiting_connection", "sent"]),
      ))
      .orderBy(alarmRemoteCommands.id)
      .limit(1);
    if (active) return { created: false as const, activeCommandId: active.id, activeStatus: active.status };
    const result = await tx.insert(alarmRemoteCommands).values(data);
    const id = Number(result[0].insertId);
    const [command] = await tx.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, id)).limit(1);
    if (!command) throw new Error("Não foi possível reler o comando Compatec reservado");
    await syncCompatecRemoteCommandOccurrence(tx, command);
    return { created: true as const, id };
  });
}

/** Compatibilidade para chamadas antigas que ainda usam o nome de bancada. */
export const createExclusiveCompatecBenchCommand = createExclusiveCompatecPhysicalCommand;

/**
 * Reserva uma única ação física AMT-8000 por central. O lock do cadastro do
 * sistema impede dois operadores de alternarem o painel ao mesmo tempo.
 */
export async function createExclusiveIntelbrasPhysicalCommand(data: InsertAlarmRemoteCommand) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    await tx.select({ id: alarmSystems.id })
      .from(alarmSystems)
      .where(eq(alarmSystems.id, data.alarmSystemId))
      .for("update");
    const staleBefore = new Date(Date.now() - 45_000);
    const expiredMessage = "Comando Intelbras expirado sem transmissão. Comandos de alternância não são executados após reconexão tardia.";
    await tx.update(alarmRemoteCommands).set({
      status: "expired",
      responsePayload: expiredMessage,
      executedAt: new Date(),
    }).where(and(
      eq(alarmRemoteCommands.alarmSystemId, data.alarmSystemId),
      eq(alarmRemoteCommands.brand, "INTELBRAS"),
      eq(alarmRemoteCommands.transportMode, "intelbras_amt8000_e7"),
      eq(alarmRemoteCommands.status, "waiting_connection"),
    ));
    await tx.update(alarmRemoteCommands).set({
      status: "expired",
      responsePayload: expiredMessage,
      executedAt: new Date(),
    }).where(and(
      eq(alarmRemoteCommands.alarmSystemId, data.alarmSystemId),
      eq(alarmRemoteCommands.brand, "INTELBRAS"),
      eq(alarmRemoteCommands.transportMode, "intelbras_amt8000_e7"),
      eq(alarmRemoteCommands.status, "queued"),
      lte(alarmRemoteCommands.createdAt, staleBefore),
    ));
    const [active] = await tx.select({ id: alarmRemoteCommands.id, status: alarmRemoteCommands.status })
      .from(alarmRemoteCommands)
      .where(and(
        eq(alarmRemoteCommands.alarmSystemId, data.alarmSystemId),
        eq(alarmRemoteCommands.brand, "INTELBRAS"),
        eq(alarmRemoteCommands.transportMode, "intelbras_amt8000_e7"),
        inArray(alarmRemoteCommands.status, ["queued", "sent"]),
      ))
      .orderBy(alarmRemoteCommands.id)
      .limit(1);
    if (active) return { created: false as const, activeCommandId: active.id, activeStatus: active.status };
    const result = await tx.insert(alarmRemoteCommands).values(data);
    return { created: true as const, id: Number(result[0].insertId) };
  });
}

export async function updateAlarmRemoteCommandDelivery(id: number, data: {
  status: string;
  responsePayload?: string | null;
  executedAt?: Date | null;
  technicalUserCode?: string | null;
  panelConfirmedAt?: Date | null;
  remoteEventId?: number | null;
  incidentId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.transaction(async (tx) => {
    const [command] = await tx.select().from(alarmRemoteCommands)
      .where(eq(alarmRemoteCommands.id, id))
      .limit(1)
      .for("update");
    if (!command) return;
    const updatedCommand = {
      ...command,
      ...data,
      responsePayload: data.responsePayload === undefined ? command.responsePayload : data.responsePayload,
      executedAt: data.executedAt === undefined ? command.executedAt : data.executedAt,
      panelConfirmedAt: data.panelConfirmedAt === undefined ? command.panelConfirmedAt : data.panelConfirmedAt,
      updatedAt: new Date(),
    };
    await tx.update(alarmRemoteCommands).set(data).where(eq(alarmRemoteCommands.id, id));
    await syncCompatecRemoteCommandOccurrence(tx, updatedCommand);
  });
}

/** Anexa a solicitação do comando à ocorrência já aberta, sem criar um evento falso. */
export async function appendIncidentNote(incidentId: number, note: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.update(incidents).set({
    notes: sql`CONCAT(COALESCE(${incidents.notes}, ''), ${`\n${note}`})`,
  }).where(and(eq(incidents.id, incidentId), ne(incidents.status, "closed")));
}

/**
 * Confirma um comando físico Compatec e o torna visível no atendimento ou no
 * relatório. O evento Contact ID enviado pelo painel continua sendo tratado
 * separadamente; este registro descreve somente a ação iniciada pelo operador.
 */
export async function recordRemoteCommandConfirmation(input: {
  commandId: number;
  responsePayload: string;
  confirmedAt?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const confirmedAt = input.confirmedAt || new Date();

  return db.transaction(async (tx) => {
    const [command] = await tx.select().from(alarmRemoteCommands)
      .where(eq(alarmRemoteCommands.id, input.commandId))
      .limit(1)
      .for("update");
    if (!command) return { recorded: false as const };

    const updatedCommand = {
      ...command,
      status: "responded",
      responsePayload: input.responsePayload,
      panelConfirmedAt: confirmedAt,
      executedAt: confirmedAt,
      updatedAt: confirmedAt,
    };
    await tx.update(alarmRemoteCommands).set({
      status: "responded",
      responsePayload: input.responsePayload,
      panelConfirmedAt: confirmedAt,
      executedAt: confirmedAt,
    }).where(eq(alarmRemoteCommands.id, command.id));

    const [operator] = await tx.select({ name: users.name }).from(users).where(eq(users.id, command.operatorId)).limit(1);
    const operatorName = operator?.name || "Operador autenticado";
    const actionLabel = getRemoteCommandActionLabel(command.commandType);
    const isCompatecPhysicalAction = command.brand === "COMPATEC"
      && command.transportMode === "microbus_compatec"
      && ["arm", "disarm"].includes(command.commandType);
    const occurrenceId = isCompatecPhysicalAction
      ? await syncCompatecRemoteCommandOccurrence(tx, updatedCommand)
      : null;
    const incidentNote = buildRemoteCommandIncidentNotes({
      commandId: command.id,
      commandLabel: actionLabel,
      requestedBy: operatorName,
      reason: command.reason,
      response: input.responsePayload,
    });

    if (command.incidentId) {
      const [incident] = await tx.select({ id: incidents.id, status: incidents.status, notes: incidents.notes })
        .from(incidents)
        .where(eq(incidents.id, command.incidentId))
        .limit(1);
      if (incident && incident.status !== "closed") {
        const marker = `[COMANDO REMOTO #${command.id} CONFIRMADO]`;
        if (!incident.notes?.includes(marker)) {
          await tx.update(incidents).set({
            notes: sql`CONCAT(COALESCE(${incidents.notes}, ''), ${`\n${incidentNote}`})`,
          }).where(and(eq(incidents.id, command.incidentId), ne(incidents.status, "closed")));
        }
        return {
          recorded: true as const,
          commandId: command.id,
          alarmSystemId: command.alarmSystemId,
          incidentId: command.incidentId,
          occurrenceId,
          commandType: command.commandType,
          actionLabel,
        };
      }
    }

    if (!isCompatecPhysicalAction) {
      return {
        recorded: true as const,
        commandId: command.id,
        alarmSystemId: command.alarmSystemId,
        incidentId: null,
        commandType: command.commandType,
        actionLabel,
      };
    }
    return {
      recorded: true as const,
      commandId: command.id,
      alarmSystemId: command.alarmSystemId,
      incidentId: null,
      occurrenceId,
      commandType: command.commandType,
      actionLabel,
    };
  });
}

/**
 * Um evento Vetti de Desarme só é retirado da finalização automática quando
 * houver confirmação 0xC3 recente, do mesmo sistema físico de bancada, ainda
 * sem outro evento associado. A reserva ocorre na mesma transação que cria o
 * evento e o incidente, evitando atribuir retransmissões ou eventos manuais.
 */
export async function createConfirmedVettiDisarmEventWithOpenIncident(input: {
  event: InsertAlarmEvent;
  eventReceivedAt: Date;
  alarmSystemId: number;
  clientId: number | null;
  priority: "critical" | "high" | "medium" | "low";
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const eventForMatch = {
    brand: input.event.brand,
    qualifier: input.event.qualifier,
    eventCode: input.event.eventCode,
    receivedAt: input.eventReceivedAt,
  };
  const windowStart = new Date(input.eventReceivedAt.getTime() - 60_000);
  const windowEnd = new Date(input.eventReceivedAt.getTime() + 60_000);

  return db.transaction(async (tx) => {
    const candidates = await tx.select({
      id: alarmRemoteCommands.id,
      brand: alarmRemoteCommands.brand,
      commandType: alarmRemoteCommands.commandType,
      transportMode: alarmRemoteCommands.transportMode,
      status: alarmRemoteCommands.status,
      panelConfirmedAt: alarmRemoteCommands.panelConfirmedAt,
      remoteEventId: alarmRemoteCommands.remoteEventId,
      operatorName: users.name,
      technicalUserCode: alarmRemoteCommands.technicalUserCode,
    }).from(alarmRemoteCommands)
      .leftJoin(users, eq(alarmRemoteCommands.operatorId, users.id))
      .where(and(
        eq(alarmRemoteCommands.alarmSystemId, input.alarmSystemId),
        eq(alarmRemoteCommands.brand, "VETTI"),
        eq(alarmRemoteCommands.commandType, "disarm"),
        eq(alarmRemoteCommands.transportMode, "vsec_bench"),
        inArray(alarmRemoteCommands.status, ["sent", "responded"]),
        isNotNull(alarmRemoteCommands.panelConfirmedAt),
        isNull(alarmRemoteCommands.remoteEventId),
        gte(alarmRemoteCommands.panelConfirmedAt, windowStart),
        lte(alarmRemoteCommands.panelConfirmedAt, windowEnd),
      ))
      .orderBy(desc(alarmRemoteCommands.panelConfirmedAt))
      .limit(1)
      .for("update");
    const command = candidates[0];
    if (!command || !isConfirmedRemoteCommandEventMatch(command, eventForMatch)) return undefined;

    const notes = buildRemoteCommandIncidentNotes({
      commandId: command.id,
      commandLabel: "Desarme remoto Vetti",
      requestedBy: command.operatorName || "Operador autenticado",
      technicalUserCode: command.technicalUserCode,
      panelUser: input.event.zoneUser,
    });
    const eventResult = await tx.insert(alarmEvents).values({
      ...input.event,
      alarmSystemId: input.alarmSystemId,
      remoteCommandId: command.id,
      autoFinalized: false,
      autoFinalizationReason: null,
      receivedAt: input.eventReceivedAt,
    });
    const eventId = Number(eventResult[0].insertId);
    const incidentResult = await tx.insert(incidents).values({
      eventId,
      alarmSystemId: input.alarmSystemId,
      clientId: input.clientId,
      operatorId: null,
      status: "waiting",
      priority: input.priority,
      notes,
    });
    const incidentId = Number(incidentResult[0].insertId);
    await tx.update(alarmRemoteCommands).set({ remoteEventId: eventId, incidentId }).where(eq(alarmRemoteCommands.id, command.id));
    return { eventId, incidentId, commandId: command.id, notes };
  });
}

/**
 * A Compatec abre conexões curtas para reportar identidade e Keep Alive. A
 * primeiro comando pode ficar aguardando até a próxima conexão identificada;
 * a seleção é restrita à própria central que abriu a conexão.
 */
export async function getPendingCompatecCommand(alarmSystemId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({
    id: alarmRemoteCommands.id,
    commandPayload: alarmRemoteCommands.commandPayload,
  }).from(alarmRemoteCommands).where(and(
    eq(alarmRemoteCommands.alarmSystemId, alarmSystemId),
    eq(alarmRemoteCommands.brand, "COMPATEC"),
    inArray(alarmRemoteCommands.commandType, ["query_status", "query_sectors", "arm", "disarm"]),
    inArray(alarmRemoteCommands.transportMode, ["microbus_bench", "microbus_compatec"]),
    eq(alarmRemoteCommands.status, "waiting_connection"),
  )).orderBy(alarmRemoteCommands.id).limit(1);
  return result[0];
}

/** Compatibilidade com o nome histórico usado pelo receptor MicroBus. */
export const getPendingCompatecBenchQuery = getPendingCompatecCommand;

/** A Vetti abre a conexão com a VPS; somente fluxos VSec explicitamente homologados na bancada podem aguardar essa sessão. */
export async function getPendingVettiBenchStatusQuery(alarmSystemId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({
    id: alarmRemoteCommands.id,
    commandType: alarmRemoteCommands.commandType,
  }).from(alarmRemoteCommands).where(and(
    eq(alarmRemoteCommands.alarmSystemId, alarmSystemId),
    eq(alarmRemoteCommands.brand, "VETTI"),
    inArray(alarmRemoteCommands.commandType, ["query_status", "disarm"]),
    eq(alarmRemoteCommands.transportMode, "vsec_bench"),
    eq(alarmRemoteCommands.status, "waiting_connection"),
  )).orderBy(alarmRemoteCommands.id).limit(1);
  return result[0];
}

/** Entrega somente a próxima ação física da própria central identificada. */
export async function getPendingIntelbrasPhysicalCommand(alarmSystemId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({
    id: alarmRemoteCommands.id,
    commandType: alarmRemoteCommands.commandType,
    partition: alarmRemoteCommands.partition,
    commandPayload: alarmRemoteCommands.commandPayload,
  }).from(alarmRemoteCommands).where(and(
    eq(alarmRemoteCommands.alarmSystemId, alarmSystemId),
    eq(alarmRemoteCommands.brand, "INTELBRAS"),
    inArray(alarmRemoteCommands.commandType, ["arm", "disarm"]),
    eq(alarmRemoteCommands.transportMode, "intelbras_amt8000_e7"),
    eq(alarmRemoteCommands.status, "queued"),
  )).orderBy(alarmRemoteCommands.id).limit(1);
  return result[0];
}

export async function setAlarmSystemRemoteCommandLabEnabled(
  alarmSystemId: number,
  enabled: boolean,
  audit?: { operatorId: number; reason: string },
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.transaction(async (tx) => {
    const [system] = await tx.select({ id: alarmSystems.id, brand: alarmSystems.brand, macAddress: alarmSystems.macAddress })
      .from(alarmSystems)
      .where(eq(alarmSystems.id, alarmSystemId))
      .for("update");
    if (!system) throw new Error("Sistema de alarme não encontrado");

    await tx.update(alarmSystems).set({ remoteCommandLabEnabled: enabled }).where(eq(alarmSystems.id, alarmSystemId));
    if (system.brand?.trim().toUpperCase() !== "INTELBRAS" || !audit) return;

    const action = enabled ? "enable_bench_mode" : "disable_bench_mode";
    await tx.insert(alarmRemoteCommands).values({
      alarmSystemId,
      incidentId: null,
      operatorId: audit.operatorId,
      brand: "INTELBRAS",
      commandType: action,
      transportMode: "admin_control",
      status: enabled ? "authorized" : "disabled",
      partition: null,
      zoneNumber: null,
      pgmNumber: null,
      reason: audit.reason,
      commandPayload: JSON.stringify({ mode: "audit", macAddress: system.macAddress, physicalCommandSent: false }),
      responsePayload: `Modo de bancada ${enabled ? "habilitado" : "desabilitado"}; nenhum comando físico foi transmitido.`,
      executedAt: new Date(),
    });
  });
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
    technicalUserCode: alarmRemoteCommands.technicalUserCode,
    remoteEventId: alarmRemoteCommands.remoteEventId,
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
export async function getAlarmRemoteCredentialForTransport(alarmSystemId: number, credentialKind: "vetti_installer" | "vetti_command_user" | "intelbras_master" | "intelbras_remote_configuration") {
  const db = await getDb();
  if (!db) return undefined;
  const [credential] = await db.select({ encryptedSecret: alarmRemoteCredentials.encryptedSecret })
    .from(alarmRemoteCredentials)
    .where(and(eq(alarmRemoteCredentials.alarmSystemId, alarmSystemId), eq(alarmRemoteCredentials.credentialKind, credentialKind)))
    .limit(1);
  if (!credential?.encryptedSecret) return undefined;
  return decryptRemoteCommandCredential(credential.encryptedSecret);
}

/** Exposição administrativa mínima para auditoria interna; nunca devolve a senha cifrada ou decifrada. */
export async function getAlarmRemoteCredentialTechnicalUserCode(alarmSystemId: number, credentialKind: "vetti_command_user") {
  const db = await getDb();
  if (!db) return undefined;
  const [credential] = await db.select({ technicalUserCode: alarmRemoteCredentials.technicalUserCode })
    .from(alarmRemoteCredentials)
    .where(and(eq(alarmRemoteCredentials.alarmSystemId, alarmSystemId), eq(alarmRemoteCredentials.credentialKind, credentialKind)))
    .limit(1);
  return credential?.technicalUserCode || undefined;
}

/** Apenas a API administrativa recebe o texto curto, cifra-o e persiste o resultado. */
export async function setAlarmRemoteCredential(input: { alarmSystemId: number; credentialKind: string; credential: string; updatedBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (input.credentialKind === "intelbras_master" && !/^\d{4}(\d{2})?$/.test(input.credential.trim())) {
    throw new Error("A Senha Master Intelbras deve ter exatamente 4 ou 6 dígitos numéricos");
  }
  if (input.credentialKind === "intelbras_remote_configuration" && !/^\d{6}$/.test(input.credential.trim())) {
    throw new Error("A Senha de Acesso Remoto AMT-8000 deve ter exatamente 6 dígitos numéricos");
  }
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
    isepId: data.brand === "VIAWEB" ? (data.isepId ? normalizeIsepId(data.isepId) : await generateIsepId()) : null,
  };
  if (normalizedData.brand === "VIAWEB" && normalizedData.isepId) assertValidIsepId(normalizedData.isepId);
  assertRequiredJflVersion5OrLaterSerial(normalizedData);
  assertRequiredPanelIdentifier(normalizedData);
  let result;
  try {
    result = await db.insert(alarmSystems).values(normalizedData);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new Error(getDuplicateAlarmSystemIdentifierMessage(normalizedData, (error as { message?: string; sqlMessage?: string }).message || (error as { sqlMessage?: string }).sqlMessage));
    }
    throw error;
  }
  return { id: result[0].insertId };
}

export function getDuplicateAlarmSystemIdentifierMessage(system: Pick<InsertAlarmSystem, "serialNumber" | "macAddress" | "isepId">, databaseMessage?: string) {
  const message = databaseMessage || "";
  if (/serialNumber/i.test(message)) return `Serial ${system.serialNumber || "informado"} já está vinculado a outro sistema. Confira o cadastro anterior antes de tentar novamente.`;
  if (/macAddress/i.test(message)) return `MAC ${system.macAddress || "informado"} já está vinculado a outro sistema. Confira o cadastro anterior antes de tentar novamente.`;
  if (/isepId/i.test(message)) return `ISEP ${system.isepId || "informado"} já está vinculado a outro sistema ViaWeb. Confira o cadastro anterior antes de tentar novamente.`;
  return "Um identificador técnico desta central já está vinculado a outro sistema. Confira Serial, MAC e ISEP antes de tentar novamente.";
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
  if (effectiveBrand === "VIAWEB") {
    if (normalizedData.isepId !== undefined) {
      normalizedData.isepId = normalizeIsepId(normalizedData.isepId || "");
      assertValidIsepId(normalizedData.isepId);
    } else if (!isValidIsepId(current?.isepId)) {
      normalizedData.isepId = await generateIsepId();
    }
  }
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

/** Lista operacional sem senhas, contra-senhas ou códigos de coação. */
export async function listOperationalAlarmUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    alarmSystemId: alarmUsers.alarmSystemId,
    userNumber: alarmUsers.userNumber,
    name: alarmUsers.name,
    isActive: alarmUsers.isActive,
  }).from(alarmUsers).where(eq(alarmUsers.isActive, true)).orderBy(alarmUsers.alarmSystemId, alarmUsers.userNumber);
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

/**
 * Evita que a mesma falha técnica, repetida antes da restauração, crie milhares
 * de cartões para o operador. Cada pacote continua sendo salvo em alarm_events;
 * somente a ocorrência operacional é mantida única até chegar o R correspondente.
 */
export async function findOpenTrackedIncident(input: {
  alarmSystemId: number;
  account: string;
  eventCode: string;
  qualifier: string;
}) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ incident: incidents, event: alarmEvents })
    .from(incidents)
    .innerJoin(alarmEvents, eq(incidents.eventId, alarmEvents.id))
    .where(and(
      eq(incidents.alarmSystemId, input.alarmSystemId),
      eq(alarmEvents.account, input.account),
      eq(alarmEvents.eventCode, input.eventCode),
      eq(alarmEvents.qualifier, input.qualifier),
      inArray(incidents.status, ["waiting", "attending", "observing", "dispatched"]),
    ))
    .orderBy(desc(incidents.createdAt))
    .limit(1);
  return result[0];
}

/**
 * Escala falhas E361 da Radioenge que não receberam R361 dentro da janela
 * automática. A atualização é persistida para sobreviver a reinícios e pode
 * ser chamada pelo temporizador do receptor ou pela reconstrução da fila.
 */
export async function promoteExpiredRadioengeKeepAliveObservations(now = new Date()) {
  const db = await getDb();
  if (!db) return [];
  return promoteExpiredRadioengeKeepAliveObservationsWithDb(db, now);
}

export async function promoteExpiredRadioengeKeepAliveObservationsWithDb(db: any, now = new Date()) {
  return db.transaction(async (tx: any) => {
  const rows: Array<{ incident: typeof incidents.$inferSelect; event: typeof alarmEvents.$inferSelect }> = await tx
    .select({ incident: incidents, event: alarmEvents })
    .from(incidents)
    .innerJoin(alarmEvents, eq(incidents.eventId, alarmEvents.id))
    .where(and(
      eq(incidents.status, "observing"),
      eq(alarmEvents.brand, "RADIOENGE"),
      eq(alarmEvents.qualifier, "E"),
      eq(alarmEvents.eventCode, "361"),
      isNotNull(incidents.observationUntil),
      lte(incidents.observationUntil, now),
    )).for("update");
  if (rows.length === 0) return [];
  await tx.update(incidents).set({
    status: "attending",
    observationUntil: null,
    notes: sql`CONCAT(COALESCE(${incidents.notes}, ''), '\nPrazo Radioenge E361 encerrado sem R361; ocorrência encaminhada para atendimento.')`,
    version: sql`${incidents.version} + 1`,
  }).where(and(
    inArray(incidents.id, rows.map(({ incident }) => incident.id)),
    eq(incidents.status, "observing"),
    lte(incidents.observationUntil, now),
  ));
  return rows.map(({ incident, event }) => ({
    incidentId: incident.id,
    eventId: event.id,
    alarmSystemId: incident.alarmSystemId,
    account: event.account,
    brand: event.brand,
    qualifier: event.qualifier,
    eventCode: event.eventCode,
    description: event.description,
  }));
  });
}

/** Localiza o E361 ainda dentro da janela automática para parear com o R361. */
export async function findRadioengeKeepAliveObservationForRestoration(input: {
  alarmSystemId?: number | null;
  account: string;
  now?: Date;
}) {
  const db = await getDb();
  if (!db) return undefined;
  const now = input.now || new Date();
  const result = await db
    .select({ incident: incidents, event: alarmEvents })
    .from(incidents)
    .innerJoin(alarmEvents, eq(incidents.eventId, alarmEvents.id))
    .where(and(
      eq(incidents.status, "observing"),
      eq(alarmEvents.brand, "RADIOENGE"),
      eq(alarmEvents.qualifier, "E"),
      eq(alarmEvents.eventCode, "361"),
      eq(alarmEvents.account, input.account),
      input.alarmSystemId ? eq(incidents.alarmSystemId, input.alarmSystemId) : sql`1=1`,
      sql`${incidents.observationUntil} > ${now}`,
    ))
    .orderBy(desc(incidents.createdAt))
    .limit(1);
  return result[0];
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
  return listOperationalEventReportWithDb(db, opts);
}

export async function listOperationalEventReportWithDb(db: any, opts?: {
  limit?: number; offset?: number; account?: string; clientId?: number; partnerCompanyId?: number;
  dateFrom?: string; dateTo?: string; eventGroup?: EventReportGroup;
}) {
  const conditions = [];
  if (opts?.account?.trim()) conditions.push(like(alarmEvents.account, `%${opts.account.trim()}%`));
  if (opts?.dateFrom) conditions.push(gte(alarmEvents.receivedAt, new Date(`${opts.dateFrom}T00:00:00`)));
  if (opts?.dateTo) conditions.push(lte(alarmEvents.receivedAt, new Date(`${opts.dateTo}T23:59:59.999`)));
  const codes = await db.select().from(contactIdCodes);
  if (opts?.eventGroup === "arm" || opts?.eventGroup === "disarm") {
    const standardCodes = ["401", "403", "407", "408", "409", "441", "701", "3401", "3403", "3407", "3441", "456"];
    const catalogCodes = codes.filter((code: any) =>
      code.category === "arm_disarm"
      || /desarm|desarme|desarmado|desarmada|deslig|armado|armada|armar|arme|stay/i.test(`${code.tipo || ""} ${code.description || ""}`),
    ).map((code: any) => String(code.code));
    conditions.push(inArray(alarmEvents.eventCode, Array.from(new Set([...standardCodes, ...catalogCodes]))));
  } else if (opts?.eventGroup === "test") {
    const codesForGroup = codes.filter((code: any) => code.category === "test").map((code: any) => String(code.code));
    conditions.push(inArray(alarmEvents.eventCode, Array.from(new Set(["602", ...codesForGroup]))));
  } else if (opts?.eventGroup === "system") {
    const codesForGroup = codes.filter((code: any) => ["fault", "system", "access"].includes(code.category)).map((code: any) => String(code.code));
    conditions.push(inArray(alarmEvents.eventCode, Array.from(new Set(codesForGroup))));
  }
  if (opts?.clientId) conditions.push(eq(clients.id, opts.clientId));
  if (opts?.partnerCompanyId) conditions.push(eq(clients.partnerCompanyId, opts.partnerCompanyId));

  const requestedLimit = Number.isFinite(opts?.limit) ? Math.trunc(opts!.limit!) : 100;
  const limit = Math.min(1000, Math.max(1, requestedLimit));
  const offset = Math.max(0, Number.isFinite(opts?.offset) ? Math.trunc(opts!.offset!) : 0);
  const needsCategoryFilter = Boolean(opts?.eventGroup && opts.eventGroup !== "all");
  const batchSize = needsCategoryFilter ? 500 : limit;
  const matched: any[] = [];
  let scanned = needsCategoryFilter ? 0 : offset;
  const requiredMatches = needsCategoryFilter ? offset + limit : limit;

  while (matched.length < requiredMatches) {
    let query = db.select({
      event: {
        id: alarmEvents.id,
        alarmSystemId: alarmEvents.alarmSystemId,
        account: alarmEvents.account,
        brand: alarmEvents.brand,
        qualifier: alarmEvents.qualifier,
        eventCode: alarmEvents.eventCode,
        partition: alarmEvents.partition,
        zoneUser: alarmEvents.zoneUser,
        description: alarmEvents.description,
        priority: alarmEvents.priority,
        receiverPort: alarmEvents.receiverPort,
        remoteIp: alarmEvents.remoteIp,
        autoFinalized: alarmEvents.autoFinalized,
        autoFinalizationReason: alarmEvents.autoFinalizationReason,
        receivedAt: alarmEvents.receivedAt,
      },
      clientId: clients.id,
      clientName: clients.name,
      fantasyName: clients.fantasyName,
      partnerCompanyId: clients.partnerCompanyId,
    }).from(alarmEvents)
      .leftJoin(alarmSystems, eq(alarmEvents.alarmSystemId, alarmSystems.id))
      .leftJoin(clients, eq(alarmSystems.clientId, clients.id));
    if (conditions.length) query = query.where(and(...conditions)) as any;
    const batch = await query.orderBy(desc(alarmEvents.receivedAt), desc(alarmEvents.id))
      .limit(batchSize).offset(scanned);
    if (batch.length === 0) break;

    for (const joined of batch as any[]) {
      const event = joined.event;
      const category = resolveOperationalEventCategory(event, codes);
      const enriched = {
        ...event,
        category,
        clientId: joined.clientId ?? null,
        clientName: joined.fantasyName || joined.clientName || (event.account === "0000" ? "Conta do Sistema" : null),
        partnerCompanyId: joined.partnerCompanyId ?? null,
      };
      if (!needsCategoryFilter || matchesOperationalEventGroup(enriched, category, opts?.eventGroup)) {
        matched.push(enriched);
        if (matched.length >= requiredMatches) break;
      }
    }
    scanned += batch.length;
    if (!needsCategoryFilter || batch.length < batchSize) break;
  }
  return needsCategoryFilter ? matched.slice(offset, offset + limit) : matched;
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

  await promoteExpiredRadioengeKeepAliveObservations(now);

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
  }).where(and(
    eq(incidents.status, "observing"),
    lte(incidents.observationUntil, now),
    notExists(db.select({ id: alarmEvents.id }).from(alarmEvents).where(and(
      eq(alarmEvents.id, incidents.eventId),
      eq(alarmEvents.brand, "RADIOENGE"),
      eq(alarmEvents.qualifier, "E"),
      eq(alarmEvents.eventCode, "361"),
    ))),
  ));

  const rows = await db
    .select({ incident: incidents, event: alarmEvents, incidentOperatorName: users.name })
    .from(incidents)
    .innerJoin(alarmEvents, eq(incidents.eventId, alarmEvents.id))
    .leftJoin(users, eq(incidents.operatorId, users.id))
    .where(inArray(incidents.status, ["waiting", "attending", "observing", "dispatched", "maintenance"]))
    .orderBy(desc(alarmEvents.receivedAt));
  return rows.map(({ incident, event, incidentOperatorName }) => ({
    ...event,
    incidentId: incident.id,
    parentIncidentId: incident.parentIncidentId,
    incidentStatus: incident.status,
    incidentVersion: incident.version,
    incidentClaimedAt: incident.claimedAt,
    incidentClientId: incident.clientId,
    incidentSystemId: incident.alarmSystemId,
    incidentOperatorId: incident.operatorId,
    incidentOperatorName,
    incidentNotes: incident.notes,
    observationUntil: incident.observationUntil,
  }));
}

export async function bulkFinalizeOpenIncidents(input: {
  account: string;
  alarmSystemId?: number | null;
  clientId?: number | null;
  clientName?: string | null;
  partnerCompanyId?: number | null;
  operatorId?: number | null;
  operatorName?: string | null;
  observations: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return bulkFinalizeOpenIncidentsWithDb(db, input);
}

/** Helper injetável: relatório, histórico e fechamento são uma única transação. */
export async function bulkFinalizeOpenIncidentsWithDb(db: any, input: {
  account: string;
  alarmSystemId?: number | null;
  clientId?: number | null;
  clientName?: string | null;
  partnerCompanyId?: number | null;
  operatorId?: number | null;
  operatorName?: string | null;
  observations: string;
}) {
  if (!input.alarmSystemId) throw new Error("Selecione a central identificada para finalizar em massa");
  if (!input.operatorId) throw new Error("Operador autenticado obrigatório");
  if (!input.observations.trim()) throw new Error("Informe a descrição da finalização");
  const finalizedAt = new Date();
  const resolution = input.observations.trim();
  const operatorName = (input.operatorName || "Operador").slice(0, 255);

  return db.transaction(async (tx: any) => {
    const conditions: any[] = [
      eq(alarmEvents.account, input.account),
      eq(incidents.alarmSystemId, input.alarmSystemId!),
      inArray(incidents.status, ["waiting", "attending", "observing", "dispatched", "maintenance"]),
    ];

    const scopedRows: Array<{ incident: typeof incidents.$inferSelect; event: Pick<typeof alarmEvents.$inferSelect, "id" | "account" | "eventCode" | "qualifier" | "partition" | "zoneUser" | "description" | "priority" | "brand" | "receivedAt"> }> = await tx
      .select({ incident: incidents, event: {
        id: alarmEvents.id, account: alarmEvents.account, eventCode: alarmEvents.eventCode,
        qualifier: alarmEvents.qualifier, partition: alarmEvents.partition, zoneUser: alarmEvents.zoneUser,
        description: alarmEvents.description, priority: alarmEvents.priority, brand: alarmEvents.brand,
        receivedAt: alarmEvents.receivedAt,
      } })
      .from(incidents)
      .innerJoin(alarmEvents, eq(incidents.eventId, alarmEvents.id))
      .where(and(...conditions))
      .orderBy(desc(alarmEvents.receivedAt))
      .for("update");

    const openRows = scopedRows.filter(({ incident }) => canBulkFinalizeIncident(incident, input.operatorId!));
    const skippedCount = scopedRows.length - openRows.length;
    if (openRows.length === 0) return { count: 0, closedIncidentIds: [] as number[], skippedCount };
    const closedIncidentIds = openRows.map(({ incident }) => incident.id);

    const log = JSON.stringify([
      `[${finalizedAt.toLocaleTimeString("pt-BR")}] Finalização em massa por ${operatorName}: ${openRows.length} atendimentos da conta ${input.account}`,
    ]);
    const occurrenceRows = openRows.map(({ incident, event }) => ({
      incidentId: incident.id,
      account: event.account,
      eventCode: event.eventCode,
      qualifier: event.qualifier,
      partition: event.partition,
      zoneUser: event.zoneUser,
      description: event.description,
      priority: event.priority,
      brand: event.brand,
      clientId: input.clientId ?? incident.clientId ?? null,
      clientName: input.clientName ?? null,
      systemId: input.alarmSystemId ?? incident.alarmSystemId ?? null,
      partnerCompanyId: input.partnerCompanyId ?? null,
      operatorId: input.operatorId ?? incident.operatorId ?? null,
      operatorName,
      observations: resolution,
      logs: log,
      attendingTimeMs: Math.max(0, finalizedAt.getTime() - incident.createdAt.getTime()),
      sendEmail: false,
      sendPush: false,
      eventReceivedAt: event.receivedAt,
      startedAt: incident.createdAt,
      finalizedAt,
    }));

    for (let offset = 0; offset < occurrenceRows.length; offset += 500) {
      const reportResult = await tx.insert(occurrences).values(occurrenceRows.slice(offset, offset + 500));
      if (!canCloseIncidentAfterReport(Number(reportResult[0]?.insertId))) throw new Error("Relatório não foi persistido; os eventos permanecem abertos");
      await tx.insert(incidentHistory).values(openRows.slice(offset, offset + 500).map(({ incident }) => ({
        incidentId: incident.id, parentIncidentId: incident.parentIncidentId,
        operatorId: input.operatorId, operatorName, action: "bulk_finalized",
        statusBefore: incident.status, statusAfter: "closed", note: resolution,
      })));
    }

    const closedResult = await tx.update(incidents).set({
      status: "closed",
      resolution,
      closedAt: finalizedAt,
      observationUntil: null,
      version: sql`${incidents.version} + 1`,
    }).where(inArray(incidents.id, closedIncidentIds));
    if (Number(closedResult[0]?.affectedRows) !== closedIncidentIds.length) throw new Error("Não foi possível confirmar o fechamento de todos os atendimentos; a operação foi revertida");

    return { count: openRows.length, closedIncidentIds, skippedCount };
  });
}

export async function transitionIncidentForOperator(input: {
  incidentId: number;
  operatorId: number;
  operatorName: string;
  status: "attending" | "dispatched";
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).for("update").limit(1);
    if (!current) throw new Error("Ocorrência aberta não encontrada");
    const action = resolveIncidentOwnershipAction({ status: current.status, assignedOperatorId: current.operatorId, actingOperatorId: input.operatorId });
    if (!action || action === "assume") throw new Error("Este atendimento pertence a outro operador. Atualize a fila e use ‘Assumir atendimento’ somente se estiver em observação.");
    if (current.status === "waiting" && input.status !== "attending") throw new Error("Abra primeiro o atendimento antes de encaminhá-lo ao tático.");

    const now = new Date();
    const nextStatus = input.status;
    await tx.update(incidents).set({
      status: nextStatus,
      operatorId: input.operatorId,
      claimedAt: current.claimedAt || now,
      observationUntil: null,
      dispatchedAt: nextStatus === "dispatched" ? now : current.dispatchedAt,
      version: (current.version || 0) + 1,
    }).where(and(eq(incidents.id, current.id), eq(incidents.version, current.version || 0)));
    await tx.insert(incidentHistory).values({
      incidentId: current.id,
      parentIncidentId: current.parentIncidentId,
      operatorId: input.operatorId,
      operatorName: input.operatorName.slice(0, 255),
      action: action === "claim" ? "claimed" : action === "resume" ? "resumed" : "status_changed",
      statusBefore: current.status,
      statusAfter: nextStatus,
      note: nextStatus === "dispatched" ? "Atendimento encaminhado ao tático." : action === "claim" ? "Atendimento assumido pelo operador." : null,
    });
    return { id: current.id, parentIncidentId: current.parentIncidentId, status: nextStatus, operatorId: input.operatorId, operatorName: input.operatorName, action };
  });
}

export async function putIncidentInObservation(input: { incidentId: number; until: Date; notes?: string; operatorId: number; operatorName: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (input.until <= new Date()) throw new Error("Informe uma data e hora futura para a observação");
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).for("update").limit(1);
    if (!current) throw new Error("Ocorrência aberta não encontrada");
    const action = resolveIncidentOwnershipAction({ status: current.status, assignedOperatorId: current.operatorId, actingOperatorId: input.operatorId });
    if (!action || action === "assume") throw new Error("Somente o operador responsável pode colocar este atendimento em observação.");
    const now = new Date();
    const note = input.notes?.trim() || "Ocorrência colocada em observação";
    await tx.update(incidents).set({ status: "observing", operatorId: input.operatorId, claimedAt: current.claimedAt || now, observationUntil: input.until, notes: note, version: (current.version || 0) + 1 })
      .where(and(eq(incidents.id, current.id), eq(incidents.version, current.version || 0)));
    await tx.insert(incidentHistory).values({
      incidentId: current.id, parentIncidentId: current.parentIncidentId,
      operatorId: input.operatorId, operatorName: input.operatorName.slice(0, 255), action: "observing",
      statusBefore: current.status, statusAfter: "observing", note,
    });
    return { id: current.id, parentIncidentId: current.parentIncidentId, status: "observing" as const, operatorId: input.operatorId, operatorName: input.operatorName };
  });
}

export async function assumeObservedIncident(input: { incidentId: number; operatorId: number; operatorName: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    const [parent] = await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).for("update").limit(1);
    if (!parent) throw new Error("Ocorrência aberta não encontrada");
    if (parent.status === "closed") throw new Error("Este atendimento já está finalizado");
    const action = resolveIncidentOwnershipAction({ status: parent.status, assignedOperatorId: parent.operatorId, actingOperatorId: input.operatorId });
    if (action !== "assume") throw new Error(action === "resume" ? "Você já é responsável por este atendimento; atualize a fila para retomá-lo." : "Só é possível assumir um atendimento em observação por outro operador.");

    // Registros filhos só existiam no fluxo antigo. Não transferir o pai enquanto
    // houver um atendimento legado aberto, para nunca deixar dois operadores
    // finalizarem em paralelo o mesmo evento.
    const [activeChild] = await tx.select({ id: incidents.id, operatorId: incidents.operatorId }).from(incidents).where(and(
      eq(incidents.parentIncidentId, parent.id),
      inArray(incidents.status, ["waiting", "attending", "observing", "dispatched", "maintenance"]),
    )).for("update").limit(1);
    if (activeChild) {
      const childAction = resolveExistingActiveChildAction({ activeChildOperatorId: activeChild.operatorId, actingOperatorId: input.operatorId });
      throw new Error(childAction === "reuse_existing"
        ? `Já existe um atendimento legado seu (#${activeChild.id}) vinculado. Abra esse registro; nenhum atendimento duplicado foi criado.`
        : `Já existe um atendimento legado ativo (#${activeChild.id}) vinculado a outro operador. Atualize a fila e resolva esse registro antes de assumir o atendimento principal.`);
    }

    const now = new Date();
    const operatorName = input.operatorName.slice(0, 255);
    const previousOperatorName = parent.operatorId
      ? (await tx.select({ name: users.name }).from(users).where(eq(users.id, parent.operatorId)).limit(1))[0]?.name || `operador ${parent.operatorId}`
      : "outro operador";
    const transferNote = `Atendimento assumido por ${operatorName}; responsabilidade transferida de ${previousOperatorName}.`;
    const updated = await tx.update(incidents).set({
      status: "attending",
      operatorId: input.operatorId,
      claimedAt: parent.claimedAt || now,
      observationUntil: null,
      notes: sql`CONCAT(COALESCE(${incidents.notes}, ''), ${`\n${transferNote}`})`,
      version: (parent.version || 0) + 1,
    }).where(and(
      eq(incidents.id, parent.id),
      eq(incidents.status, "observing"),
      eq(incidents.operatorId, parent.operatorId!),
      eq(incidents.version, parent.version || 0),
    ));
    if (Number(updated[0]?.affectedRows) !== 1) throw new Error("O atendimento mudou em outra tela. Atualize a fila e tente novamente.");

    await tx.insert(incidentHistory).values({
      incidentId: parent.id,
      parentIncidentId: parent.parentIncidentId,
      operatorId: input.operatorId,
      operatorName,
      action: "assumed",
      statusBefore: "observing",
      statusAfter: "attending",
      note: transferNote,
    });
    return {
      id: parent.id,
      parentIncidentId: parent.parentIncidentId,
      eventId: parent.eventId,
      alarmSystemId: parent.alarmSystemId,
      clientId: parent.clientId,
      status: "attending" as const,
      operatorId: input.operatorId,
      operatorName,
      notes: `${parent.notes || ""}\n${transferNote}`.trim(),
      transferred: true as const,
      previousOperatorId: parent.operatorId,
      previousOperatorName,
    };
  });
}

export async function getIncidentHistory(incidentId: number) {
  const db = await getDb();
  if (!db) return [];
  const [incident] = await db.select({ id: incidents.id, parentIncidentId: incidents.parentIncidentId }).from(incidents).where(eq(incidents.id, incidentId)).limit(1);
  if (!incident) return [];
  const familyRootId = incident.parentIncidentId || incident.id;
  return db.select().from(incidentHistory).where(or(
    eq(incidentHistory.incidentId, familyRootId),
    eq(incidentHistory.parentIncidentId, familyRootId),
  )).orderBy(incidentHistory.createdAt).limit(200);
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
    // Com fabricante informado, ausência de registro específico ou Universal
    // deve permanecer não cadastrado. Nunca reutilizar a primeira descrição de
    // outra marca, pois isso cria fila e relatório falsos.
    return undefined;
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

export async function upsertAlarmSchedule(data: InsertAlarmSchedule) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const partition = data.partition || 1;
  const existing = await db.select({ id: alarmSchedules.id }).from(alarmSchedules).where(and(
    eq(alarmSchedules.alarmSystemId, data.alarmSystemId),
    eq(alarmSchedules.partition, partition),
  )).limit(1);
  if (existing[0]) {
    await db.update(alarmSchedules).set(formatRegistrationFields({ ...data, isActive: data.isActive ?? true }, ["name"]))
      .where(eq(alarmSchedules.id, existing[0].id));
    return { id: existing[0].id, updated: true as const };
  }
  const result = await db.insert(alarmSchedules).values(formatRegistrationFields({ ...data, partition, isActive: data.isActive ?? true }, ["name"]));
  return { id: Number(result[0].insertId), updated: false as const };
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

export async function getAlarmScheduleOverride(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(alarmScheduleOverrides).where(eq(alarmScheduleOverrides.id, id)).limit(1);
  return rows[0] || null;
}

export async function listAlarmScheduleOverrides(alarmSystemId: number, includeInactive = true) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(alarmScheduleOverrides.alarmSystemId, alarmSystemId)];
  if (!includeInactive) conditions.push(eq(alarmScheduleOverrides.isActive, true));
  return db.select().from(alarmScheduleOverrides).where(and(...conditions)).orderBy(alarmScheduleOverrides.overrideDate);
}

export async function listAlarmScheduleOverrideAudit(alarmSystemId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(alarmScheduleOverrideAudit)
    .where(eq(alarmScheduleOverrideAudit.alarmSystemId, alarmSystemId))
    .orderBy(desc(alarmScheduleOverrideAudit.createdAt))
    .limit(100);
}

export async function saveAlarmScheduleOverride(input: {
  alarmSystemId: number;
  overrideDate: string;
  mode: "suspended" | "override";
  duration: ScheduleOverrideDuration;
  armAt?: string | null;
  disarmAt?: string | null;
  requester: string;
  reason: string;
  operatorId: number;
  operatorName: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const window = getScheduleOverrideWindow({ overrideDate: input.overrideDate, duration: input.duration });
  return db.transaction(async (tx) => {
    const existingRows = await tx.select().from(alarmScheduleOverrides).where(and(
      eq(alarmScheduleOverrides.alarmSystemId, input.alarmSystemId),
      eq(alarmScheduleOverrides.overrideDate, input.overrideDate),
    )).limit(1);
    const previous = existingRows[0] || null;
    const values: Omit<InsertAlarmScheduleOverride, "id"> = {
      alarmSystemId: input.alarmSystemId,
      overrideDate: input.overrideDate,
      mode: input.mode,
      armAt: input.mode === "suspended" ? null : input.armAt || null,
      disarmAt: input.mode === "suspended" ? null : input.disarmAt || null,
      validFromAt: window.validFromAt,
      validUntilAt: window.validUntilAt,
      requester: input.requester,
      reason: input.reason,
      createdBy: previous?.createdBy || input.operatorId,
      updatedBy: input.operatorId,
      isActive: true,
    };
    let overrideId: number;
    if (previous) {
      await tx.update(alarmScheduleOverrides).set(values).where(eq(alarmScheduleOverrides.id, previous.id));
      overrideId = previous.id;
    } else {
      const result = await tx.insert(alarmScheduleOverrides).values(values);
      overrideId = Number(result[0].insertId);
    }
    await tx.insert(alarmScheduleOverrideAudit).values({
      overrideId,
      alarmSystemId: input.alarmSystemId,
      overrideDate: input.overrideDate,
      action: previous ? "updated" : "created",
      operatorId: input.operatorId,
      operatorName: input.operatorName,
      requester: input.requester,
      reason: input.reason,
      previousSettings: previous ? JSON.stringify({ mode: previous.mode, armAt: previous.armAt, disarmAt: previous.disarmAt, validFromAt: previous.validFromAt, validUntilAt: previous.validUntilAt, isActive: previous.isActive }) : null,
      newSettings: JSON.stringify({ mode: values.mode, armAt: values.armAt, disarmAt: values.disarmAt, validFromAt: values.validFromAt, validUntilAt: values.validUntilAt, isActive: true }),
    });
    return { id: overrideId };
  });
}

export async function cancelAlarmScheduleOverride(input: { id: number; operatorId: number; operatorName: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const existingRows = await tx.select().from(alarmScheduleOverrides).where(eq(alarmScheduleOverrides.id, input.id)).limit(1);
    const existing = existingRows[0];
    if (!existing) throw new Error("Exceção de agenda não encontrada");
    if (!existing.isActive) return { success: true as const };
    await tx.update(alarmScheduleOverrides).set({ isActive: false, updatedBy: input.operatorId }).where(eq(alarmScheduleOverrides.id, input.id));
    await tx.insert(alarmScheduleOverrideAudit).values({
      overrideId: existing.id,
      alarmSystemId: existing.alarmSystemId,
      overrideDate: existing.overrideDate,
      action: "cancelled",
      operatorId: input.operatorId,
      operatorName: input.operatorName,
      requester: existing.requester,
      reason: existing.reason,
      previousSettings: JSON.stringify({ mode: existing.mode, armAt: existing.armAt, disarmAt: existing.disarmAt, isActive: true }),
      newSettings: JSON.stringify({ isActive: false }),
    });
    return { success: true as const };
  });
}

export async function getAlarmScheduleContext(alarmSystemId: number) {
  const db = await getDb();
  if (!db) return null;
  const systemRows = await db.select({ system: alarmSystems, partnerCompanyId: clients.partnerCompanyId })
    .from(alarmSystems)
    .leftJoin(clients, eq(alarmSystems.clientId, clients.id))
    .where(eq(alarmSystems.id, alarmSystemId))
    .limit(1);
  const systemRow = systemRows[0];
  if (!systemRow?.system) return null;
  const scheduleRows = await db.select().from(alarmSchedules)
    .where(and(eq(alarmSchedules.alarmSystemId, alarmSystemId), eq(alarmSchedules.isActive, true)))
    .orderBy(alarmSchedules.partition, alarmSchedules.id)
    .limit(1);
  if (!scheduleRows[0]) return { system: systemRow.system, schedule: null, holidays: [], exceptions: [] };
  const [holidayRows, exceptionRows] = await Promise.all([
    systemRow.partnerCompanyId ? db.select().from(partnerHolidays).where(eq(partnerHolidays.partnerCompanyId, systemRow.partnerCompanyId)) : Promise.resolve([]),
    db.select().from(alarmScheduleOverrides).where(and(eq(alarmScheduleOverrides.alarmSystemId, alarmSystemId), eq(alarmScheduleOverrides.isActive, true))),
  ]);
  const holidays = holidayRows.map((holiday) => ({
    date: holiday.date,
    holidayArm: scheduleRows[0].holidayArm,
    holidayDisarm: scheduleRows[0].holidayDisarm,
  }));
  const exceptions = exceptionRows.map((item) => ({
    date: item.overrideDate,
    validFromAt: item.validFromAt,
    validUntilAt: item.validUntilAt,
    suspended: item.mode === "suspended",
    override: item.mode === "override" ? {
      ...(item.armAt ? { armAt: item.armAt } : {}),
      ...(item.disarmAt ? { disarmAt: item.disarmAt } : {}),
    } : null,
  }));
  return { system: systemRow.system, schedule: scheduleRows[0], holidays, exceptions };
}

export async function listAlarmScheduleAlerts(filters: {
  status?: "active" | "acknowledged" | "resolved" | "all";
  dateFrom?: string;
  dateTo?: string;
  account?: string;
  clientId?: number;
  partnerCompanyId?: number;
  limit?: number;
} = {}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters.status && filters.status !== "all") conditions.push(eq(alarmScheduleAlerts.status, filters.status));
  if (filters.dateFrom) conditions.push(gte(alarmScheduleAlerts.alertDate, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(alarmScheduleAlerts.alertDate, filters.dateTo));
  if (filters.account?.trim()) conditions.push(like(alarmSystems.account, `%${filters.account.trim()}%`));
  if (filters.clientId) conditions.push(eq(clients.id, filters.clientId));
  if (filters.partnerCompanyId) conditions.push(eq(clients.partnerCompanyId, filters.partnerCompanyId));
  return db.select({
    id: alarmScheduleAlerts.id,
    alarmSystemId: alarmScheduleAlerts.alarmSystemId,
    scheduleId: alarmScheduleAlerts.scheduleId,
    sourceEventId: alarmScheduleAlerts.sourceEventId,
    alertType: alarmScheduleAlerts.alertType,
    alertDate: alarmScheduleAlerts.alertDate,
    expectedAt: alarmScheduleAlerts.expectedAt,
    detectedAt: alarmScheduleAlerts.detectedAt,
    currentState: alarmScheduleAlerts.currentState,
    status: alarmScheduleAlerts.status,
    acknowledgedBy: alarmScheduleAlerts.acknowledgedBy,
    acknowledgedByName: users.name,
    acknowledgedAt: alarmScheduleAlerts.acknowledgedAt,
    resolvedAt: alarmScheduleAlerts.resolvedAt,
    account: alarmSystems.account,
    brand: alarmSystems.brand,
    model: alarmSystems.model,
    clientId: clients.id,
    clientName: clients.name,
    fantasyName: clients.fantasyName,
    partnerCompanyId: clients.partnerCompanyId,
    partnerName: partnerCompanies.name,
  }).from(alarmScheduleAlerts)
    .innerJoin(alarmSystems, eq(alarmScheduleAlerts.alarmSystemId, alarmSystems.id))
    .leftJoin(clients, eq(alarmSystems.clientId, clients.id))
    .leftJoin(partnerCompanies, eq(clients.partnerCompanyId, partnerCompanies.id))
    .leftJoin(users, eq(alarmScheduleAlerts.acknowledgedBy, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(alarmScheduleAlerts.detectedAt))
    .limit(Math.min(Math.max(filters.limit || 500, 1), 2000));
}

export async function getAlarmScheduleAlertPartnerScope(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ id: alarmScheduleAlerts.id, partnerCompanyId: clients.partnerCompanyId })
    .from(alarmScheduleAlerts)
    .innerJoin(alarmSystems, eq(alarmScheduleAlerts.alarmSystemId, alarmSystems.id))
    .leftJoin(clients, eq(alarmSystems.clientId, clients.id))
    .where(eq(alarmScheduleAlerts.id, id))
    .limit(1);
  return rows[0] || null;
}

export async function acknowledgeAlarmScheduleAlert(input: { id: number; operatorId: number; acknowledgedAt?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(alarmScheduleAlerts).set({ status: "acknowledged", acknowledgedBy: input.operatorId, acknowledgedAt: input.acknowledgedAt || new Date() })
    .where(and(eq(alarmScheduleAlerts.id, input.id), eq(alarmScheduleAlerts.status, "active")));
  return { success: true as const };
}

export async function createAlarmScheduleComplianceAlert(input: {
  alarmSystemId: number;
  scheduleId: number;
  sourceEventId?: number | null;
  alertType: "missed_arm" | "unexpected_disarm";
  dedupeKey: string;
  alertDate: string;
  expectedAt: Date | null;
  currentState: "armed" | "disarmed";
  detectedAt?: Date;
}) {
  const db = await getDb();
  if (!db) return { created: false as const };
  const existing = await db.select({ id: alarmScheduleAlerts.id, status: alarmScheduleAlerts.status })
    .from(alarmScheduleAlerts).where(eq(alarmScheduleAlerts.dedupeKey, input.dedupeKey)).limit(1);
  if (existing[0]) return { created: false as const, id: existing[0].id, status: existing[0].status };
  try {
    const result = await db.insert(alarmScheduleAlerts).values({
      alarmSystemId: input.alarmSystemId,
      scheduleId: input.scheduleId,
      sourceEventId: input.sourceEventId || null,
      alertType: input.alertType,
      dedupeKey: input.dedupeKey,
      alertDate: input.alertDate,
      expectedAt: input.expectedAt,
      currentState: input.currentState,
      status: "active",
      detectedAt: input.detectedAt || new Date(),
    });
    return { created: true as const, id: Number(result[0].insertId), status: "active" as const };
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") return { created: false as const };
    throw error;
  }
}

export async function resolveAlarmScheduleAlerts(input: { alarmSystemId: number; alertTypes?: Array<"missed_arm" | "unexpected_disarm">; resolvedAt?: Date }) {
  const db = await getDb();
  if (!db) return { updated: 0 };
  const conditions = [eq(alarmScheduleAlerts.alarmSystemId, input.alarmSystemId), eq(alarmScheduleAlerts.status, "active")];
  if (input.alertTypes?.length) conditions.push(inArray(alarmScheduleAlerts.alertType, input.alertTypes));
  const result = await db.update(alarmScheduleAlerts).set({ status: "resolved", resolvedAt: input.resolvedAt || new Date() }).where(and(...conditions));
  return { updated: Number(result[0].affectedRows || 0) };
}

function getSaoPauloDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export async function sweepAlarmScheduleCompliance(now = new Date()) {
  const db = await getDb();
  if (!db) return { opened: [] as any[], skipped: 0, resolved: 0 };
  const activeSchedules = await db.select().from(alarmSchedules).where(and(
    eq(alarmSchedules.isActive, true),
    eq(alarmSchedules.partition, 1),
  ));
  if (!activeSchedules.length) return { opened: [] as any[], skipped: 0, resolved: 0 };

  const statuses = await getArmDisarmStatus();
  const statusBySystem = new Map<number, any>();
  for (const item of [...statuses.armed, ...statuses.disarmed]) statusBySystem.set(item.alarmSystemId, item);
  const scheduledSystemIds = Array.from(new Set(activeSchedules.map((row) => row.alarmSystemId)));
  const systemRows = await db.select({
    system: alarmSystems,
    partnerCompanyId: clients.partnerCompanyId,
    monitoringStatus: clients.monitoringStatus,
    monitoringStatusUntil: clients.monitoringStatusUntil,
  })
    .from(alarmSystems)
    .leftJoin(clients, eq(alarmSystems.clientId, clients.id))
    .where(and(eq(alarmSystems.isActive, true), inArray(alarmSystems.id, scheduledSystemIds)));
  const systemsById = new Map(systemRows.map((row) => [row.system.id, row]));
  const partnerIds = Array.from(new Set(systemRows.map((row) => row.partnerCompanyId).filter((id): id is number => Boolean(id))));
  const [allHolidays, allExceptions] = await Promise.all([
    partnerIds.length ? db.select().from(partnerHolidays).where(inArray(partnerHolidays.partnerCompanyId, partnerIds)) : Promise.resolve([]),
    db.select().from(alarmScheduleOverrides).where(and(eq(alarmScheduleOverrides.isActive, true), inArray(alarmScheduleOverrides.alarmSystemId, scheduledSystemIds))),
  ]);
  const opened: any[] = [];
  let skipped = 0;
  let resolved = 0;
  for (const schedule of activeSchedules) {
    const status = statusBySystem.get(schedule.alarmSystemId);
    const systemRow = systemsById.get(schedule.alarmSystemId);
    if (!status || !systemRow) { skipped += 1; continue; }
    if (isClientMonitoringBlocked(systemRow, now)) { skipped += 1; continue; }
    const partnerId = systemRow.partnerCompanyId;
    const holidays = allHolidays
      .filter((holiday) => holiday.partnerCompanyId === partnerId)
      .map((holiday) => ({ date: holiday.date, holidayArm: schedule.holidayArm, holidayDisarm: schedule.holidayDisarm }));
    const exceptions = allExceptions.filter((item) => item.alarmSystemId === schedule.alarmSystemId).map((item) => ({
      date: item.overrideDate,
      validFromAt: item.validFromAt,
      validUntilAt: item.validUntilAt,
      suspended: item.mode === "suspended",
      override: item.mode === "override" ? {
        ...(item.armAt ? { armAt: item.armAt } : {}),
        ...(item.disarmAt ? { disarmAt: item.disarmAt } : {}),
      } : null,
    }));
    const decision = evaluateAlarmSchedule({ schedule, holidays, exceptions, at: now, actualState: status.state });
    if (decision.status === "missed_arm" && status.state === "disarmed" && decision.transition?.kind === "arm") {
      const expectedAt = decision.transition.at;
      const alertDate = getSaoPauloDateKey(expectedAt);
      const dedupeKey = `${schedule.alarmSystemId}:${schedule.id}:missed_arm:${alertDate}:${expectedAt.toISOString()}`;
      const created = await createAlarmScheduleComplianceAlert({
        alarmSystemId: schedule.alarmSystemId,
        scheduleId: schedule.id,
        alertType: "missed_arm",
        dedupeKey,
        alertDate,
        expectedAt,
        currentState: "disarmed",
        detectedAt: now,
      });
      if (created.created) opened.push({
        id: created.id,
        alarmSystemId: schedule.alarmSystemId,
        account: systemRow.system.account,
        brand: systemRow.system.brand,
        alertType: "missed_arm",
        alertDate,
        expectedAt,
        detectedAt: now,
        status: "active",
      });
    } else {
      const result = await resolveAlarmScheduleAlerts({ alarmSystemId: schedule.alarmSystemId, resolvedAt: now });
      resolved += result.updated;
    }
  }
  return { opened, skipped, resolved };
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
export async function createOccurrenceAndCloseIncident(incidentId: number, occurrence: InsertOccurrence, actingOperatorId: number, actingOperatorName: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(incidents).where(eq(incidents.id, incidentId)).for("update").limit(1);
    if (!current) throw new Error("Ocorrência aberta não encontrada");
    if (current.status === "closed") throw new Error("Ocorrência já está finalizada");
    if (current.operatorId !== actingOperatorId) throw new Error("Este atendimento está atribuído a outro operador. Assuma o atendimento quando estiver em observação antes de finalizá-lo.");
    const reportResult = await tx.insert(occurrences).values({
      ...occurrence,
      incidentId,
      operatorId: actingOperatorId,
      operatorName: actingOperatorName.slice(0, 255),
    });
    const reportId = Number(reportResult[0].insertId);
    if (!canCloseIncidentAfterReport(reportId)) throw new Error("Relatório não foi persistido; ocorrência permanece aberta");
    await tx.update(incidents).set({
      status: "closed",
      resolution: occurrence.observations || "Finalizada pelo operador",
      closedAt: new Date(),
      version: (current.version || 0) + 1,
    }).where(and(eq(incidents.id, incidentId), eq(incidents.operatorId, actingOperatorId), ne(incidents.status, "closed")));
    await tx.insert(incidentHistory).values({
      incidentId,
      parentIncidentId: current.parentIncidentId,
      operatorId: actingOperatorId,
      operatorName: actingOperatorName.slice(0, 255),
      action: "finalized",
      statusBefore: current.status,
      statusAfter: "closed",
      note: occurrence.observations || "Finalizada pelo operador",
    });
    return { id: reportId };
  });
}

export async function listOccurrences(opts?: { limit?: number; offset?: number; account?: string; clientId?: number; partnerCompanyId?: number; dateFrom?: string; dateTo?: string; operatorName?: string }) {
  const db = await getDb();
  if (!db) return [];
  return listOccurrencesWithDb(db, opts);
}

export async function listOccurrenceOperatorNames(partnerCompanyId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [isNotNull(occurrences.operatorName), ne(occurrences.operatorName, "")];
  if (partnerCompanyId) conditions.push(or(
    eq(occurrences.partnerCompanyId, partnerCompanyId),
    and(isNull(occurrences.partnerCompanyId), eq(clients.partnerCompanyId, partnerCompanyId)),
  ) as any);
  const rows = await db.selectDistinct({ operatorName: occurrences.operatorName })
    .from(occurrences)
    .leftJoin(alarmSystems, eq(occurrences.systemId, alarmSystems.id))
    .leftJoin(clients, eq(clients.id, sql`COALESCE(${occurrences.clientId}, ${alarmSystems.clientId})`))
    .where(and(...conditions))
    .orderBy(occurrences.operatorName);
  return rows.map((row: { operatorName: string | null }) => row.operatorName).filter(Boolean);
}

export async function listOccurrencesWithDb(db: any, opts?: { limit?: number; offset?: number; account?: string; clientId?: number; partnerCompanyId?: number; dateFrom?: string; dateTo?: string; operatorName?: string }) {
  const conditions = [];
  if (opts?.account?.trim()) conditions.push(like(occurrences.account, `%${opts.account.trim()}%`));
  if (opts?.operatorName?.trim()) conditions.push(like(occurrences.operatorName, `%${opts.operatorName.trim()}%`));
  if (opts?.dateFrom) conditions.push(gte(occurrences.finalizedAt, new Date(`${opts.dateFrom}T00:00:00`)));
  if (opts?.dateTo) conditions.push(lte(occurrences.finalizedAt, new Date(`${opts.dateTo}T23:59:59.999`)));
  if (opts?.clientId) conditions.push(or(
    eq(occurrences.clientId, opts.clientId),
    and(isNull(occurrences.clientId), eq(clients.id, opts.clientId)),
  ));
  if (opts?.partnerCompanyId) conditions.push(or(
    eq(occurrences.partnerCompanyId, opts.partnerCompanyId),
    and(isNull(occurrences.partnerCompanyId), eq(clients.partnerCompanyId, opts.partnerCompanyId)),
  ));
  const requestedLimit = Number.isFinite(opts?.limit) ? Math.trunc(opts!.limit!) : 100;
  const limit = Math.min(1000, Math.max(1, requestedLimit));
  const offset = Math.max(0, Number.isFinite(opts?.offset) ? Math.trunc(opts!.offset!) : 0);
  let query = db.select({
    occurrence: {
      id: occurrences.id,
      incidentId: occurrences.incidentId,
      account: occurrences.account,
      eventCode: occurrences.eventCode,
      qualifier: occurrences.qualifier,
      partition: occurrences.partition,
      zoneUser: occurrences.zoneUser,
      description: occurrences.description,
      priority: occurrences.priority,
      brand: occurrences.brand,
      clientId: occurrences.clientId,
      clientName: occurrences.clientName,
      systemId: occurrences.systemId,
      partnerCompanyId: occurrences.partnerCompanyId,
      operatorId: occurrences.operatorId,
      operatorName: occurrences.operatorName,
      status: occurrences.status,
      observations: occurrences.observations,
      attendingTimeMs: occurrences.attendingTimeMs,
      eventReceivedAt: occurrences.eventReceivedAt,
      startedAt: occurrences.startedAt,
      finalizedAt: occurrences.finalizedAt,
      createdAt: occurrences.createdAt,
    },
    linkedClientId: clients.id,
    linkedClientName: clients.name,
    linkedFantasyName: clients.fantasyName,
    linkedPartnerCompanyId: clients.partnerCompanyId,
  }).from(occurrences)
    .leftJoin(alarmSystems, eq(occurrences.systemId, alarmSystems.id))
    .leftJoin(clients, eq(clients.id, sql`COALESCE(${occurrences.clientId}, ${alarmSystems.clientId})`));
  if (conditions.length) query = query.where(and(...conditions)) as any;
  const rows = await query.orderBy(desc(occurrences.finalizedAt), desc(occurrences.id)).limit(limit).offset(offset);
  return rows.map((joined: any) => {
    const row = joined.occurrence;
    return {
      ...row,
      clientId: row.clientId ?? joined.linkedClientId ?? null,
      clientName: row.clientName || joined.linkedFantasyName || joined.linkedClientName || null,
      partnerCompanyId: row.partnerCompanyId ?? joined.linkedPartnerCompanyId ?? null,
    };
  });
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

export function getAlarmSystemDeletionConfirmation(system: { account: string; brand: string; model?: string | null; macAddress?: string | null; serialNumber?: string | null; isepId?: string | null }) {
  return buildAlarmSystemDeletionConfirmation(system);
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
export async function getLatestArmDisarmStatusForSystem(alarmSystemId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select({
    id: alarmEvents.id,
    qualifier: alarmEvents.qualifier,
    eventCode: alarmEvents.eventCode,
    brand: alarmEvents.brand,
    receivedAt: alarmEvents.receivedAt,
    alarmSystemId: alarmEvents.alarmSystemId,
    description: alarmEvents.description,
  }).from(alarmEvents).where(and(
    eq(alarmEvents.alarmSystemId, alarmSystemId),
    inArray(alarmEvents.eventCode, [...STANDARD_ARM_DISARM_EVENT_CODES, "701", "3401", "3403", "3407", "3441", "456"]),
  )).orderBy(desc(alarmEvents.receivedAt), desc(alarmEvents.id));
  return rows.find((event) => isArmDisarmStatusEvent(event));
}

export async function getArmDisarmStatus() {
  const db = await getDb();
  if (!db) return { armed: [], disarmed: [] };
  
  // Buscar os códigos de estado do painel; a classificação final considera marca e qualifier.
  const armDisarmCodes = [...STANDARD_ARM_DISARM_EVENT_CODES, "701", "3401", "3403", "3407", "3441", "456"];
  const systems = await db.select({
    id: alarmSystems.id,
    account: alarmSystems.account,
    isActive: alarmSystems.isActive,
    clientId: alarmSystems.clientId,
    brand: alarmSystems.brand,
    model: alarmSystems.model,
    clientName: clients.name,
    clientFantasyName: clients.fantasyName,
  }).from(alarmSystems)
    .leftJoin(clients, eq(alarmSystems.clientId, clients.id))
    .where(eq(alarmSystems.isActive, true));
  const activeSystemIds = systems.map((system: any) => system.id);
  if (activeSystemIds.length === 0) return { armed: [], disarmed: [] };
  
  const lastEvents = await db.select({
    id: alarmEvents.id,
    account: alarmEvents.account,
    qualifier: alarmEvents.qualifier,
    eventCode: alarmEvents.eventCode,
    brand: alarmEvents.brand,
    receivedAt: alarmEvents.receivedAt,
    alarmSystemId: alarmEvents.alarmSystemId,
    description: alarmEvents.description,
  }).from(alarmEvents)
    .where(and(
      inArray(alarmEvents.eventCode, armDisarmCodes),
      ne(alarmEvents.account, "0000"),
      isNotNull(alarmEvents.alarmSystemId),
      inArray(alarmEvents.alarmSystemId, activeSystemIds),
    ))
    .orderBy(desc(alarmEvents.receivedAt), desc(alarmEvents.id));
  
  // Armado/Desarmado é o último estado conhecido de um painel ativo. Sistemas
  // desativados não podem aumentar o contador nem aparecer nas listas.
  const systemsById = new Map(systems.map((system) => [system.id, system]));
  const latestStatuses = getLatestArmDisarmStatusBySystem(
    lastEvents.filter((event) => isArmDisarmStatusEvent(event)),
    systems,
  );
  
  const armed: any[] = [];
  const disarmed: any[] = [];

  for (const status of latestStatuses) {
    const { account } = status;
    let clientName = `Conta ${account}`;
    let clientFantasyName: string | null = null;
    let clientId: number | null = null;
    let systemId = status.alarmSystemId;
    const systemInfo = systemsById.get(status.alarmSystemId);
    
    if (systemInfo?.clientId) {
      clientName = systemInfo.clientName || clientName;
      clientFantasyName = systemInfo.clientFantasyName || null;
      clientId = systemInfo.clientId;
    }
    
    const entry = {
      account,
      qualifier: status.qualifier,
      state: status.state,
      eventCode: status.eventCode,
      lastEvent: status.receivedAt,
      clientName,
      clientFantasyName,
      clientId,
      systemId,
      // Mantém o nome usado pelos eventos e pelo Dashboard, sem remover o
      // campo histórico systemId consumido pelas listas operacionais.
      alarmSystemId: systemId,
      brand: systemInfo?.brand || status.brand || null,
      model: systemInfo?.model || null,
    };
    
    if (status.state === "armed") {
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

  const armDisarmCodes = [...STANDARD_ARM_DISARM_EVENT_CODES, "701", "3401", "3403", "3407", "3441", "456"];
  const activeSystems = await db.select({ id: alarmSystems.id }).from(alarmSystems).where(eq(alarmSystems.isActive, true));
  const activeSystemIds = activeSystems.map((system) => system.id);
  if (activeSystemIds.length === 0) return [];
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
      inArray(alarmEvents.alarmSystemId, activeSystemIds),
    ))
    .orderBy(desc(alarmEvents.receivedAt))
    .limit(limit);

  return rows.filter((event) => isArmDisarmStatusEvent(event)).map((event) => ({
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
