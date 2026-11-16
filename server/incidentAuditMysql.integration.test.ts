import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { and, asc, eq } from "drizzle-orm";
import fs from "node:fs";
import { recordIncidentOperatorAction, setDbForTesting } from "./db";
import {
  recordIncidentOperatorActionWithDb,
  listIncidentAuditReportWithDb,
  listIncidentAuditTrailWithDb,
  TACTICAL_AUDIT_STATUS_LABELS,
  type IncidentAuditActionInput,
} from "./incidentAuditPersistence";
import {
  alarmEvents,
  authSessions,
  alarmSystems,
  cameras,
  clientContacts,
  clients,
  incidentHistory,
  incidents,
  incidentPanelLeases,
  users,
} from "../drizzle/schema";

// Opt-in somente para MariaDB local descartável por socket Unix; nunca usa DATABASE_URL.
const socket = process.env.POLICE_SHIFT_TEST_SOCKET;
const localEnabled = Boolean(socket?.startsWith("/tmp/police-shift-db/") && fs.existsSync(socket));
const database = `police_incident_audit_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
const TABLES = [
  "users",
  "auth_sessions",
  "incidents",
  "incident_history",
  "incident_panel_leases",
  "alarm_events",
  "alarm_systems",
  "clients",
  "cameras",
  "client_contacts",
];
let pool!: mysql.Pool;
let orm!: ReturnType<typeof drizzle>;
let databaseCreated = false;

function latestSnapshot() {
  const metadataDirectory = new URL("../drizzle/meta/", import.meta.url);
  const snapshots = fs.readdirSync(metadataDirectory)
    .filter((name) => /^\d+_snapshot\.json$/.test(name))
    .sort((left, right) => Number(left.match(/^\d+/)![0]) - Number(right.match(/^\d+/)![0]));
  const filename = snapshots.at(-1);
  if (!filename) throw new Error("Nenhum snapshot numérico encontrado em drizzle/meta");
  return {
    filename,
    snapshot: JSON.parse(fs.readFileSync(new URL(`../drizzle/meta/${filename}`, import.meta.url), "utf8")),
  };
}

function snapshotDDL() {
  const { filename, snapshot } = latestSnapshot();
  return TABLES.map((name) => {
    const table = snapshot.tables[name];
    if (!table) throw new Error(`Tabela ${name} ausente no snapshot ${filename}`);
    const columns = Object.values(table.columns).map((column: any) => {
      let value = `\`${column.name}\` ${column.type}${column.notNull ? " NOT NULL" : " NULL"}${column.autoincrement ? " AUTO_INCREMENT" : ""}`;
      if (Object.hasOwn(column, "default")) value += ` DEFAULT ${typeof column.default === "boolean" ? Number(column.default) : column.default}`;
      return value;
    });
    const primaryKeys = Object.values(table.compositePrimaryKeys ?? {}) as any[];
    const uniqueNames = new Set<string>();
    const constraints: string[] = [];
    for (const key of primaryKeys) {
      constraints.push(`PRIMARY KEY (${key.columns.map((column: string) => `\`${column}\``).join(",")})`);
    }
    for (const key of Object.values(table.uniqueConstraints ?? {}) as any[]) {
      uniqueNames.add(key.name);
      constraints.push(`UNIQUE KEY \`${key.name}\` (${key.columns.map((column: string) => `\`${column}\``).join(",")})`);
    }
    for (const key of Object.values(table.indexes ?? {}) as any[]) {
      if (uniqueNames.has(key.name)) continue;
      constraints.push(`${key.isUnique ? "UNIQUE " : ""}KEY \`${key.name}\` (${key.columns.map((column: string) => `\`${column}\``).join(",")})`);
    }

    // O snapshot pode anteceder a adição de requestId ao schema TypeScript atual.
    if (name === "incident_history") {
      const hasRequestId = Object.values(table.columns).some((column: any) => column.name === "requestId");
      if (!hasRequestId) columns.push("`requestId` varchar(64) NULL");
      const hasRequestIdUnique = [
        ...Object.values(table.uniqueConstraints ?? {}),
        ...Object.values(table.indexes ?? {}),
      ].some((key: any) => key.isUnique !== false && key.columns?.length === 1 && key.columns[0] === "requestId");
      if (!hasRequestIdUnique) constraints.push("UNIQUE KEY `incident_history_request_unique` (`requestId`)");
    }

    return `CREATE TABLE \`${name}\` (${[...columns, ...constraints].join(",")}) ENGINE=InnoDB`;
  }).join(";\n");
}

