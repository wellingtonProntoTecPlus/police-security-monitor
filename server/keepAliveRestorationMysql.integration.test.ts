import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import {
  finalizeKeepAliveDisconnectsOnPanelEvent,
  finalizeRadioengeKeepAliveFailureWithRestoration,
  findRadioengeKeepAliveObservationForRestoration,
  findIncidentForRestoration,
  listRecentClientEventsForOpenIncident,
  promoteExpiredRestorationWaitsWithDb,
  recordSystemKeepAlive,
  setDbForTesting,
} from "./db";
import {
  alarmEvents,
  alarmSystems,
  clients,
  contactIdCodes,
  incidentHistory,
  incidentPanelLeases,
  incidents,
  occurrences,
  systemDisconnectAlerts,
} from "../drizzle/schema";

// Opt-in somente para MariaDB local descartável por socket Unix; nunca usa DATABASE_URL.
const socket = process.env.POLICE_SHIFT_TEST_SOCKET;
const localEnabled = Boolean(socket?.startsWith("/tmp/police-shift-db/") && fs.existsSync(socket));
const database = `police_keepalive_restore_test_${process.pid}`;
const TABLES = ["incident_panel_leases", "system_disconnect_alerts", "system_keep_alive_samples", "incident_history", "occurrences", "incidents", "alarm_events", "contact_id_codes", "alarm_systems", "clients"];
let pool!: mysql.Pool;
let orm!: ReturnType<typeof drizzle>;

