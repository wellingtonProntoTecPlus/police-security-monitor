import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json } from "drizzle-orm/mysql-core";

// ============================================================
// USERS (base auth - já existente)
// ============================================================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "partner", "operator"]).default("user").notNull(),
  partnerId: int("partnerId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================
// EMPRESA GESTORA
// ============================================================
export const managingCompanies = mysqlTable("managing_companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  cnpj: varchar("cnpj", { length: 18 }).notNull().unique(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 2 }),
  logoUrl: text("logoUrl"),
  primaryColor: varchar("primaryColor", { length: 7 }).default("#1a56db"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ManagingCompany = typeof managingCompanies.$inferSelect;
export type InsertManagingCompany = typeof managingCompanies.$inferInsert;

// ============================================================
// EMPRESA PARCEIRA
// ============================================================
export const partnerCompanies = mysqlTable("partner_companies", {
  id: int("id").autoincrement().primaryKey(),
  managingCompanyId: int("managingCompanyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  cnpj: varchar("cnpj", { length: 18 }).notNull().unique(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 2 }),
  logoUrl: text("logoUrl"),
  primaryColor: varchar("primaryColor", { length: 7 }).default("#1a56db"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PartnerCompany = typeof partnerCompanies.$inferSelect;
export type InsertPartnerCompany = typeof partnerCompanies.$inferInsert;

// ============================================================
// CLIENTES MONITORADOS
// ============================================================
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  partnerCompanyId: int("partnerCompanyId").notNull(),
  type: mysqlEnum("type", ["pf", "pj"]).notNull(),
  name: varchar("name", { length: 255 }).notNull(), // Razão Social ou Nome Completo
  fantasyName: varchar("fantasyName", { length: 255 }), // Nome Fantasia
  document: varchar("document", { length: 18 }).notNull(), // CPF ou CNPJ
  phone: varchar("phone", { length: 20 }),
  whatsapp: varchar("whatsapp", { length: 20 }),
  email: varchar("email", { length: 320 }),
  address: text("address"), // Logradouro
  number: varchar("number", { length: 20 }), // Número
  complement: varchar("complement", { length: 100 }), // Complemento
  neighborhood: varchar("neighborhood", { length: 100 }), // Bairro
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 2 }),
  zipCode: varchar("zipCode", { length: 10 }),
  latitude: varchar("latitude", { length: 20 }),
  longitude: varchar("longitude", { length: 20 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

// ============================================================
// CONTATOS DO CLIENTE
// ============================================================
export const clientContacts = mysqlTable("client_contacts", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  whatsapp: varchar("whatsapp", { length: 20 }),
  email: varchar("email", { length: 320 }),
  role: varchar("role", { length: 100 }), // ex: proprietário, responsável, zelador
  priority: int("priority").default(1).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClientContact = typeof clientContacts.$inferSelect;
export type InsertClientContact = typeof clientContacts.$inferInsert;

// ============================================================
// SISTEMA DE ALARME DO CLIENTE
// ============================================================
export const alarmSystems = mysqlTable("alarm_systems", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  account: varchar("account", { length: 10 }).notNull(), // Conta Contact ID (4 dígitos)
  brand: mysqlEnum("brand", ["JFL", "INTELBRAS", "VETTI", "COMPATEC", "RADIOENGE", "VIAWEB"]).notNull(),
  model: varchar("model", { length: 100 }),
  firmwareVersion: varchar("firmwareVersion", { length: 50 }),
  partitions: int("partitions").default(1).notNull(),
  receiverPort: int("receiverPort"), // Porta TCP do receptor
  ipAddress: varchar("ipAddress", { length: 45 }),
  isActive: boolean("isActive").default(true).notNull(),
  isOnline: boolean("isOnline").default(false).notNull(),
  lastCommunication: timestamp("lastCommunication"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AlarmSystem = typeof alarmSystems.$inferSelect;
export type InsertAlarmSystem = typeof alarmSystems.$inferInsert;

// ============================================================
// ZONAS/SETORES DO SISTEMA DE ALARME
// ============================================================
export const alarmZones = mysqlTable("alarm_zones", {
  id: int("id").autoincrement().primaryKey(),
  alarmSystemId: int("alarmSystemId").notNull(),
  zoneNumber: int("zoneNumber").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["perimeter", "internal", "24h", "fire", "panic", "medical"]).default("perimeter").notNull(),
  partition: int("partition").default(1).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AlarmZone = typeof alarmZones.$inferSelect;
export type InsertAlarmZone = typeof alarmZones.$inferInsert;

// ============================================================
// USUÁRIOS DO SISTEMA DE ALARME
// ============================================================
export const alarmUsers = mysqlTable("alarm_users", {
  id: int("id").autoincrement().primaryKey(),
  alarmSystemId: int("alarmSystemId").notNull(),
  userNumber: int("userNumber").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AlarmUser = typeof alarmUsers.$inferSelect;
export type InsertAlarmUser = typeof alarmUsers.$inferInsert;

// ============================================================
// CÂMERAS DO CLIENTE
// ============================================================
export const cameras = mysqlTable("cameras", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  rtspUrl: text("rtspUrl").notNull(),
  brand: varchar("brand", { length: 100 }),
  model: varchar("model", { length: 100 }),
  location: varchar("location", { length: 255 }), // ex: Frente, Fundos, Garagem
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Camera = typeof cameras.$inferSelect;
export type InsertCamera = typeof cameras.$inferInsert;

// ============================================================
// EVENTOS RECEBIDOS (Contact ID)
// ============================================================
export const alarmEvents = mysqlTable("alarm_events", {
  id: int("id").autoincrement().primaryKey(),
  alarmSystemId: int("alarmSystemId"),
  account: varchar("account", { length: 10 }).notNull(),
  brand: varchar("brand", { length: 50 }).notNull(),
  qualifier: varchar("qualifier", { length: 1 }).notNull(), // E=evento, R=restauro
  eventCode: varchar("eventCode", { length: 4 }).notNull(), // Código CID (ex: 130, 401)
  partition: varchar("partition", { length: 3 }),
  zoneUser: varchar("zoneUser", { length: 4 }),
  description: text("description"),
  priority: mysqlEnum("priority", ["critical", "high", "medium", "low"]).default("medium").notNull(),
  receiverPort: int("receiverPort"),
  remoteIp: varchar("remoteIp", { length: 45 }),
  rawData: text("rawData"),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
});

export type AlarmEvent = typeof alarmEvents.$inferSelect;
export type InsertAlarmEvent = typeof alarmEvents.$inferInsert;

// ============================================================
// OCORRÊNCIAS (Atendimento)
// ============================================================
export const incidents = mysqlTable("incidents", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  alarmSystemId: int("alarmSystemId"),
  clientId: int("clientId"),
  operatorId: int("operatorId"),
  status: mysqlEnum("status", ["waiting", "attending", "observing", "dispatched", "closed"]).default("waiting").notNull(),
  priority: mysqlEnum("priority", ["critical", "high", "medium", "low"]).default("medium").notNull(),
  notes: text("notes"),
  resolution: text("resolution"),
  dispatchedAt: timestamp("dispatchedAt"),
  closedAt: timestamp("closedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = typeof incidents.$inferInsert;

// ============================================================
// TABELA DE CÓDIGOS CONTACT ID
// ============================================================
export const contactIdCodes = mysqlTable("contact_id_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 4 }).notNull().unique(),
  description: varchar("description", { length: 255 }).notNull(),
  category: mysqlEnum("category", ["alarm", "restore", "fault", "arm_disarm", "test", "system", "access"]).notNull(),
  priority: mysqlEnum("priority", ["critical", "high", "medium", "low"]).default("medium").notNull(),
});

export type ContactIdCode = typeof contactIdCodes.$inferSelect;
export type InsertContactIdCode = typeof contactIdCodes.$inferInsert;