const operatorOne = { id: 11, name: "Operadora Ana" };
const operatorTwo = { id: 22, name: "Operador Bruno" };
const noopSessionLock = async (_tx: any) => {};

async function record(input: IncidentAuditActionInput, actor = operatorOne) {
  return recordIncidentOperatorActionWithDb(orm, input, actor, noopSessionLock);
}

async function seedFixtures() {
  await orm.insert(users).values([
    { id: operatorOne.id, openId: "incident-audit-operator-11", name: operatorOne.name, role: "operator" },
    { id: operatorTwo.id, openId: "incident-audit-operator-22", name: operatorTwo.name, role: "operator" },
  ]);
  await orm.insert(clients).values([
    { id: 1, partnerCompanyId: 1, type: "pj", propertyType: "company", name: "Cliente Alfa", isActive: true },
    { id: 2, partnerCompanyId: 2, type: "pj", propertyType: "company", name: "Cliente Beta", isActive: true },
  ]);
  await orm.insert(alarmSystems).values([
    { id: 1, clientId: 1, account: "0041", brand: "RADIOENGE", model: "Painel Alfa", receiverPort: 9061, isActive: true },
    { id: 2, clientId: 2, account: "0041", brand: "RADIOENGE", model: "Painel Beta", receiverPort: 9061, isActive: true },
    // Painel secundário do mesmo cliente: permite provar o vínculo de contato à central específica.
    { id: 3, clientId: 1, account: "0042", brand: "RADIOENGE", model: "Painel Alfa secundário", receiverPort: 9061, isActive: true },
  ]);
  await orm.insert(alarmEvents).values([
    {
      id: 1, alarmSystemId: 1, account: "0041", brand: "RADIOENGE", qualifier: "E", eventCode: "130",
      description: "Evento fictício Alfa", rawData: "RAW_EVENT_SECRET_SENTINEL", receivedAt: new Date("2026-11-14T10:00:00.000Z"),
    },
    {
      id: 2, alarmSystemId: 2, account: "0041", brand: "RADIOENGE", qualifier: "E", eventCode: "130",
      description: "Evento fictício Beta", rawData: "RAW_EVENT_SECRET_BETA", receivedAt: new Date("2026-11-14T10:01:00.000Z"),
    },
  ]);
  await orm.insert(incidents).values([
    { id: 101, eventId: 1, alarmSystemId: 1, clientId: 1, operatorId: operatorOne.id, status: "attending", priority: "high" },
    { id: 102, eventId: 2, alarmSystemId: 2, clientId: 2, operatorId: operatorTwo.id, status: "attending", priority: "high" },
    // Inconsistência deliberada para validar a proteção contra clientId divergente da central.
    { id: 104, eventId: 1, alarmSystemId: 1, clientId: 2, operatorId: operatorOne.id, status: "attending", priority: "high" },
  ]);
  await orm.insert(cameras).values([
    {
      id: 1, clientId: 1, name: "Entrada principal", rtspUrl: "rtsp://camera-user:CAMERA_PASSWORD_SENTINEL@example.invalid/stream",
      isActive: true,
    },
    { id: 2, clientId: 2, name: "Câmera cliente Beta", rtspUrl: "rtsp://example.invalid/beta", isActive: true },
  ]);
  await orm.insert(clientContacts).values([
    {
      id: 1, clientId: 1, alarmSystemId: 1, name: "Contato Alfa",
      phone: "PHONE_SECRET_01", whatsapp: "WA_SECRET_01", password: "CONTACT_PASSWORD_SENTINEL",
      counterPassword: "COUNTER_PASSWORD_SENTINEL", coercionPassword: "COERCION_PASSWORD_SENTINEL", isActive: true,
    },
    { id: 2, clientId: 2, alarmSystemId: 2, name: "Contato Beta", phone: "PHONE_BETA_SENTINEL", isActive: true },
    { id: 3, clientId: 1, alarmSystemId: 3, name: "Contato de outra central", phone: "OTHER_PANEL_PHONE_01", isActive: true },
    { id: 4, clientId: 1, alarmSystemId: null, name: "Contato geral Alfa", isActive: true },
  ]);
}