function snapshotDDL() {
  const snapshot = JSON.parse(fs.readFileSync(new URL("../drizzle/meta/0059_snapshot.json", import.meta.url), "utf8"));
  return TABLES.map((name) => {
    const table = snapshot.tables[name];
    if (!table) throw new Error(`Tabela ${name} ausente no snapshot 0054`);
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

async function seedIncident(input: {
  id: number;
  systemId: number;
  eventId: number;
  status: "waiting" | "attending" | "observing" | "dispatched" | "maintenance";
  observationUntil?: Date | null;
  restorationWaitPending?: boolean;
}) {
  await orm.insert(incidents).values({
    id: input.id,
    eventId: input.eventId,
    alarmSystemId: input.systemId,
    clientId: input.systemId,
    status: input.status,
    priority: "high",
    notes: "Falha de comunicação em teste privado",
    observationUntil: input.observationUntil || null,
    restorationWaitPending: input.restorationWaitPending || false,
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

  it("aplica a migration de espera duas vezes sem alterar a ocorrência preexistente", async () => {
    await seedEvent({ id: 51, systemId: 1, account: "0041", brand: "RADIOENGE", qualifier: "E", eventCode: "365", description: "Cliente Desconectado" });
    await seedIncident({ id: 61, systemId: 1, eventId: 51, status: "waiting" });
    await pool.query("ALTER TABLE incidents DROP INDEX incidents_restoration_wait_idx, DROP COLUMN restorationWaitPending");
    const source = fs.readFileSync(new URL("../deploy/upgrade_vps.sql", import.meta.url), "utf8");
    const start = source.indexOf("-- Falhas com restauração configurada podem aguardar a janela antes de entrar na fila.");
    expect(start).toBeGreaterThan(0);
    const migration = source.slice(start);
    await pool.query(migration);
    await pool.query(migration);
    expect(await orm.select().from(incidents)).toMatchObject([{ id: 61, eventId: 51, status: "waiting", notes: "Falha de comunicação em teste privado", restorationWaitPending: false }]);
    expect(await orm.select().from(alarmEvents)).toHaveLength(1);
    expect(await orm.select().from(occurrences)).toHaveLength(0);
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

    await orm.insert(incidentPanelLeases).values({ incidentId: 61, operatorId: 9, authSessionId: 91, leaseToken: "00000000-0000-4000-8000-000000000061", expiresAt: new Date("2027-01-01Z") });
    const result = await recordSystemKeepAlive(1, restoredAt);
    expect(await orm.select().from(incidentPanelLeases)).toHaveLength(0);
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

  it("fecha E365 Cliente Desconectado no primeiro Keep Alive, sem exigir nem criar R365", async () => {
    const failureAt = new Date("2026-11-18T10:00:00.000Z");
    const restoredAt = new Date("2026-11-18T10:03:00.000Z");
    await seedEvent({ id: 81, systemId: 1, account: "0041", brand: "RADIOENGE", qualifier: "E", eventCode: "365", description: "Cliente Desconectado", receivedAt: failureAt });
    await seedIncident({ id: 91, systemId: 1, eventId: 81, status: "waiting" });
    await seedEvent({ id: 82, systemId: 2, account: "0042", brand: "RADIOENGE", qualifier: "E", eventCode: "365", description: "Problema de módulo de Ethernet", receivedAt: failureAt });
    await seedIncident({ id: 92, systemId: 2, eventId: 82, status: "waiting" });
    await orm.insert(incidentPanelLeases).values([
      { incidentId: 91, operatorId: 9, authSessionId: 91, leaseToken: "00000000-0000-4000-8000-000000000091", expiresAt: new Date("2027-01-01Z") },
      { incidentId: 92, operatorId: 9, authSessionId: 92, leaseToken: "00000000-0000-4000-8000-000000000092", expiresAt: new Date("2027-01-01Z") },
    ]);

    const previousSignal = await recordSystemKeepAlive(1, new Date(failureAt.getTime() - 1_000));
    expect(previousSignal?.finalizedClientDisconnectEvents).toEqual([]);
    expect(await orm.select().from(occurrences)).toHaveLength(0);
    expect(await orm.select().from(incidents).where(eq(incidents.id, 91))).toMatchObject([{ status: "waiting" }]);
    const result = await recordSystemKeepAlive(1, restoredAt);

    expect(result?.finalizedClientDisconnectEvents).toEqual([expect.objectContaining({
      eventId: 81,
      incidentId: 91,
      qualifier: "E",
      eventCode: "365",
      description: "Finalizado com a restauração da conexão",
    })]);
    expect(await orm.select().from(incidents).where(eq(incidents.id, 91))).toMatchObject([{
      id: 91,
      status: "closed",
      resolution: "Finalizado com a restauração da conexão",
      restorationWaitPending: false,
      notes: "Falha de comunicação em teste privado",
      closedAt: restoredAt,
    }]);
    expect(await orm.select().from(incidents).where(eq(incidents.id, 92))).toMatchObject([{ id: 92, status: "waiting" }]);
    expect(await orm.select().from(incidentPanelLeases)).toMatchObject([{ incidentId: 92 }]);
    expect(await orm.select().from(alarmEvents)).toHaveLength(2);
    expect(await orm.select().from(alarmEvents).where(eq(alarmEvents.id, 81))).toMatchObject([{
      id: 81,
      qualifier: "E",
      eventCode: "365",
      autoFinalized: true,
      autoFinalizationReason: "Finalizado com a restauração da conexão",
    }]);
    expect(await orm.select().from(occurrences)).toMatchObject([{
      incidentId: 91,
      eventCode: "365",
      qualifier: "E",
      status: "finalized",
      operatorName: "Sistema",
      observations: "Finalizado com a restauração da conexão",
      finalizedAt: restoredAt,
    }]);
    expect(await orm.select().from(incidentHistory)).toMatchObject([{
      incidentId: 91,
      action: "auto_restored",
      statusBefore: "waiting",
      statusAfter: "closed",
      note: "Finalizado com a restauração da conexão",
    }]);
    const repeated = await recordSystemKeepAlive(1, new Date(restoredAt.getTime() + 1_000));
    expect(repeated?.finalizedClientDisconnectEvents).toEqual([]);
    expect(await orm.select().from(occurrences)).toHaveLength(1);
    expect(await orm.select().from(incidentHistory)).toHaveLength(1);
  });

  it("libera a central antes de aguardar o incidente E365, evitando ordem inversa com manutenção", async () => {
    const failureAt = new Date("2026-11-18T10:00:00Z");
    const restoredAt = new Date("2026-11-18T10:03:00Z");
    await seedEvent({ id: 81, systemId: 1, account: "0041", brand: "RADIOENGE", qualifier: "E", eventCode: "365", description: "Cliente Desconectado", receivedAt: failureAt });
    await seedIncident({ id: 91, systemId: 1, eventId: 81, status: "maintenance" });
    let signalSelect!: () => void;
    const selectingIncident = new Promise<void>((resolve) => { signalSelect = resolve; });
    const wrapSelect = (query: any): any => new Proxy(query, {
      get(target, key) {
        if (key === "then") return (resolve: any, reject: any) => {
          const statement = target.toSQL().sql;
          if (statement.includes('from `incidents`') && statement.includes("for update")) signalSelect();
          return target.then(resolve, reject);
        };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? (...args: any[]) => wrapSelect(value.apply(target, args)) : value;
      },
    });
    const gatedDb = {
      transaction: (callback: any, config: any) => orm.transaction((tx) => callback(new Proxy(tx, {
        get(target, key) {
          if (key === "select") return (...args: any[]) => wrapSelect((target.select as any)(...args));
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      })), config),
    };
    const maintenance = await pool.getConnection();
    let outcome: Promise<any> | undefined;
    try {
      await maintenance.query("SET SESSION innodb_lock_wait_timeout = 2");
      await maintenance.beginTransaction();
      await maintenance.query("SELECT id FROM incidents WHERE id = 91 FOR UPDATE");
      setDbForTesting(gatedDb as any);
      outcome = recordSystemKeepAlive(1, restoredAt).then((value) => ({ value }), (error) => ({ error }));
      await selectingIncident;
      // Ordem real da manutenção: já possui o incidente e precisa da central.
      // Keep Alive não pode reter essa central enquanto espera o mesmo incidente.
      await maintenance.query("SELECT id FROM alarm_systems WHERE id = 1 FOR UPDATE");
      await maintenance.commit();
      const result = await outcome;
      if (result.error) throw result.error;
      expect(result.value?.finalizedClientDisconnectEvents).toMatchObject([{ incidentId: 91 }]);
      expect(await orm.select().from(incidents).where(eq(incidents.id, 91))).toMatchObject([{ status: "closed" }]);
      expect(await orm.select().from(occurrences)).toHaveLength(1);
    } finally {
      await maintenance.rollback();
      maintenance.release();
      if (outcome) await outcome;
      setDbForTesting(orm);
    }
  });

  it("aguarda os prazos configurados e fecha E301/R301 e E369/R369 com a restauração identificada", async () => {
    const start = new Date("2026-11-18T10:00:00.000Z");
    const e301Until = new Date(start.getTime() + 30 * 60_000);
    const e369Until = new Date(start.getTime() + 180_000);
    await seedEvent({ id: 101, systemId: 1, account: "0041", brand: "RADIOENGE", qualifier: "E", eventCode: "301", description: "Problema de energia", receivedAt: start });
    await seedIncident({ id: 201, systemId: 1, eventId: 101, status: "observing", observationUntil: e301Until, restorationWaitPending: true });
    await seedEvent({ id: 102, systemId: 2, account: "0042", brand: "RADIOENGE", qualifier: "E", eventCode: "369", description: "Cliente com problema de Internet", receivedAt: start });
    await seedIncident({ id: 202, systemId: 2, eventId: 102, status: "observing", observationUntil: e369Until, restorationWaitPending: true });
    await orm.insert(contactIdCodes).values([
      { code: "301", qualifier: "E", fabricante: "RADIOENGE", description: "Problema de energia", fechaComRestauracao: 1, codigoRestauracao: "301", tempoEsperaSegundos: 1800 },
      { code: "301", qualifier: "R", fabricante: "RADIOENGE", description: "Energia restaurada" },
      { code: "369", qualifier: "E", fabricante: "RADIOENGE", description: "Cliente com problema de Internet", fechaComRestauracao: 1, codigoRestauracao: "369", tempoEsperaSegundos: 180 },
      { code: "369", qualifier: "R", fabricante: "RADIOENGE", description: "Internet restaurada" },
    ]);

    expect(await promoteExpiredRestorationWaitsWithDb(orm, new Date(e369Until.getTime() - 1))).toEqual([]);
    const e369Pending = await findIncidentForRestoration({ alarmSystemId: 2, account: "0042", restorationCode: "369" });
    expect(e369Pending?.incident.id).toBe(202);
    const { finalizeIncidentWithRestoration } = await import("./db");
    const e369RestoredAt = new Date(e369Until.getTime() - 1_000);
    await finalizeIncidentWithRestoration({ ...e369Pending!, restorationEvent: { eventCode: "369", description: "Internet restaurada", restoredAt: e369RestoredAt } });
    expect(await promoteExpiredRestorationWaitsWithDb(orm, e369Until)).toEqual([]);
    expect(await orm.select().from(incidents).where(eq(incidents.id, 201))).toMatchObject([{ status: "observing", restorationWaitPending: true, observationUntil: e301Until }]);
    expect(await orm.select().from(incidents).where(eq(incidents.id, 202))).toMatchObject([{ status: "closed", restorationWaitPending: false, observationUntil: null }]);
    expect(await promoteExpiredRestorationWaitsWithDb(orm, e301Until)).toMatchObject([{ incidentId: 201, eventId: 101, eventCode: "301" }]);

    const e301Pending = await findIncidentForRestoration({ alarmSystemId: 1, account: "0041", restorationCode: "301" });
    expect(e301Pending?.incident.id).toBe(201);
    const e301RestoredAt = new Date(e301Until.getTime() + 5_000);
    await finalizeIncidentWithRestoration({ ...e301Pending!, restorationEvent: { eventCode: "301", description: "Energia restaurada", restoredAt: e301RestoredAt } });
    expect(await orm.select().from(occurrences).orderBy(occurrences.eventCode)).toMatchObject([
      { incidentId: 201, eventCode: "301", observations: "Finalizado com a restauração R301 — Energia restaurada", finalizedAt: e301RestoredAt },
      { incidentId: 202, eventCode: "369", observations: "Finalizado com a restauração R369 — Internet restaurada", finalizedAt: e369RestoredAt },
    ]);
    expect(await orm.select().from(incidents).orderBy(incidents.id)).toMatchObject([
      { id: 201, status: "closed" },
      { id: 202, status: "closed" },
    ]);
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

    await orm.insert(incidentPanelLeases).values({ incidentId: 201, operatorId: 9, authSessionId: 91, leaseToken: "00000000-0000-4000-8000-000000000201", expiresAt: new Date("2027-01-01Z") });
    const candidate = await findRadioengeKeepAliveObservationForRestoration({ alarmSystemId: 1, account: "0041" });
    expect(candidate?.incident.id).toBe(201);
    const result = await finalizeRadioengeKeepAliveFailureWithRestoration({
      incidentId: 201,
      failureEventId: 101,
      restorationEventId: 102,
      alarmSystemId: 1,
      restoredAt,
    });

    expect(await orm.select().from(incidentPanelLeases)).toHaveLength(0);
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

  it("consulta os 20 eventos mais recentes de todas as centrais do cliente e recusa ocorrência fechada", async () => {
    await pool.query("INSERT INTO alarm_systems (id,clientId,account,brand,model,receiverPort,isActive) VALUES (3,1,'0099','JFL','Central secundária',9061,1)");
    for (let id = 100; id <= 120; id += 1) {
      const systemId = id % 2 === 0 ? 1 : 3;
      await seedEvent({
        id,
        systemId,
        account: systemId === 1 ? "0041" : "0099",
        brand: "JFL",
        qualifier: id % 2 === 0 ? "E" : "R",
        eventCode: "130",
        receivedAt: new Date(`2026-11-14T10:${String(id - 100).padStart(2, "0")}:00.000Z`),
      });
    }
    await seedEvent({ id: 201, systemId: 2, account: "0042", brand: "JFL", qualifier: "E", eventCode: "130", receivedAt: new Date("2026-11-14T11:00:00.000Z") });
    await seedIncident({ id: 301, systemId: 1, eventId: 100, status: "attending" });

    const result = await listRecentClientEventsForOpenIncident(301, 20);
    expect(result?.incidentEventId).toBe(100);
    expect(result?.events).toHaveLength(20);
    expect(result?.events[0]).toMatchObject({ id: 120, account: "0041", systemModel: "Painel de teste" });
    expect(result?.events.at(-1)?.id).toBe(101);
    expect(result?.events.some((event) => event.id === 201)).toBe(false);
    expect(Object.keys(result!.events[0])).not.toContain("rawData");

    await pool.query("UPDATE incidents SET status = 'closed' WHERE id = 301");
    await expect(listRecentClientEventsForOpenIncident(301, 20)).resolves.toBeUndefined();
    await pool.query("INSERT INTO incidents (id,eventId,alarmSystemId,clientId,status,priority) VALUES (302,100,1,2,'attending','high')");
    await expect(listRecentClientEventsForOpenIncident(302, 20)).resolves.toBeUndefined();
    await pool.query("INSERT INTO incidents (id,eventId,alarmSystemId,clientId,status,priority) VALUES (303,100,1,NULL,'attending','high')");
    const resolvedFromSystem = await listRecentClientEventsForOpenIncident(303, 20);
    expect(resolvedFromSystem?.events).toHaveLength(20);
    await pool.query("INSERT INTO incidents (id,eventId,alarmSystemId,clientId,status,priority) VALUES (304,100,NULL,NULL,'attending','high')");
    await expect(listRecentClientEventsForOpenIncident(304, 20)).resolves.toBeUndefined();
  });
});
