import { bigint, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json, uniqueIndex } from "drizzle-orm/mysql-core";

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

// Uma sessão de navegador por operador. O valor bruto do cookie nunca é gravado;
// a tabela guarda somente SHA-256, permitindo revogação imediata no login seguinte.
export const authSessions = mysqlTable("auth_sessions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
}, (table) => [index("auth_sessions_user_active_idx").on(table.userId, table.revokedAt, table.expiresAt)]);
export type AuthSession = typeof authSessions.$inferSelect;

/** Faixas permanentes da escala. A vigência histórica é preservada ao trocar turno. */
export const operatorShiftAssignments = mysqlTable("operator_shift_assignments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  operatorName: varchar("operatorName", { length: 255 }).notNull(),
  shiftCode: mysqlEnum("shiftCode", ["first", "second", "third", "commercial"]).notNull(),
  cycleAnchorDate: varchar("cycleAnchorDate", { length: 10 }).notNull(),
  effectiveFromDate: varchar("effectiveFromDate", { length: 10 }).notNull(),
  effectiveUntilDate: varchar("effectiveUntilDate", { length: 10 }),
  isActive: boolean("isActive").default(true).notNull(),
  changeReason: varchar("changeReason", { length: 500 }),
  changedBy: int("changedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("operator_shift_assignments_user_effective_idx").on(table.userId, table.effectiveFromDate, table.effectiveUntilDate)]);

/** Exceção de um único dia: substitui a paridade regular sem alterá-la. */
export const operatorShiftExceptions = mysqlTable("operator_shift_exceptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  operatorName: varchar("operatorName", { length: 255 }).notNull(),
  workDate: varchar("workDate", { length: 10 }).notNull(),
  kind: mysqlEnum("kind", ["work", "off"]).notNull(),
  shiftCode: mysqlEnum("shiftCode", ["first", "second", "third", "commercial"]),
  pairedUserId: int("pairedUserId"),
  pairedOperatorName: varchar("pairedOperatorName", { length: 255 }),
  reason: varchar("reason", { length: 500 }).notNull(),
  createdBy: int("createdBy").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  cancelledAt: timestamp("cancelledAt"),
  cancelledBy: int("cancelledBy"),
}, (table) => [index("operator_shift_exceptions_user_date_active_idx").on(table.userId, table.workDate, table.isActive)]);

/** Presença real: uma linha por sessão autenticada, com a causa de encerramento explícita. */
export const operatorAttendanceRecords = mysqlTable("operator_attendance_records", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  authSessionId: bigint("authSessionId", { mode: "number" }).notNull().unique(),
  userId: int("userId").notNull(),
  operatorName: varchar("operatorName", { length: 255 }).notNull(),
  role: varchar("role", { length: 30 }).notNull(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  loginAt: timestamp("loginAt").defaultNow().notNull(),
  logoutAt: timestamp("logoutAt"),
  logoutReason: mysqlEnum("logoutReason", ["logout", "session_replaced", "session_expired", "revoked"]),
  shiftCode: mysqlEnum("shiftCode", ["first", "second", "third", "commercial"]),
  scheduleStatus: mysqlEnum("scheduleStatus", ["scheduled", "outside_window"]),
  outOfScheduleReason: mysqlEnum("outOfScheduleReason", ["scale_swap", "double_shift", "vacation_coverage"]),
  outOfScheduleDecisionAt: timestamp("outOfScheduleDecisionAt"),
  workDate: varchar("workDate", { length: 10 }),
  scheduledStartAt: timestamp("scheduledStartAt"),
  scheduledEndAt: timestamp("scheduledEndAt"),
}, (table) => [
  index("operator_attendance_user_login_idx").on(table.userId, table.loginAt),
  index("operator_attendance_open_idx").on(table.logoutAt, table.userId),
]);

/** Aviso de término do turno, único por sessão/turno/antecedência. */
export const operatorShiftReminders = mysqlTable("operator_shift_reminders", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  attendanceId: bigint("attendanceId", { mode: "number" }).notNull(),
  userId: int("userId").notNull(),
  operatorName: varchar("operatorName", { length: 255 }).notNull(),
  shiftCode: mysqlEnum("shiftCode", ["first", "second", "third", "commercial"]).notNull(),
  workDate: varchar("workDate", { length: 10 }).notNull(),
  minutesBefore: int("minutesBefore").notNull(),
  shiftEndsAt: timestamp("shiftEndsAt").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  acknowledgedAt: timestamp("acknowledgedAt"),
}, (table) => [
  uniqueIndex("operator_shift_reminder_unique").on(table.attendanceId, table.workDate, table.shiftCode, table.minutesBefore),
  index("operator_shift_reminder_pending_idx").on(table.userId, table.acknowledgedAt, table.sentAt),
]);