describe.skipIf(!localEnabled)("Auditoria operacional de incidentes · integração MariaDB privado", () => {
  beforeAll(async () => {
    const admin = await mysql.createConnection({ socketPath: socket!, user: "root" });
    try {
      await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
      databaseCreated = true;
    } finally {
      await admin.end();
    }
    pool = mysql.createPool({ socketPath: socket!, user: "root", database, connectionLimit: 3, timezone: "Z", multipleStatements: true });
    await pool.query(snapshotDDL());
    orm = drizzle(pool);
  });

  beforeEach(async () => {
    for (const table of TABLES) await pool.query(`DELETE FROM \`${table}\``);
    await seedFixtures();
  });
  afterEach(() => setDbForTesting(null));

  afterAll(async () => {
    setDbForTesting(null);
    if (pool) await pool.end();
    if (databaseCreated) {
      const admin = await mysql.createConnection({ socketPath: socket!, user: "root" });
      try { await admin.query(`DROP DATABASE \`${database}\``); }
      finally { await admin.end(); }
    }
  });

  it("persiste a ação imediatamente, mantém identidade do ator autenticado e exclui dados sigilosos da nota", async () => {
    const clientTimestamp = new Date("2001-01-01T00:00:00.000Z");
    const startedAt = Date.now();
    const cameraAction = await record({
      incidentId: 101,
      requestId: "audit-immediate-camera-001",
      action: "camera_viewed",
      targetId: 1,
      // Campos extras simulam uma tentativa de forjar ator/horário pelo cliente; o helper não os aceita.
      createdAt: clientTimestamp,
      operatorId: 999,
      operatorName: "Ator forjado pelo cliente",
    } as unknown as IncidentAuditActionInput);

    expect(cameraAction).toMatchObject({
      incidentId: 101,
      operatorId: operatorOne.id,
      operatorName: operatorOne.name,
      action: "camera_viewed",
      statusBefore: null,
      statusAfter: null,
    });
    expect(cameraAction.createdAt.getTime()).toBeGreaterThan(startedAt - 1_000);
    expect(cameraAction.createdAt).not.toEqual(clientTimestamp);
    expect(cameraAction.operatorName).not.toContain("forjado");
    expect(cameraAction.note).toContain("Entrada principal");

    const contactAction = await record({
      incidentId: 101,
      requestId: "audit-immediate-contact-001",
      action: "contact_call_clicked",
      targetId: 1,
    });
    expect(contactAction.note).toContain("Contato Alfa");

    // Nova instância Drizzle sobre a conexão MariaDB observa as linhas já confirmadas.
    const freshReadDb = drizzle(pool);
    const trail = await listIncidentAuditTrailWithDb(freshReadDb, 101);
    expect(trail.items.map((entry) => entry.id)).toEqual([contactAction.id, cameraAction.id]);
    expect(trail.items.map((entry) => entry.operatorId)).toEqual([operatorOne.id, operatorOne.id]);
    const notes = trail.items.map((entry) => entry.note ?? "").join(" ");
    for (const secret of [
      "camera-user", "CAMERA_PASSWORD_SENTINEL", "PHONE_SECRET_01", "WA_SECRET_01",
      "CONTACT_PASSWORD_SENTINEL", "COUNTER_PASSWORD_SENTINEL", "COERCION_PASSWORD_SENTINEL", "RAW_EVENT_SECRET_SENTINEL",
    ]) expect(notes).not.toContain(secret);

    expect(await freshReadDb.select().from(incidents)).toHaveLength(3);
    expect(await freshReadDb.select().from(alarmEvents)).toHaveLength(2);
    expect(await freshReadDb.select().from(incidentHistory)).toHaveLength(2);
  });

  it("exige a sessão operacional ativa real e rejeita sessão revogada, expirada ou ausente", async () => {
    setDbForTesting(orm);
    const input = { incidentId: 101, leaseToken: "00000000-0000-4000-8000-000000000901", requestId: "audit-active-session-001", action: "police_action_registered" as const };
    await expect(recordIncidentOperatorAction(input, operatorOne, null)).rejects.toThrow("Sessão operacional não identificada");
    await orm.insert(authSessions).values({ id: 901, userId: operatorOne.id, tokenHash: "a".repeat(64), expiresAt: new Date(Date.now() + 60_000) });
    await orm.insert(incidentPanelLeases).values({ incidentId: 101, operatorId: operatorOne.id, authSessionId: 901, leaseToken: input.leaseToken, expiresAt: new Date(Date.now()+60_000) });
    const saved = await recordIncidentOperatorAction(input, operatorOne, 901);
    expect(saved.operatorId).toBe(operatorOne.id);
    await orm.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.id, 901));
    await expect(recordIncidentOperatorAction({ ...input, requestId: "audit-revoked-session" }, operatorOne, 901)).rejects.toThrow("sessão foi encerrada");
    await orm.update(authSessions).set({ revokedAt: null, expiresAt: new Date(Date.now() - 60_000) }).where(eq(authSessions.id, 901));
    await expect(recordIncidentOperatorAction({ ...input, requestId: "audit-expired-session" }, operatorOne, 901)).rejects.toThrow("sessão foi encerrada");
    expect(await orm.select().from(incidentHistory)).toHaveLength(1);
  });

  it("aplica o bloco de upgrade aditivo duas vezes e preserva logs legados", async () => {
    await pool.query("ALTER TABLE incident_history DROP COLUMN requestId; DROP INDEX incident_history_created_idx ON incident_history;");
    await pool.query("INSERT INTO incident_history (incidentId, operatorId, operatorName, action, note) VALUES (101, 11, 'Operadora Ana', 'claimed', 'Log legado preservado')");
    const upgrade = fs.readFileSync(new URL("../deploy/upgrade_vps.sql", import.meta.url), "utf8");
    const marker = upgrade.indexOf("INDEX_NAME='incident_history_created_idx'");
    const start = upgrade.lastIndexOf("SET @statement = (", marker);
    const end = upgrade.indexOf("\nSET @statement = (\n  SELECT IF(COUNT(*) = 0, 'ALTER TABLE `occurrences` ADD `incidentId`", start);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    const migration = `SET @schema_name := DATABASE();\n${upgrade.slice(start, end)}`;
    await pool.query(migration); await pool.query(migration);
    const rows = await orm.select().from(incidentHistory);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ note: "Log legado preservado", requestId: null });
    const saved = await record({ incidentId: 101, requestId: "audit-after-upgrade", action: "police_action_registered" });
    expect(saved.id).toBeGreaterThan(rows[0].id);
  });

  it("aceita alvos do cliente/central corretos e recusa câmeras ou contatos fora do escopo", async () => {
    await expect(record({ incidentId: 101, requestId: "audit-foreign-camera", action: "camera_viewed", targetId: 2 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(record({ incidentId: 101, requestId: "audit-foreign-contact", action: "contact_selected", targetId: 2 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(record({ incidentId: 101, requestId: "audit-other-panel-contact", action: "contact_selected", targetId: 3 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    const samePanelContact = await record({ incidentId: 101, requestId: "audit-same-panel-contact", action: "contact_selected", targetId: 1 });
    const unboundContact = await record({ incidentId: 101, requestId: "audit-unbound-contact", action: "contact_selected", targetId: 4 });
    expect(samePanelContact.note).toContain("Contato Alfa");
    expect(unboundContact.note).toContain("Contato geral Alfa");
    expect(await orm.select().from(incidentHistory)).toHaveLength(2);
  });

  it("recusa operador não responsável, ocorrência encerrada e conflito cliente/central", async () => {
    await expect(record({ incidentId: 102, requestId: "audit-foreign-operator", action: "police_action_registered" }, operatorOne))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    await orm.update(incidents).set({ status: "closed" }).where(eq(incidents.id, 101));
    await expect(record({ incidentId: 101, requestId: "audit-closed-incident", action: "police_action_registered" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(record({ incidentId: 104, requestId: "audit-client-system-conflict", action: "police_action_registered" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(await orm.select().from(incidentHistory)).toHaveLength(0);
    expect(await orm.select().from(incidents)).toHaveLength(3);
    expect(await orm.select().from(alarmEvents)).toHaveLength(2);
  });

  it("torna requestId idempotente na mesma ação e rejeita sua reutilização em outra ocorrência", async () => {
    const input: IncidentAuditActionInput = {
      incidentId: 101,
      requestId: "audit-idempotency-key-001",
      action: "police_action_registered",
    };
    const first = await record(input);
    const repeat = await record(input);
    expect(repeat.id).toBe(first.id);
    expect(repeat.createdAt).toEqual(first.createdAt);

    await expect(record({ ...input, incidentId: 102 }, operatorTwo)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await orm.select().from(incidentHistory)).toHaveLength(1);
    expect(await orm.select().from(incidents)).toHaveLength(3);
    expect(await orm.select().from(alarmEvents)).toHaveLength(2);
  });

  it("só aceita status tático depois do despacho", async () => {
    await expect(record({
      incidentId: 101,
      requestId: "audit-tactical-before-dispatch",
      action: "tactical_status_updated",
      tacticalStatus: "arrived",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await orm.select().from(incidentHistory)).toHaveLength(0);
  });

  it("grava somente os status táticos enumerados após o despacho", async () => {
    await orm.update(incidents).set({ status: "dispatched" }).where(eq(incidents.id, 101));
    expect(Object.keys(TACTICAL_AUDIT_STATUS_LABELS).sort()).toEqual(["arrived", "completed", "en_route", "inspection"]);

    for (const [tacticalStatus, label] of Object.entries(TACTICAL_AUDIT_STATUS_LABELS)) {
      const entry = await record({
        incidentId: 101,
        requestId: `audit-tactical-${tacticalStatus}`,
        action: "tactical_status_updated",
        tacticalStatus: tacticalStatus as IncidentAuditActionInput["tacticalStatus"],
      });
      expect(entry.note).toContain(label);
      expect(entry.note).toContain("Registro manual do operador");
    }
    expect(await orm.select().from(incidentHistory)).toHaveLength(Object.keys(TACTICAL_AUDIT_STATUS_LABELS).length);
  });

  it("filtra relatório por intervalo e cliente, limita páginas a 100 e ordena trilha por data e id", async () => {
    await orm.insert(incidents).values({
      id: 103, eventId: 1, alarmSystemId: 1, clientId: 1, operatorId: operatorOne.id, status: "attending", priority: "high",
    });
    const targetTime = new Date("2026-11-14T10:00:00.000Z");
    const beforeTime = new Date("2026-11-14T09:59:59.000Z");
    const afterTime = new Date("2026-11-14T10:00:01.000Z");
    const auditRows = [
      ...Array.from({ length: 103 }, () => ({
        incidentId: 101, parentIncidentId: null, operatorId: operatorOne.id, operatorName: operatorOne.name,
        action: "camera_viewed", statusBefore: null, statusAfter: null, note: "Linha de teste", requestId: null,
        createdAt: targetTime,
      })),
      ...Array.from({ length: 2 }, () => ({
        incidentId: 102, parentIncidentId: null, operatorId: operatorTwo.id, operatorName: operatorTwo.name,
        action: "contact_selected", statusBefore: null, statusAfter: null, note: "Linha cliente Beta", requestId: null,
        createdAt: targetTime,
      })),
      {
        incidentId: 103, parentIncidentId: null, operatorId: operatorOne.id, operatorName: operatorOne.name,
        action: "camera_viewed", statusBefore: null, statusAfter: null, note: "Antes do intervalo", requestId: null,
        createdAt: beforeTime,
      },
      {
        incidentId: 103, parentIncidentId: null, operatorId: operatorOne.id, operatorName: operatorOne.name,
        action: "camera_viewed", statusBefore: null, statusAfter: null, note: "Depois do intervalo", requestId: null,
        createdAt: afterTime,
      },
    ];
    await orm.insert(incidentHistory).values(auditRows);

    const targetIds = (await orm.select({ id: incidentHistory.id }).from(incidentHistory)
      .where(eq(incidentHistory.incidentId, 101)).orderBy(asc(incidentHistory.id))).map((row) => row.id);
    const reportInput = { from: targetTime, to: targetTime, clientId: 1 };
    const firstPage = await listIncidentAuditReportWithDb(orm, reportInput);
    expect(firstPage.items).toHaveLength(100);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.items.every((entry) => entry.incidentId === 101)).toBe(true);
    expect(firstPage.items.map((entry) => entry.id)).toEqual([...targetIds].reverse().slice(0, 100));

    const secondPage = await listIncidentAuditReportWithDb(orm, { ...reportInput, offset: 100 });
    expect(secondPage.items).toHaveLength(3);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.items.map((entry) => entry.id)).toEqual([...targetIds].reverse().slice(100));

    const trailFirstPage = await listIncidentAuditTrailWithDb(orm, 101);
    expect(trailFirstPage.items).toHaveLength(100);
    expect(trailFirstPage.items.map((entry) => entry.id)).toEqual([...targetIds].reverse().slice(0, 100));
    expect(trailFirstPage.nextCursor).toBe(trailFirstPage.items.at(-1)?.id);
    const trailSecondPage = await listIncidentAuditTrailWithDb(orm, 101, trailFirstPage.nextCursor ?? undefined);
    expect(trailSecondPage.items.map((entry) => entry.id)).toEqual([...targetIds].reverse().slice(100));
    expect(trailSecondPage.nextCursor).toBeNull();

    const unscoped = await listIncidentAuditReportWithDb(orm, { from: targetTime, to: targetTime });
    expect(unscoped.items.some((entry) => entry.incidentId === 102)).toBe(true);
    expect(firstPage.items.some((entry) => entry.incidentId === 102 || entry.incidentId === 103)).toBe(false);

    const outsideWindow = await listIncidentAuditReportWithDb(orm, {
      from: targetTime, to: targetTime, clientId: 1, incidentId: 103,
    });
    expect(outsideWindow.items).toHaveLength(0);
    const bothSidesOfWindow = await listIncidentAuditReportWithDb(orm, { clientId: 1, incidentId: 103 });
    expect(bothSidesOfWindow.items.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      (await orm.select({ id: incidentHistory.id }).from(incidentHistory).where(and(
        eq(incidentHistory.incidentId, 103),
        eq(incidentHistory.note, "Antes do intervalo"),
      )))[0].id,
      (await orm.select({ id: incidentHistory.id }).from(incidentHistory).where(and(
        eq(incidentHistory.incidentId, 103),
        eq(incidentHistory.note, "Depois do intervalo"),
      )))[0].id,
    ]));
  });
});
