import { eq, and, desc, sql, like, inArray, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  managingCompanies, InsertManagingCompany,
  partnerCompanies, InsertPartnerCompany,
  clients, InsertClient,
  clientContacts, InsertClientContact,
  alarmSystems, InsertAlarmSystem,
  alarmZones, InsertAlarmZone,
  alarmUsers, InsertAlarmUser,
  cameras, InsertCamera,
  alarmEvents, InsertAlarmEvent,
  incidents, InsertIncident,
  contactIdCodes,
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

let _db: ReturnType<typeof drizzle> | null = null;

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
  if (!cleanData.name || !cleanData.cnpj || !cleanData.managingCompanyId) throw new Error("Nome, CNPJ e Empresa Gestora são obrigatórios");
  const result = await db.insert(partnerCompanies).values(cleanData as InsertPartnerCompany);
  return { id: result[0].insertId };
}

export async function updatePartnerCompany(id: number, data: Partial<InsertPartnerCompany>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Filtrar campos undefined
  const cleanData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) cleanData[key] = value;
  }
  if (Object.keys(cleanData).length === 0) return;
  await db.update(partnerCompanies).set(cleanData).where(eq(partnerCompanies.id, id));
}

// ============================================================
// CLIENTS
// ============================================================
export async function listClients(partnerCompanyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (partnerCompanyId) {
    return db.select().from(clients).where(eq(clients.partnerCompanyId, partnerCompanyId)).orderBy(clients.name);
  }
  return db.select().from(clients).orderBy(clients.name);
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
  const result = await db.insert(clients).values(data);
  return { id: result[0].insertId };
}

export async function updateClient(id: number, data: Partial<InsertClient>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clients).set(data).where(eq(clients.id, id));
}

// ============================================================
// CLIENT CONTACTS
// ============================================================
export async function listClientContacts(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clientContacts).where(eq(clientContacts.clientId, clientId)).orderBy(clientContacts.priority);
}

export async function createClientContact(data: InsertClientContact) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clientContacts).values(data);
  return { id: result[0].insertId };
}

export async function updateClientContact(id: number, data: Partial<InsertClientContact>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clientContacts).set(data).where(eq(clientContacts.id, id));
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

export async function getAlarmSystem(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(alarmSystems).where(eq(alarmSystems.id, id)).limit(1);
  return result[0];
}

export async function createAlarmSystem(data: InsertAlarmSystem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(alarmSystems).values(data);
  return { id: result[0].insertId };
}

export async function updateAlarmSystem(id: number, data: Partial<InsertAlarmSystem>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(alarmSystems).set(data).where(eq(alarmSystems.id, id));
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
  const result = await db.insert(alarmZones).values(data);
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
  const result = await db.insert(alarmUsers).values(data);
  return { id: result[0].insertId };
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
  const result = await db.insert(cameras).values(data);
  return { id: result[0].insertId };
}

