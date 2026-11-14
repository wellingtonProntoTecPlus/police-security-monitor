import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import fs from "node:fs";
import {
  finalizeKeepAliveDisconnectsOnPanelEvent,
  finalizeRadioengeKeepAliveFailureWithRestoration,
  findRadioengeKeepAliveObservationForRestoration,
  recordSystemKeepAlive,
  setDbForTesting,
} from "./db";
import {
  alarmEvents,
  alarmSystems,
  clients,
  incidentHistory,
  incidents,
  occurrences,
  systemDisconnectAlerts,
} from "../drizzle/schema";

// Opt-in somente para MariaDB local descartável por socket Unix; nunca usa DATABASE_URL.
const socket = process.env.POLICE_SHIFT_TEST_SOCKET;
const localEnabled = Boolean(socket?.startsWith("/tmp/police-shift-db/") && fs.existsSync(socket));
const database = `police_keepalive_restore_test_${process.pid}`;
const TABLES = ["system_disconnect_alerts", "system_keep_alive_samples", "incident_history", "occurrences", "incidents", "alarm_events", "alarm_systems", "clients"];
let pool!: mysql.Pool;
let orm!: ReturnType<typeof drizzle>;

function snapshotDDL() {
  const snapshot = JSON.parse(fs.readFileSync(new URL("../drizzle/meta/0051_snapshot.json", import.meta.url), "utf8"));
  return TABLES.map((name) => {
    const table = snapshot.tables[name];
    if (!table) throw new Error(`Tabela ${name} ausente no snapshot 0051`);
    const columns = Object.values(table.columns).map((column: any) => {
      let value = `\`${column.name}\` ${column.type}${column.notNull ? " NOT NULL" : " NULL"}${column.autoincrement ? " AUTO_INCREMENT" : ""}`;
      if (Object.hasOwn(column, "default")) value += ` DEFAULT ${typeof column.default === "boolean" ? Number(column.default) : column.default}`;
      return value;
    });
    for (const key of Object.values(table.compositePrimaryKeys) as any[]) {
      columns.push(`PRIMARY KEY (${key.columns.map((col: string) => `\`${col}\``).join(",")})`);
    }
    for (const key of Object.values(table.uniqueConstraints) as any[]) {
      columns.push(`UNIQUE KEY \`${key.name}\` (${key.columns.map((col: string) => `\`${col}\``).join(",")})`);
    }
    for (const key of Object.values(table.indexes) as any[]) {
      columns.push(`${key.isUnique ? "UNIQUE " : ""}KEY \`${key.name}\` (${key.columns.map((col: string) => `\`${col}\``).join(",")})`);
    }
    return `CREATE TABLE \`${name}\` (${columns.join(",")}) ENGINE=InnoDB`;
  }).join(";\n");
}

async function seedSystem(id: number, brand = "RADIOENGE") {
  await orm.insert(clients).values({
    id,
    partnerCompanyId: id,
    type: "pj",
    propertyType: "company",
    name: `Cliente de teste ${id}`,
    isActive: true,
  });
  await orm.insert(alarmSystems).values({
    id,
    clientId: id,
    account: id === 1 ? "0041" : "0042",
    brand,
    model: "Painel de teste",
    receiverPort: 9061,
    isActive: true,
  });
}

async function seedEvent(input: {
  id: number;
  systemId: number;
  account: string;
  brand: string;
  qualifier: string;
  eventCode: string;
  remoteIp?: string | null;
  receivedAt?: Date;
  description?: string;
}) {
  await orm.insert(alarmEvents).values({
    id: input.id,
    alarmSystemId: input.systemId,
    account: input.account,
    brand: input.brand,
    qualifier: input.qualifier,
    eventCode: input.eventCode,
    description: input.description || `Evento ${input.qualifier}${input.eventCode}`,
    priority: input.eventCode === "KOFF" ? "high" : "medium",
    receiverPort: 9061,
    remoteIp: input.remoteIp === undefined ? "192.0.2.10" : input.remoteIp,
    rawData: "DADO_FICTICIO_DE_TESTE",
    receivedAt: input.receivedAt || new Date("2026-11-14T10:00:00.000Z"),
  });
}

async function seedIncident(input: { id: number; systemId: number; eventId: number; status: "waiting" | "attending" | "observing" | "dispatched" | "maintenance" }) {
  await orm.insert(incidents).values({
    id: input.id,
    eventId: input.eventId,
    alarmSystemId: input.systemId,
    clientId: input.systemId,
    status: input.status,
    priority: "high",
    notes: "Falha de comunicação em teste privado",
  });
}