/** Caixa de passagem privada, com snapshot dos nomes e vínculo opcional à ocorrência. */
export const operatorShiftMessages = mysqlTable("operator_shift_messages", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  fromUserId: int("fromUserId").notNull(),
  fromOperatorName: varchar("fromOperatorName", { length: 255 }).notNull(),
  fromAttendanceId: bigint("fromAttendanceId", { mode: "number" }).notNull(),
  toUserId: int("toUserId").notNull(),
  toOperatorName: varchar("toOperatorName", { length: 255 }).notNull(),
  incidentId: int("incidentId"),
  account: varchar("account", { length: 20 }),
  message: text("message").notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("operator_shift_message_inbox_idx").on(table.toUserId, table.readAt, table.createdAt),
  index("operator_shift_message_incident_idx").on(table.incidentId, table.createdAt),
]);

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
  cnpj: varchar("cnpj", { length: 18 }).unique(),
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

/** Um cliente e a sua própria parceira podem partilhar o mesmo documento; não se repete dentro da mesma categoria. */
export const registrationDocuments = mysqlTable("registration_documents", {
  id: int("id").autoincrement().primaryKey(),
  document: varchar("document", { length: 18 }).notNull(),
  ownerType: varchar("ownerType", { length: 20 }).notNull(),
  ownerId: int("ownerId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("registration_documents_document_ownerType_unique").on(table.document, table.ownerType)]);

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
  propertyType: mysqlEnum("propertyType", ["residence", "company", "condominium"]).default("residence").notNull(),
  name: varchar("name", { length: 255 }).notNull(), // Razão Social ou Nome Completo
  fantasyName: varchar("fantasyName", { length: 255 }), // Nome Fantasia
  document: varchar("document", { length: 18 }), // CPF ou CNPJ opcional
  isPartnerHeadquarters: boolean("isPartnerHeadquarters").default(false).notNull(),
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
  monitoringStatus: mysqlEnum("monitoringStatus", ["active", "blocked", "suspended"]).default("active").notNull(),
  monitoringStatusReason: varchar("monitoringStatusReason", { length: 255 }),
  monitoringStatusUntil: timestamp("monitoringStatusUntil"),
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
  simCardNumber: varchar("simCardNumber", { length: 50 }),
  simPhoneNumber: varchar("simPhoneNumber", { length: 30 }),
  serialNumber: varchar("serialNumber", { length: 10 }).unique(), // Serial de 10 dígitos para modelos que o exigem
  isepId: varchar("isepId", { length: 4 }), // Identificador ISEP gerado pelo sistema
  viawebCode: varchar("viawebCode", { length: 4 }), // Código ViaWeb 4 dígitos
  partitions: int("partitions").default(1).notNull(), // Até 8
  receiverPort: int("receiverPort"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  installDate: timestamp("installDate"),
  batteryDate: timestamp("batteryDate"),
  isActive: boolean("isActive").default(true).notNull(),
  remoteCommandLabEnabled: boolean("remoteCommandLabEnabled").default(false).notNull(),
  isOnline: boolean("isOnline").default(false).notNull(),
  lastCommunication: timestamp("lastCommunication"),
  lastKeepAliveAt: timestamp("lastKeepAliveAt"),
  lastKeepAliveIntervalMs: bigint("lastKeepAliveIntervalMs", { mode: "number" }),
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
// CREDENCIAL TÉCNICA PARA COMANDO REMOTO
// ============================================================
// A credencial é mantida em tabela própria e cifrada no servidor. Ela nunca é
// retornada em consultas de sistemas, relatórios ou histórico operacional.
export const alarmRemoteCredentials = mysqlTable("alarm_remote_credentials", {
  id: int("id").autoincrement().primaryKey(),
  alarmSystemId: int("alarmSystemId").notNull(),
  credentialKind: varchar("credentialKind", { length: 40 }).notNull(),
  technicalUserCode: varchar("technicalUserCode", { length: 20 }),
  encryptedSecret: text("encryptedSecret").notNull(),
  updatedBy: int("updatedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("alarm_remote_credentials_system_kind_unique").on(table.alarmSystemId, table.credentialKind),
]);

export type AlarmRemoteCredential = typeof alarmRemoteCredentials.$inferSelect;
export type InsertAlarmRemoteCredential = typeof alarmRemoteCredentials.$inferInsert;

// ============================================================
// AMOSTRAS DE KEEP ALIVE POR CENTRAL
// ============================================================
export const systemKeepAliveSamples = mysqlTable("system_keep_alive_samples", {
  id: int("id").autoincrement().primaryKey(),
  alarmSystemId: int("alarmSystemId").notNull(),
  brand: varchar("brand", { length: 30 }).notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
  intervalMs: bigint("intervalMs", { mode: "number" }),
}, (table) => [
  index("system_keep_alive_samples_system_received").on(table.alarmSystemId, table.receivedAt),
]);

export type SystemKeepAliveSample = typeof systemKeepAliveSamples.$inferSelect;

// ============================================================
// ALERTAS DE DESCONEXÃO POR KEEP ALIVE
// ============================================================
export const systemDisconnectAlerts = mysqlTable("system_disconnect_alerts", {
  id: int("id").autoincrement().primaryKey(),
  alarmSystemId: int("alarmSystemId").notNull(),
  outageStartedAt: timestamp("outageStartedAt").notNull(),
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  eventId: int("eventId"),
  incidentId: int("incidentId"),
  restoredAt: timestamp("restoredAt"),
  restoredKeepAliveAt: timestamp("restoredKeepAliveAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("system_disconnect_alerts_system_outage_unique").on(table.alarmSystemId, table.outageStartedAt),
]);

export type SystemDisconnectAlert = typeof systemDisconnectAlerts.$inferSelect;

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
  apartmentNumber: varchar("apartmentNumber", { length: 30 }),
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
  // Referência preenchida somente quando o evento é associado de forma
  // transacional a um comando remoto que a central já confirmou.
  remoteCommandId: int("remoteCommandId"),
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
}, (table) => [
  index("alarm_events_received_idx").on(table.receivedAt, table.id),
  index("alarm_events_system_code_received_idx").on(table.alarmSystemId, table.eventCode, table.receivedAt),
  index("alarm_events_code_system_received_idx").on(table.eventCode, table.alarmSystemId, table.receivedAt),
  index("alarm_events_auto_event_received_idx").on(table.autoFinalized, table.eventCode, table.receivedAt),
  index("alarm_events_account_received_idx").on(table.account, table.receivedAt, table.id),
]);

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
  parentIncidentId: int("parentIncidentId"),
  alarmSystemId: int("alarmSystemId"),
  clientId: int("clientId"),
  operatorId: int("operatorId"),
  status: mysqlEnum("status", ["waiting", "attending", "observing", "dispatched", "maintenance", "closed"]).default("waiting").notNull(),
  version: int("version").default(0).notNull(),
  claimedAt: timestamp("claimedAt"),
  priority: mysqlEnum("priority", ["critical", "high", "medium", "low"]).default("medium").notNull(),
  notes: text("notes"),
  resolution: text("resolution"),
  dispatchedAt: timestamp("dispatchedAt"),
  observationUntil: timestamp("observationUntil"),
  closedAt: timestamp("closedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("incidents_event_id_idx").on(table.eventId),
  index("incidents_parent_status_idx").on(table.parentIncidentId, table.status),
]);

export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = typeof incidents.$inferInsert;

export const incidentHistory = mysqlTable("incident_history", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  incidentId: int("incidentId").notNull(),
  parentIncidentId: int("parentIncidentId"),
  operatorId: int("operatorId"),
  operatorName: varchar("operatorName", { length: 255 }).notNull(),
  action: varchar("action", { length: 40 }).notNull(),
  statusBefore: varchar("statusBefore", { length: 24 }),
  statusAfter: varchar("statusAfter", { length: 24 }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("incident_history_incident_created_idx").on(table.incidentId, table.createdAt)]);
export type IncidentHistory = typeof incidentHistory.$inferSelect;

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
// COMANDOS REMOTOS AUDITÁVEIS (SIMULAÇÃO OU ENVIO CONTROLADO)
// ============================================================
export const alarmRemoteCommands = mysqlTable("alarm_remote_commands", {
  id: int("id").autoincrement().primaryKey(),
  alarmSystemId: int("alarmSystemId").notNull(),
  incidentId: int("incidentId"),
  operatorId: int("operatorId").notNull(),
  // Código técnico não sigiloso usado para o comando (ex.: usuário Vetti 399).
  // A senha permanece somente na tabela de credenciais cifradas.
  technicalUserCode: varchar("technicalUserCode", { length: 20 }),
  brand: varchar("brand", { length: 30 }).notNull(),
  commandType: varchar("commandType", { length: 40 }).notNull(),
  transportMode: varchar("transportMode", { length: 20 }).notNull().default("simulation"),
  status: varchar("status", { length: 30 }).notNull().default("simulated"),
  partition: int("partition"),
  zoneNumber: int("zoneNumber"),
  pgmNumber: int("pgmNumber"),
  reason: text("reason").notNull(),
  commandPayload: text("commandPayload").notNull(),
  responsePayload: text("responsePayload"),
  // A confirmação do painel é distinta do estado final da fila. Ela permite
  // associar somente o evento que chega logo após um comando aceito.
  panelConfirmedAt: timestamp("panelConfirmedAt"),
  remoteEventId: int("remoteEventId"),
  confirmedAt: timestamp("confirmedAt").defaultNow().notNull(),
  executedAt: timestamp("executedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AlarmRemoteCommand = typeof alarmRemoteCommands.$inferSelect;
export type InsertAlarmRemoteCommand = typeof alarmRemoteCommands.$inferInsert;

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
  holidayArm: varchar("holidayArm", { length: 5 }),
  holidayDisarm: varchar("holidayDisarm", { length: 5 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AlarmSchedule = typeof alarmSchedules.$inferSelect;
export type InsertAlarmSchedule = typeof alarmSchedules.$inferInsert;

// Exceções excepcionais por data e sistema: suspensão integral ou sobreposição
// pontual dos horários semanais/feriado, sempre com solicitante e motivo.
export const alarmScheduleOverrides = mysqlTable("alarm_schedule_overrides", {
  id: int("id").autoincrement().primaryKey(),
  alarmSystemId: int("alarmSystemId").notNull(),
  overrideDate: varchar("overrideDate", { length: 10 }).notNull(), // YYYY-MM-DD
  mode: mysqlEnum("mode", ["suspended", "override"]).notNull(),
  armAt: varchar("armAt", { length: 5 }),
  disarmAt: varchar("disarmAt", { length: 5 }),
  validFromAt: timestamp("validFromAt"),
  validUntilAt: timestamp("validUntilAt"),
  requester: varchar("requester", { length: 255 }).notNull(),
  reason: text("reason").notNull(),
  createdBy: int("createdBy").notNull(),
  updatedBy: int("updatedBy").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("alarm_schedule_overrides_system_date_unique").on(table.alarmSystemId, table.overrideDate)]);
export type AlarmScheduleOverride = typeof alarmScheduleOverrides.$inferSelect;
export type InsertAlarmScheduleOverride = typeof alarmScheduleOverrides.$inferInsert;

export const alarmScheduleOverrideAudit = mysqlTable("alarm_schedule_override_audit", {
  id: int("id").autoincrement().primaryKey(),
  overrideId: int("overrideId"),
  alarmSystemId: int("alarmSystemId").notNull(),
  overrideDate: varchar("overrideDate", { length: 10 }).notNull(),
  action: mysqlEnum("action", ["created", "updated", "cancelled"]).notNull(),
  operatorId: int("operatorId").notNull(),
  operatorName: varchar("operatorName", { length: 255 }).notNull(),
  requester: varchar("requester", { length: 255 }).notNull(),
  reason: text("reason").notNull(),
  previousSettings: text("previousSettings"),
  newSettings: text("newSettings"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AlarmScheduleOverrideAudit = typeof alarmScheduleOverrideAudit.$inferSelect;

export const alarmScheduleAlerts = mysqlTable("alarm_schedule_alerts", {
  id: int("id").autoincrement().primaryKey(),
  alarmSystemId: int("alarmSystemId").notNull(),
  scheduleId: int("scheduleId"),
  sourceEventId: int("sourceEventId"),
  alertType: mysqlEnum("alertType", ["missed_arm", "unexpected_disarm"]).notNull(),
  dedupeKey: varchar("dedupeKey", { length: 191 }).notNull().unique(),
  alertDate: varchar("alertDate", { length: 10 }).notNull(), // YYYY-MM-DD no horário operacional
  expectedAt: timestamp("expectedAt"),
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  currentState: varchar("currentState", { length: 20 }),
  status: mysqlEnum("status", ["active", "acknowledged", "resolved"]).default("active").notNull(),
  acknowledgedBy: int("acknowledgedBy"),
  acknowledgedAt: timestamp("acknowledgedAt"),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AlarmScheduleAlert = typeof alarmScheduleAlerts.$inferSelect;

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
  incidentId: int("incidentId"),
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
}, (table) => [
  index("occurrences_finalized_idx").on(table.finalizedAt, table.id),
  index("occurrences_account_finalized_idx").on(table.account, table.finalizedAt, table.id),
  index("occurrences_client_finalized_idx").on(table.clientId, table.finalizedAt, table.id),
  index("occurrences_partner_finalized_idx").on(table.partnerCompanyId, table.finalizedAt, table.id),
]);
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