export async function updateCamera(id: number, data: Partial<InsertCamera>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(cameras).set(data).where(eq(cameras.id, id));
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

export async function listAlarmEvents(limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(alarmEvents).orderBy(desc(alarmEvents.receivedAt)).limit(limit).offset(offset);
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

// ============================================================
// CONTACT ID CODES
// ============================================================
export async function getContactIdDescription(code: string, qualifier?: string) {
  const db = await getDb();
  if (!db) return undefined;
  // Primeiro tenta buscar com qualifier exato
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
  const [onlineResult] = await db.select({ count: sql<number>`count(*)` }).from(alarmSystems).where(eq(alarmSystems.isOnline, true));

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const [eventsResult] = await db.select({ count: sql<number>`count(*)` }).from(alarmEvents).where(sql`${alarmEvents.receivedAt} >= ${fiveMinAgo}`);

  return {
    activeConnections: onlineResult?.count ?? 0,
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
  const result = await db.insert(alarmPgms).values(data);
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
  const result = await db.insert(alarmSchedules).values(data);
  return { id: result[0].insertId };
}

export async function updateAlarmSchedule(id: number, data: Partial<InsertAlarmSchedule>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(alarmSchedules).set(data).where(eq(alarmSchedules.id, id));
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
  const result = await db.insert(clientProcedures).values(data);
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
  const result = await db.insert(partnerHolidays).values(data);
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
  await db.update(partnerHolidays).set(data).where(eq(partnerHolidays.id, id));
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

export async function listOccurrences(opts?: { limit?: number; offset?: number; account?: string; clientId?: number; partnerCompanyId?: number; dateFrom?: string; dateTo?: string; operatorName?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts?.account?.trim()) conditions.push(like(occurrences.account, `%${opts.account.trim()}%`));
  if (opts?.operatorName?.trim()) conditions.push(like(occurrences.operatorName, `%${opts.operatorName.trim()}%`));
  if (opts?.clientId) conditions.push(eq(occurrences.clientId, opts.clientId));
  if (opts?.partnerCompanyId) conditions.push(eq(occurrences.partnerCompanyId, opts.partnerCompanyId));
  if (opts?.dateFrom) conditions.push(gte(occurrences.finalizedAt, new Date(`${opts.dateFrom}T00:00:00`)));
  if (opts?.dateTo) conditions.push(lte(occurrences.finalizedAt, new Date(`${opts.dateTo}T23:59:59.999`)));
  let query = db.select().from(occurrences);
  if (conditions.length) query = query.where(and(...conditions)) as any;
  query = query.orderBy(desc(occurrences.finalizedAt)).limit(opts?.limit || 100) as any;
  if (opts?.offset) query = query.offset(opts.offset) as any;
  return query;
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
  await db.update(alarmZones).set(data).where(eq(alarmZones.id, id));
}

export async function deleteAlarmZone(id: number) {
  const db = await getDb(); if (!db) return;
  await db.delete(alarmZones).where(eq(alarmZones.id, id));
}

export async function updateAlarmUser(id: number, data: Partial<InsertAlarmUser>) {
  const db = await getDb(); if (!db) return;
  await db.update(alarmUsers).set(data).where(eq(alarmUsers.id, id));
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
  await db.delete(partnerCompanies).where(eq(partnerCompanies.id, id));
}

export async function deleteClient(id: number) {
  const db = await getDb(); if (!db) return;
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
    name: data.name,
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
  const values = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== ""));
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
    .where(inArray(alarmEvents.eventCode, armDisarmCodes))
    .orderBy(desc(alarmEvents.receivedAt));
  
  // Agrupar por conta: pegar o último evento de cada conta
  const accountStatus = new Map<string, { account: string; qualifier: string; receivedAt: Date | null; alarmSystemId: number | null }>();
  for (const ev of lastEvents) {
    if (!accountStatus.has(ev.account)) {
      accountStatus.set(ev.account, {
        account: ev.account,
        qualifier: ev.qualifier,
        receivedAt: ev.receivedAt,
        alarmSystemId: ev.alarmSystemId,
      });
    }
  }
  
  const armed: any[] = [];
  const disarmed: any[] = [];

  for (const [account, status] of Array.from(accountStatus.entries())) {
    let clientName = `Conta ${account}`;
    let clientId: number | null = null;
    let systemId = status.alarmSystemId;
    
    if (status.alarmSystemId) {
      const systemInfo = await db.select().from(alarmSystems).where(eq(alarmSystems.id, status.alarmSystemId)).limit(1);
      if (systemInfo.length > 0 && systemInfo[0].clientId) {
        const clientInfo = await db.select().from(clients).where(eq(clients.id, systemInfo[0].clientId)).limit(1);
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
  const result = await db.insert(finalizations).values(data);
  return { id: result[0].insertId };
}

export async function updateFinalization(id: number, data: Partial<InsertFinalization>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(finalizations).set(data).where(eq(finalizations.id, id));
}

export async function deleteFinalization(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(finalizations).where(eq(finalizations.id, id));
}