describe.skipIf(!localEnabled)("Restauração Keep Alive · integração MariaDB privado", () => {
  beforeAll(async () => {
    const admin = await mysql.createConnection({ socketPath: socket!, user: "root", multipleStatements: true });
    try { await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`); }
    finally { await admin.end(); }
    pool = mysql.createPool({ socketPath: socket!, user: "root", database, connectionLimit: 3, timezone: "Z", multipleStatements: true });
    await pool.query(snapshotDDL());
    orm = drizzle(pool);
    setDbForTesting(orm);
  });

  beforeEach(async () => {
    for (const table of TABLES) await pool.query(`DELETE FROM \`${table}\``);
    await seedSystem(1);
    await seedSystem(2);
  });

  afterAll(async () => {
    setDbForTesting(null);
    if (pool) {
      try { await pool.query(`DROP DATABASE \`${database}\``); }
      finally { await pool.end(); }
    }
  });

  it("fecha KOFF imediatamente quando o Keep Alive retorna e grava falha restaurada", async () => {
    const failureAt = new Date("2026-11-14T10:00:00.000Z");
    const restoredAt = new Date("2026-11-14T10:15:00.000Z");
    await pool.query("UPDATE alarm_systems SET lastKeepAliveAt = ? WHERE id = 1", [failureAt]);
    await seedEvent({ id: 51, systemId: 1, account: "0041", brand: "RADIOENGE", qualifier: "E", eventCode: "KOFF", remoteIp: "SYSTEM", receivedAt: failureAt });
    await seedIncident({ id: 61, systemId: 1, eventId: 51, status: "maintenance" });
    await orm.insert(systemDisconnectAlerts).values({
      id: 71,
      alarmSystemId: 1,
      outageStartedAt: failureAt,
      detectedAt: failureAt,
      eventId: 51,
      incidentId: 61,
    });

    const result = await recordSystemKeepAlive(1, restoredAt);
    expect(result?.finalizedDisconnectAlerts).toHaveLength(1);
    expect(result?.finalizedDisconnectAlerts[0]?.description).toContain("Falha de Keep Alive restaurada");
    expect((await orm.select().from(incidents))[0]).toMatchObject({
      id: 61,
      status: "closed",
      resolution: expect.stringContaining("Falha de Keep Alive restaurada"),
    });
    expect((await orm.select().from(alarmEvents))[0]).toMatchObject({
      id: 51,
      eventCode: "KOFF",
      autoFinalized: true,
      autoFinalizationReason: "Falha de Keep Alive restaurada",
    });
    expect((await orm.select().from(systemDisconnectAlerts))[0]).toMatchObject({ restoredAt, restoredKeepAliveAt: restoredAt });
    expect((await orm.select().from(occurrences))[0]).toMatchObject({
      incidentId: 61,
      eventCode: "KOFF",
      status: "finalized",
      partnerCompanyId: 1,
      clientName: "Cliente de teste 1",
      observations: expect.stringContaining("Falha de Keep Alive restaurada"),
    });
    expect((await orm.select().from(incidentHistory))[0]).toMatchObject({
      incidentId: 61,
      action: "auto_restored",
      statusBefore: "maintenance",
      statusAfter: "closed",
    });
    expect(await orm.select().from(alarmEvents)).toHaveLength(1);
  });

  it("preserva a hora de restauração já marcada por uma versão anterior", async () => {
    const failureAt = new Date("2026-11-14T10:00:00.000Z");
    const originalRestoredAt = new Date("2026-11-14T10:05:00.000Z");
    const nextHeartbeatAt = new Date("2026-11-14T10:15:00.000Z");
    await pool.query("UPDATE alarm_systems SET lastKeepAliveAt = ? WHERE id = 1", [failureAt]);
    await seedEvent({ id: 81, systemId: 1, account: "0041", brand: "RADIOENGE", qualifier: "E", eventCode: "KOFF", remoteIp: "SYSTEM", receivedAt: failureAt });
    await seedIncident({ id: 91, systemId: 1, eventId: 81, status: "observing" });
    await orm.insert(systemDisconnectAlerts).values({
      id: 101,
      alarmSystemId: 1,
      outageStartedAt: failureAt,
      detectedAt: failureAt,
      eventId: 81,
      incidentId: 91,
      restoredAt: originalRestoredAt,
      restoredKeepAliveAt: originalRestoredAt,
    });

    const result = await recordSystemKeepAlive(1, nextHeartbeatAt);
    expect(result?.finalizedDisconnectAlerts).toHaveLength(1);
    expect((await orm.select().from(systemDisconnectAlerts))[0]).toMatchObject({ restoredAt: originalRestoredAt, restoredKeepAliveAt: originalRestoredAt });
    expect((await orm.select().from(incidents))[0]).toMatchObject({ status: "closed", closedAt: originalRestoredAt });
    expect((await orm.select().from(occurrences))[0]).toMatchObject({ finalizedAt: originalRestoredAt, attendingTimeMs: 300_000 });
    expect((await orm.select().from(occurrences))[0]?.observations).toContain("07:05:00");
  });

  it("finaliza E361 por R361 mesmo após a janela de 4 segundos e mantém a falha restaurada no histórico", async () => {
    const failureAt = new Date("2026-11-14T10:00:00.000Z");
    const restoredAt = new Date("2026-11-14T10:00:08.000Z");
    await seedEvent({ id: 101, systemId: 1, account: "0041", brand: "RADIOENGE", qualifier: "E", eventCode: "361", receivedAt: failureAt, description: "Falha de Keep Alive E361" });
    await seedEvent({ id: 102, systemId: 1, account: "0041", brand: "RADIOENGE", qualifier: "R", eventCode: "361", receivedAt: restoredAt, description: "Restauração de Keep Alive R361" });
    await seedIncident({ id: 201, systemId: 1, eventId: 101, status: "maintenance" });

    const candidate = await findRadioengeKeepAliveObservationForRestoration({ alarmSystemId: 1, account: "0041" });
    expect(candidate?.incident.id).toBe(201);
    const result = await finalizeRadioengeKeepAliveFailureWithRestoration({
      incidentId: 201,
      failureEventId: 101,
      restorationEventId: 102,
      alarmSystemId: 1,
      restoredAt,
    });

    expect(result?.description).toContain("Falha de Keep Alive restaurada");
    expect((await orm.select().from(incidents))[0]).toMatchObject({ status: "closed", resolution: expect.stringContaining("R361") });
    expect((await orm.select().from(alarmEvents)).find((event) => event.id === 101)).toMatchObject({
      autoFinalized: true,
      autoFinalizationReason: "Falha de Keep Alive restaurada por R361",
    });
    expect(await orm.select().from(occurrences)).toMatchObject([{
      incidentId: 201,
      eventCode: "361",
      qualifier: "E",
      status: "finalized",
      observations: expect.stringContaining("Falha de Keep Alive restaurada"),
      logs: expect.stringContaining("Restauração de Keep Alive R361"),
      clientName: "Cliente de teste 1",
      partnerCompanyId: 1,
    }]);
    expect(await orm.select().from(incidentHistory)).toMatchObject([{
      incidentId: 201,
      action: "auto_restored",
      statusBefore: "maintenance",
      statusAfter: "closed",
      note: expect.stringContaining("R361"),
    }]);
    expect(await finalizeRadioengeKeepAliveFailureWithRestoration({
      incidentId: 201, failureEventId: 101, restorationEventId: 102, alarmSystemId: 1, restoredAt,
    })).toBeUndefined();
    expect(await orm.select().from(occurrences)).toHaveLength(1);
    expect(await orm.select().from(alarmEvents)).toHaveLength(2);
  });

  it("encerra KOFF quando chega qualquer Contact ID real da mesma central e registra ‘Falha de Keep Alive restaurada’", async () => {
    const restoredAt = new Date("2026-11-14T10:15:00.000Z");
    await seedEvent({ id: 301, systemId: 1, account: "0041", brand: "RADIOENGE", qualifier: "E", eventCode: "KOFF", remoteIp: "SYSTEM", description: "Painel desconectado — prazo de Keep Alive excedido" });
    await seedEvent({ id: 302, systemId: 1, account: "0041", brand: "RADIOENGE", qualifier: "E", eventCode: "130", receivedAt: restoredAt, description: "Alarme de teste recebido da central" });
    await seedEvent({ id: 303, systemId: 1, account: "0041", brand: "RADIOENGE", qualifier: "E", eventCode: "KOFF", remoteIp: "SYSTEM", description: "Segundo KOFF de teste" });
    await seedIncident({ id: 401, systemId: 1, eventId: 301, status: "observing" });
    await seedIncident({ id: 402, systemId: 1, eventId: 303, status: "maintenance" });
    await orm.insert(systemDisconnectAlerts).values({
      id: 501,
      alarmSystemId: 1,
      outageStartedAt: new Date("2026-11-14T09:45:00.000Z"),
      detectedAt: new Date("2026-11-14T10:00:00.000Z"),
      eventId: 301,
      incidentId: 401,
      restoredAt: new Date("2026-11-14T10:10:00.000Z"),
      restoredKeepAliveAt: new Date("2026-11-14T10:10:00.000Z"),
    });
    await orm.insert(systemDisconnectAlerts).values({
      id: 502,
      alarmSystemId: 1,
      outageStartedAt: new Date("2026-11-14T09:50:00.000Z"),
      detectedAt: new Date("2026-11-14T10:05:00.000Z"),
      eventId: 303,
      incidentId: 402,
    });

    const restored = await finalizeKeepAliveDisconnectsOnPanelEvent({ alarmSystemId: 1, panelEventId: 302, receivedAt: restoredAt });
    expect(restored).toHaveLength(2);
    expect(restored.find((entry) => entry.incidentId === 401)?.description).toContain("Falha de Keep Alive restaurada");
    expect(restored.find((entry) => entry.incidentId === 401)?.description).toContain("retorno do Keep Alive");
    expect(restored.find((entry) => entry.incidentId === 402)?.description).toContain("E130");
    expect(await orm.select().from(incidents)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 401, status: "closed", resolution: expect.stringContaining("retorno do Keep Alive"), closedAt: new Date("2026-11-14T10:10:00.000Z") }),
      expect.objectContaining({ id: 402, status: "closed", resolution: expect.stringContaining("evento real E130") }),
    ]));
    const alerts = await orm.select().from(systemDisconnectAlerts);
    expect(alerts.find((alert) => alert.id === 501)?.restoredAt).toEqual(new Date("2026-11-14T10:10:00.000Z"));
    expect(alerts.find((alert) => alert.id === 502)?.restoredAt).toEqual(restoredAt);
    expect(await orm.select().from(occurrences)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        incidentId: 401,
        eventCode: "KOFF",
        qualifier: "E",
        status: "finalized",
        observations: expect.stringContaining("Falha de Keep Alive restaurada"),
        logs: expect.stringContaining("retorno do Keep Alive"),
        partnerCompanyId: 1,
        finalizedAt: new Date("2026-11-14T10:10:00.000Z"),
      }),
      expect.objectContaining({ incidentId: 402, eventCode: "KOFF", status: "finalized", partnerCompanyId: 1, clientName: "Cliente de teste 1" }),
    ]));
    expect((await orm.select().from(alarmEvents)).find((event) => event.id === 302)).toMatchObject({ eventCode: "130", autoFinalized: false });
    expect(await orm.select().from(alarmEvents)).toHaveLength(3);
    expect(await orm.select().from(incidentHistory)).toEqual(expect.arrayContaining([
      expect.objectContaining({ incidentId: 401, action: "auto_restored", statusBefore: "observing", statusAfter: "closed", note: expect.stringContaining("retorno do Keep Alive") }),
      expect.objectContaining({ incidentId: 402, action: "auto_restored", statusBefore: "maintenance", statusAfter: "closed", note: expect.stringContaining("E130") }),
    ]));

    expect(await finalizeKeepAliveDisconnectsOnPanelEvent({ alarmSystemId: 1, panelEventId: 302, receivedAt: restoredAt })).toEqual([]);
    expect(await orm.select().from(occurrences)).toHaveLength(2);
    expect(await orm.select().from(alarmEvents)).toHaveLength(3);
  });

  it("não fecha KOFF com evento sintético, com o próprio KOFF nem com evento de outra central", async () => {
    await seedEvent({ id: 601, systemId: 1, account: "0041", brand: "RADIOENGE", qualifier: "E", eventCode: "KOFF", remoteIp: "SYSTEM" });
    await seedEvent({ id: 602, systemId: 1, account: "0041", brand: "RADIOENGE", qualifier: "E", eventCode: "130", remoteIp: "SYSTEM" });
    await seedEvent({ id: 603, systemId: 2, account: "0042", brand: "RADIOENGE", qualifier: "E", eventCode: "130" });
    await seedIncident({ id: 701, systemId: 1, eventId: 601, status: "waiting" });
    await orm.insert(systemDisconnectAlerts).values({
      id: 801,
      alarmSystemId: 1,
      outageStartedAt: new Date("2026-11-14T09:00:00.000Z"),
      eventId: 601,
      incidentId: 701,
    });

    expect(await finalizeKeepAliveDisconnectsOnPanelEvent({ alarmSystemId: 1, panelEventId: 602 })).toEqual([]);
    expect(await finalizeKeepAliveDisconnectsOnPanelEvent({ alarmSystemId: 1, panelEventId: 601 })).toEqual([]);
    expect(await finalizeKeepAliveDisconnectsOnPanelEvent({ alarmSystemId: 1, panelEventId: 603 })).toEqual([]);
    expect((await orm.select().from(incidents))[0]?.status).toBe("waiting");
    expect(await orm.select().from(occurrences)).toHaveLength(0);
    expect(await orm.select().from(alarmEvents)).toHaveLength(3);
  });
});
