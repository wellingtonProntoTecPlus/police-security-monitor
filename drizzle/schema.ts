import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json, uniqueIndex } from "drizzle-orm/mysql-core";

// ============================================================
// USERS (base auth - já existente)
// ============================================================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "supervisor", "operator", "partner"]).default("operator").notNull(),
  partnerId: int("partnerId"),
  password: varchar("password", { length: 255 }),
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
  whatsapp: varchar("whatsapp", { length: 20 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 2 }),
  zipCode: varchar("zipCode", { length: 10 }),
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
  whatsapp: varchar("whatsapp", { length: 20 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 2 }),
  zipCode: varchar("zipCode", { length: 10 }),
  logoUrl: text("logoUrl"),
  primaryColor: varchar("primaryColor", { length: 7 }).default("#1a56db"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PartnerCompany = typeof partnerCompanies.$inferSelect;
export type InsertPartnerCompany = typeof partnerCompanies.$inferInsert;

// ============================================================
// TÁTICO MÓVEL DAS EMPRESAS PARCEIRAS
// ============================================================
export const tacticalMobiles = mysqlTable("tactical_mobiles", {
  id: int("id").autoincrement().primaryKey(),
  partnerCompanyId: int("partnerCompanyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  whatsapp: varchar("whatsapp", { length: 20 }),
  vehicle: varchar("vehicle", { length: 120 }),
  plate: varchar("plate", { length: 12 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TacticalMobile = typeof tacticalMobiles.$inferSelect;
export type InsertTacticalMobile = typeof tacticalMobiles.$inferInsert;

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
  alarmSystemId: int("alarmSystemId"),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  whatsapp: varchar("whatsapp", { length: 20 }),
  email: varchar("email", { length: 320 }),
  role: varchar("role", { length: 100 }), // ex: proprietário, responsável, zelador
  password: varchar("password", { length: 50 }), // Senha
  counterPassword: varchar("counterPassword", { length: 50 }), // Contra-Senha
  coercionPassword: varchar("coercionPassword", { length: 50 }), // Senha de Coação
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
  communicationType: mysqlEnum("communicationType", ["ethernet", "gprs", "both"]).default("ethernet").notNull(),
  macAddress: varchar("macAddress", { length: 6 }), // Últimos 6 caracteres do MAC Ethernet
  imeiGprs: varchar("imeiGprs", { length: 6 }), // Últimos 6 dígitos do IMEI GPRS
  serialNumber: varchar("serialNumber", { length: 10 }).unique(), // Serial de 10 dígitos para modelos que o exigem
  isepId: varchar("isepId", { length: 4 }), // Identificador ISEP gerado pelo sistema
  viawebCode: varchar("viawebCode", { length: 4 }), // Código ViaWeb 4 dígitos
  partitions: int("partitions").default(1).notNull(), // Até 8
  receiverPort: int("receiverPort"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  installDate: timestamp("installDate"),
  batteryDate: timestamp("batteryDate"),
  isActive: boolean("isActive").default(true).notNull(),
  isOnline: boolean("isOnline").default(false).notNull(),
  lastCommunication: timestamp("lastCommunication"),
  lastKeepAliveAt: timestamp("lastKeepAliveAt"),
  lastKeepAliveIntervalMs: int("lastKeepAliveIntervalMs"),
  keepAliveMonitoringEnabled: boolean("keepAliveMonitoringEnabled").default(true).notNull(),
  keepAliveExpectedIntervalSeconds: int("keepAliveExpectedIntervalSeconds").default(60).notNull(),
  keepAliveFailureEventEnabled: boolean("keepAliveFailureEventEnabled").default(false).notNull(),
  keepAliveOfflineAfterMinutes: int("keepAliveOfflineAfterMinutes").default(5).notNull(),
  keepAliveDisconnectAlertEnabled: boolean("keepAliveDisconnectAlertEnabled").default(true).notNull(),
  keepAliveRepeatAlertEnabled: boolean("keepAliveRepeatAlertEnabled").default(false).notNull(),
  keepAliveRepeatAlertEveryMinutes: int("keepAliveRepeatAlertEveryMinutes").default(60).notNull(),
  maintenanceStartAt: timestamp("maintenanceStartAt"),
  maintenanceEndAt: timestamp("maintenanceEndAt"),
  maintenanceNotes: text("maintenanceNotes"),
  maintenanceOperatorId: int("maintenanceOperatorId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AlarmSystem = typeof alarmSystems.$inferSelect;
export type InsertAlarmSystem = typeof alarmSystems.$inferInsert;

// ============================================================
// AMOSTRAS DE KEEP ALIVE POR CENTRAL
// ============================================================
export const systemKeepAliveSamples = mysqlTable("system_keep_alive_samples", {
  id: int("id").autoincrement().primaryKey(),
  alarmSystemId: int("alarmSystemId").notNull(),
  brand: varchar("brand", { length: 30 }).notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
  intervalMs: int("intervalMs"),
});

export type SystemKeepAliveSample = typeof systemKeepAliveSamples.$inferSelect;

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
  password: varchar("password", { length: 50 }),
  counterPassword: varchar("counterPassword", { length: 50 }),
  coercionPassword: varchar("coercionPassword", { length: 50 }),
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
  autoFinalized: boolean("autoFinalized").default(false).notNull(),
  autoFinalizationReason: varchar("autoFinalizationReason", { length: 255 }),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
});

export type AlarmEvent = typeof alarmEvents.$inferSelect;
export type InsertAlarmEvent = typeof alarmEvents.$inferInsert;

// ============================================================
// CONTAS TÉCNICAS DO SISTEMA
// ============================================================
export const systemTechnicalAccounts = mysqlTable("system_technical_accounts", {
  id: int("id").autoincrement().primaryKey(),
  account: varchar("account", { length: 10 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SystemTechnicalAccount = typeof systemTechnicalAccounts.$inferSelect;
export type InsertSystemTechnicalAccount = typeof systemTechnicalAccounts.$inferInsert;

// ============================================================
// OCORRÊNCIAS (Atendimento)
// ============================================================
export const incidents = mysqlTable("incidents", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  alarmSystemId: int("alarmSystemId"),
  clientId: int("clientId"),
  operatorId: int("operatorId"),
  status: mysqlEnum("status", ["waiting", "attending", "observing", "dispatched", "maintenance", "closed"]).default("waiting").notNull(),
  priority: mysqlEnum("priority", ["critical", "high", "medium", "low"]).default("medium").notNull(),
  notes: text("notes"),
  resolution: text("resolution"),
  dispatchedAt: timestamp("dispatchedAt"),
  observationUntil: timestamp("observationUntil"),
  closedAt: timestamp("closedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("incidents_event_id_unique").on(table.eventId)]);

export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = typeof incidents.$inferInsert;

// ============================================================
// TABELA DE CÓDIGOS CONTACT ID
// ============================================================
export const contactIdCodes = mysqlTable("contact_id_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 10 }).notNull(),
  qualifier: mysqlEnum("qualifier", ["E", "R", "both"]).default("E").notNull(),
  fabricante: varchar("fabricante", { length: 20 }).notNull().default("COMPATEC"),
  isUniversal: boolean("isUniversal").default(false).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  tipo: varchar("tipo", { length: 20 }).notNull().default("alarme"),
  cor: varchar("cor", { length: 10 }).notNull().default("#EF4444"),
  abreTela: int("abre_tela").notNull().default(1),
  fechaAutomatico: int("fecha_automatico").notNull().default(0),
  fechaComRestauracao: int("fecha_com_restauracao").notNull().default(0),
  codigoRestauracao: varchar("codigo_restauracao", { length: 10 }).default(""),
  tempoEsperaSegundos: int("tempo_espera_segundos").notNull().default(0),
  prioridade: int("prioridade").notNull().default(1),
  category: mysqlEnum("category", ["alarm", "restore", "fault", "arm_disarm", "test", "system", "access", "analytics"]).default("alarm").notNull(),
  priority: mysqlEnum("priority", ["critical", "high", "medium", "low"]).default("medium"),
});

export type ContactIdCode = typeof contactIdCodes.$inferSelect;
export type InsertContactIdCode = typeof contactIdCodes.$inferInsert;

// ============================================================
// PGMs DO SISTEMA DE ALARME (até 16)
// ============================================================
export const alarmPgms = mysqlTable("alarm_pgms", {
  id: int("id").autoincrement().primaryKey(),
  alarmSystemId: int("alarmSystemId").notNull(),
  pgmNumber: int("pgmNumber").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 100 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AlarmPgm = typeof alarmPgms.$inferSelect;
export type InsertAlarmPgm = typeof alarmPgms.$inferInsert;

// ============================================================
// TABELA DE HORÁRIOS (Arme/Desarme programado)
// ============================================================
export const alarmSchedules = mysqlTable("alarm_schedules", {
  id: int("id").autoincrement().primaryKey(),
  alarmSystemId: int("alarmSystemId").notNull(),
  partition: int("partition").default(1).notNull(),
  name: varchar("name", { length: 255 }),
  mondayArm: varchar("mondayArm", { length: 5 }),
  mondayDisarm: varchar("mondayDisarm", { length: 5 }),
  tuesdayArm: varchar("tuesdayArm", { length: 5 }),
  tuesdayDisarm: varchar("tuesdayDisarm", { length: 5 }),
  wednesdayArm: varchar("wednesdayArm", { length: 5 }),
  wednesdayDisarm: varchar("wednesdayDisarm", { length: 5 }),
  thursdayArm: varchar("thursdayArm", { length: 5 }),
  thursdayDisarm: varchar("thursdayDisarm", { length: 5 }),
  fridayArm: varchar("fridayArm", { length: 5 }),
  fridayDisarm: varchar("fridayDisarm", { length: 5 }),
  saturdayArm: varchar("saturdayArm", { length: 5 }),
  saturdayDisarm: varchar("saturdayDisarm", { length: 5 }),
  sundayArm: varchar("sundayArm", { length: 5 }),
  sundayDisarm: varchar("sundayDisarm", { length: 5 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AlarmSchedule = typeof alarmSchedules.$inferSelect;
export type InsertAlarmSchedule = typeof alarmSchedules.$inferInsert;

// ============================================================
// PROVIDÊNCIAS DO CLIENTE (instruções para o operador)
// ============================================================
export const clientProcedures = mysqlTable("client_procedures", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  priority: int("priority").default(1).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClientProcedure = typeof clientProcedures.$inferSelect;
export type InsertClientProcedure = typeof clientProcedures.$inferInsert;

// ============================================================
// FERIADOS DA EMPRESA PARCEIRA
// ============================================================
export const partnerHolidays = mysqlTable("partner_holidays", {
  id: int("id").autoincrement().primaryKey(),
  partnerCompanyId: int("partnerCompanyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // DD/MM/YYYY
  type: mysqlEnum("type", ["nacional", "municipal"]).default("municipal").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PartnerHoliday = typeof partnerHolidays.$inferSelect;
export type InsertPartnerHoliday = typeof partnerHolidays.$inferInsert;

// ============================================================
// OCORRÊNCIAS FINALIZADAS (histórico de atendimentos)
// ============================================================
export const occurrences = mysqlTable("occurrences", {
  id: int("id").autoincrement().primaryKey(),
  // Dados do evento
  account: varchar("account", { length: 20 }).notNull(),
  eventCode: varchar("eventCode", { length: 10 }).notNull(),
  qualifier: varchar("qualifier", { length: 2 }),
  partition: varchar("partition", { length: 5 }),
  zoneUser: varchar("zoneUser", { length: 10 }),
  description: text("description"),
  priority: varchar("priority", { length: 20 }),
  brand: varchar("brand", { length: 50 }),
  // Dados do cliente
  clientId: int("clientId"),
  clientName: varchar("clientName", { length: 255 }),
  systemId: int("systemId"),
  partnerCompanyId: int("partnerCompanyId"),
  // Dados do atendimento
  operatorId: int("operatorId"),
  operatorName: varchar("operatorName", { length: 255 }),
  status: mysqlEnum("status", ["finalized", "cancelled", "escalated"]).default("finalized").notNull(),
  observations: text("observations"),
  logs: text("logs"), // JSON array de logs do operador
  attendingTimeMs: int("attendingTimeMs"), // tempo de atendimento em ms
  sendEmail: boolean("sendEmail").default(false),
  sendPush: boolean("sendPush").default(false),
  // Timestamps
  eventReceivedAt: timestamp("eventReceivedAt"),
  startedAt: timestamp("startedAt"),
  finalizedAt: timestamp("finalizedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Occurrence = typeof occurrences.$inferSelect;
export type InsertOccurrence = typeof occurrences.$inferInsert;
// ============================================================
// FERIADOS DA EMPRESA GESTORA
// ============================================================
export const managingHolidays = mysqlTable("managing_holidays", {
  id: int("id").autoincrement().primaryKey(),
  managingCompanyId: int("managingCompanyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  recurring: boolean("recurring").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ManagingHoliday = typeof managingHolidays.$inferSelect;
export type InsertManagingHoliday = typeof managingHolidays.$inferInsert;

// ============================================================
// FINALIZAÇÕES AUTOMÁTICAS (textos de finalização rápida)
// ============================================================
export const finalizations = mysqlTable("finalizations", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull().default("outros"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Finalization = typeof finalizations.$inferSelect;
export type InsertFinalization = typeof finalizations.$inferInsert;
