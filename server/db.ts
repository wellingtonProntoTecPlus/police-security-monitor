import { eq, and, desc, sql, like, inArray } from "drizzle-orm";
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
  const result = await db.insert(managingCompanies).values(data);
  return { id: result[0].insertId };
}

export async function updateManagingCompany(id: number, data: Partial<InsertManagingCompany>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(managingCompanies).set(data).where(eq(managingCompanies.id, id));
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
  const result = await db.insert(partnerCompanies).values(data);
  return { id: result[0].insertId };
}

export async function updatePartnerCompany(id: number, data: Partial<InsertPartnerCompany>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(partnerCompanies).set(data).where(eq(partnerCompanies.id, id));
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
export async function getContactIdDescription(code: string) {
  const db = await getDb();
  if (!db) return undefined;
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
