import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { authSessions, incidentHistory, incidentPanelLeases, incidents, operatorShiftMessages } from "../drizzle/schema";
import { clearPanelLease, openIncidentPanelWithDb, pauseIncidentPanelWithDb, renewIncidentPanelWithDb, PANEL_LEASE_TTL_MS, type PanelActor } from "./incidentPanelLease";

// Opt-in apenas para socket local dedicado; nunca consulta DATABASE_URL nem usa rede.
const socket = process.env.POLICE_SHIFT_TEST_SOCKET;
const localEnabled = Boolean(socket?.startsWith("/tmp/police-shift-db") && fs.existsSync(socket));
const now = new Date("2030-02-03T04:05:06.000Z");
const database = `police_panel_${process.pid}`;
const TABLES = ["users", "auth_sessions", "incidents", "incident_history", "incident_panel_leases", "operator_shift_messages"];
let pool: mysql.Pool;
let orm: ReturnType<typeof drizzle>;

function snapshotDDL() {
  const snapshot = JSON.parse(fs.readFileSync(new URL("../drizzle/meta/0059_snapshot.json", import.meta.url), "utf8"));
  return TABLES.map((name) => {
    const table = snapshot.tables[name];
    const columns = Object.values(table.columns).map((column: any) => {
      let value = `\`${column.name}\` ${column.type}${column.notNull ? " NOT NULL" : " NULL"}${column.autoincrement ? " AUTO_INCREMENT" : ""}`;
      if (Object.hasOwn(column, "default")) value += ` DEFAULT ${typeof column.default === "boolean" ? Number(column.default) : column.default}`;
      return value;
    });
    for (const key of Object.values(table.compositePrimaryKeys) as any[]) columns.push(`PRIMARY KEY (${key.columns.map((col: string) => `\`${col}\``).join(",")})`);
    for (const key of Object.values(table.uniqueConstraints) as any[]) columns.push(`UNIQUE KEY \`${key.name}\` (${key.columns.map((col: string) => `\`${col}\``).join(",")})`);
    for (const key of Object.values(table.indexes) as any[]) columns.push(`${key.isUnique ? "UNIQUE " : ""}KEY \`${key.name}\` (${key.columns.map((col: string) => `\`${col}\``).join(",")})`);
    return `CREATE TABLE \`${name}\` (${columns.join(",")}) ENGINE=InnoDB`;
  }).join(";\n");
}

const actors: PanelActor[] = [
  { operatorId: 1, operatorName: "Amanda", authSessionId: 101, leaseToken: "11111111-1111-4111-8111-111111111111" },
  { operatorId: 2, operatorName: "Yasmin", authSessionId: 102, leaseToken: "22222222-2222-4222-8222-222222222222" },
  { operatorId: 3, operatorName: "Stephane", authSessionId: 103, leaseToken: "33333333-3333-4333-8333-333333333333" },
];

async function fixture() {
  await pool.query("INSERT INTO users (id,openId,name,role) VALUES (1,'panel-amanda','Amanda','operator'),(2,'panel-yasmin','Yasmin','operator'),(3,'panel-stephane','Stephane','operator')");
  await orm.insert(authSessions).values(actors.map((actor, index) => ({
    id: actor.authSessionId,
    userId: actor.operatorId,
    tokenHash: String.fromCharCode(97 + index).repeat(64),
    createdAt: new Date(now.getTime() - 1_000),
    expiresAt: new Date("2035-01-01T00:00:00.000Z"),
  })));
  await orm.insert(incidents).values({ id: 401, eventId: 1401, status: "waiting", notes: "Anotação inicial preservada", version: 0 });
}

async function addIncident(id: number, status: "waiting" | "attending" | "observing" | "dispatched" | "maintenance" | "closed", operatorId: number | null = null, parentIncidentId: number | null = null) {
  if (id === 401) {
    await orm.update(incidents).set({ parentIncidentId, operatorId, status, version: 0 }).where(eq(incidents.id, id));
    return;
  }
  await orm.insert(incidents).values({ id, eventId: 1000 + id, parentIncidentId, operatorId, status, notes: `Anotação ${id}`, version: 0 });
}

async function leaseFor(incidentId = 401) {
  const rows = await orm.select().from(incidentPanelLeases).where(eq(incidentPanelLeases.incidentId, incidentId));
  return rows[0];
}

async function historyFor(incidentId = 401) {
  return orm.select().from(incidentHistory).where(eq(incidentHistory.incidentId, incidentId)).orderBy(incidentHistory.id);
}

// O DDL deriva somente das seis tabelas necessárias no snapshot atual.
describe.skipIf(!localEnabled)("lease do painel de ocorrência · MariaDB local isolado", () => {
  beforeAll(async () => {
    const admin = await mysql.createConnection({ socketPath: socket!, user: "root", multipleStatements: true });
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
    await admin.end();
    pool = mysql.createPool({ socketPath: socket!, user: "root", database, connectionLimit: 4, timezone: "Z", multipleStatements: true });
    await pool.query(snapshotDDL());
    orm = drizzle(pool);
  });

  beforeEach(async () => {
    for (const table of [...TABLES].reverse()) await pool.query(`DELETE FROM \`${table}\``);
    await fixture();
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DROP DATABASE \`${database}\``);
      await pool.end();
    }
  });

  it.each([
    ["waiting", 2, "attending"],
    ["attending", 2, "attending"],
    ["observing", 2, "observing"],
    ["dispatched", 2, "dispatched"],
    ["maintenance", 2, "maintenance"],
  ] as const)("assume=true adquire o mesmo incidente sem lease antigo (%s)", async (before, priorOperator, after) => {
    await orm.update(incidents).set({ status: before, operatorId: priorOperator }).where(eq(incidents.id, 401));
    const opened = await openIncidentPanelWithDb(orm, { incidentId: 401, assume: true }, actors[0], now);
    expect(opened).toMatchObject({ id: 401, status: after, operatorId: 1, leaseToken: actors[0].leaseToken });
    const [stored] = await orm.select().from(incidents).where(eq(incidents.id, 401));
    expect(stored).toMatchObject({ id: 401, status: after, operatorId: 1 });
    expect(await orm.select().from(incidents)).toHaveLength(1);
    expect(await leaseFor()).toMatchObject({ incidentId: 401, operatorId: 1, authSessionId: 101, leaseToken: actors[0].leaseToken });
  });

  it("bloqueia outra tela mesmo quando o operador e a sessão são os mesmos", async () => {
    await addIncident(401, "attending", 1);
    const competingLease = { ...actors[0], leaseToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
    await orm.insert(incidentPanelLeases).values({ incidentId: 401, operatorId: competingLease.operatorId, authSessionId: competingLease.authSessionId, leaseToken: competingLease.leaseToken, expiresAt: new Date(now.getTime() + PANEL_LEASE_TTL_MS) });
    await expect(openIncidentPanelWithDb(orm, { incidentId: 401 }, actors[0], now)).rejects.toThrow("em atendimento");
    expect(await leaseFor()).toMatchObject({ leaseToken: competingLease.leaseToken });
    expect(await historyFor()).toHaveLength(0);
  });

  it("preserva e encaminha o recado de turno ativo ao operador que assume", async () => {
    await addIncident(401, "observing", 3);
    await orm.insert(operatorShiftMessages).values({
      fromUserId: 3,
      fromOperatorName: "Stephane",
      fromAttendanceId: 303,
      toUserId: 1,
      toOperatorName: "Amanda",
      incidentId: 401,
      account: "TEST-401",
      message: "Aguardar confirmação da equipe local.",
      isCurrent: true,
    });
    const opened = await openIncidentPanelWithDb(orm, { incidentId: 401, assume: true }, actors[1], now);
    expect(opened).toMatchObject({ status: "observing", forwardedMessage: { toUserId: 2, toOperatorName: "Yasmin", incidentId: 401 } });
    const messages = await orm.select().from(operatorShiftMessages).orderBy(operatorShiftMessages.id);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ isCurrent: false, toUserId: 1, message: "Aguardar confirmação da equipe local." });
    expect(messages[1]).toMatchObject({ isCurrent: true, fromUserId: 3, toUserId: 2, incidentId: 401, message: "Aguardar confirmação da equipe local." });
  });

  it("serializa duas aquisições concorrentes e concede exatamente uma", async () => {
    const results = await Promise.allSettled(actors.slice(0, 2).map((actor) => openIncidentPanelWithDb(orm, { incidentId: 401, assume: true }, actor, now)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const [stored] = await orm.select().from(incidents).where(eq(incidents.id, 401));
    const lease = await leaseFor();
    expect(lease?.operatorId).toBe(stored.operatorId);
    expect(await orm.select().from(incidentPanelLeases)).toHaveLength(1);
    expect(await historyFor()).toHaveLength(1);
  });

  it("não abre ocorrência fechada", async () => {
    await orm.update(incidents).set({ status: "closed" }).where(eq(incidents.id, 401));
    await expect(openIncidentPanelWithDb(orm, { incidentId: 401, assume: true }, actors[0], now)).rejects.toThrow("não encontrada");
    expect(await leaseFor()).toBeUndefined();
    expect(await historyFor()).toHaveLength(0);
  });

  it("permite takeover após expiração e rejeita renovar/pausar com token antigo sem apagar o lease novo", async () => {
    await addIncident(401, "attending", 1);
    await orm.insert(incidentPanelLeases).values({ incidentId: 401, operatorId: 1, authSessionId: 101, leaseToken: actors[0].leaseToken, expiresAt: new Date(now.getTime() - 1) });
    await openIncidentPanelWithDb(orm, { incidentId: 401, assume: true }, actors[1], now);
    await expect(renewIncidentPanelWithDb(orm, 401, actors[0], now)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(pauseIncidentPanelWithDb(orm, 401, "Aguardar retorno do responsável", actors[0], now)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await leaseFor()).toMatchObject({ operatorId: 2, authSessionId: 102, leaseToken: actors[1].leaseToken });
    expect((await orm.select().from(incidents).where(eq(incidents.id, 401)))[0]).toMatchObject({ operatorId: 2, pauseReason: null });
  });

  it("release tardio com token antigo não apaga o lease concedido à tela nova", async () => {
    await addIncident(401, "attending", 1);
    await orm.insert(incidentPanelLeases).values({ incidentId: 401, operatorId: 1, authSessionId: 101, leaseToken: actors[0].leaseToken, expiresAt: new Date(now.getTime() - 1) });
    await openIncidentPanelWithDb(orm, { incidentId: 401, assume: true }, actors[1], now);
    await orm.transaction((tx) => clearPanelLease(tx, 401, actors[0]));
    expect(await leaseFor()).toMatchObject({ operatorId: 2, authSessionId: 102, leaseToken: actors[1].leaseToken });
  });

  it.each(["revogada", "expirada"] as const)("lease de sessão %s não bloqueia operador com sessão válida", async (invalidity) => {
    await addIncident(401, "attending", 1);
    await orm.insert(incidentPanelLeases).values({ incidentId: 401, operatorId: 1, authSessionId: 101, leaseToken: actors[0].leaseToken, expiresAt: new Date(now.getTime() + PANEL_LEASE_TTL_MS) });
    if (invalidity === "revogada") {
      await orm.update(authSessions).set({ revokedAt: new Date(now.getTime() - 1) }).where(eq(authSessions.id, 101));
    } else {
      await orm.update(authSessions).set({ expiresAt: new Date(now.getTime() - 1) }).where(eq(authSessions.id, 101));
    }
    await openIncidentPanelWithDb(orm, { incidentId: 401, assume: true }, actors[1], now);
    expect(await leaseFor()).toMatchObject({ operatorId: 2, authSessionId: 102, leaseToken: actors[1].leaseToken });
  });

  it("rejeita motivo ausente/curto sem alterar lease nem histórico", async () => {
    await openIncidentPanelWithDb(orm, { incidentId: 401 }, actors[0], now);
    const beforeIncident = (await orm.select().from(incidents).where(eq(incidents.id, 401)))[0];
    const beforeLease = await leaseFor();
    const beforeHistory = await historyFor();
    for (const reason of ["", "   ", "oi", undefined]) {
      await expect(pauseIncidentPanelWithDb(orm, 401, reason as string, actors[0], now)).rejects.toThrow("motivo operacional");
    }
    expect((await orm.select().from(incidents).where(eq(incidents.id, 401)))[0]).toEqual(beforeIncident);
    expect(await leaseFor()).toEqual(beforeLease);
    expect(await historyFor()).toEqual(beforeHistory);
    expect(await orm.select().from(operatorShiftMessages)).toHaveLength(0);
  });

  it("pausa sem mudar status, preserva notas e histórico e não envia mensagem de turno", async () => {
    await orm.update(incidents).set({ status: "observing" }).where(eq(incidents.id, 401));
    await orm.insert(incidentHistory).values({ incidentId: 401, operatorId: 3, operatorName: "Stephane", action: "legacy_note", statusBefore: "observing", statusAfter: "observing", note: "Histórico legado preservado" });
    await openIncidentPanelWithDb(orm, { incidentId: 401 }, actors[0], now);
    const reason = "Aguardar retorno do responsável";
    await pauseIncidentPanelWithDb(orm, 401, reason, actors[0], now);
    const [stored] = await orm.select().from(incidents).where(eq(incidents.id, 401));
    expect(stored).toMatchObject({ status: "observing", pauseReason: reason });
    expect(stored.notes).toBe(`Anotação inicial preservada\n${reason}`);
    expect(await leaseFor()).toBeUndefined();
    const history = await historyFor();
    expect(history.map((row) => row.action)).toEqual(["legacy_note", "attendance_opened", "paused"]);
    expect(history[0].note).toBe("Histórico legado preservado");
    expect(history[2]).toMatchObject({ statusBefore: "observing", statusAfter: "observing", note: reason });
    expect(await orm.select().from(operatorShiftMessages)).toHaveLength(0);
  });

  it("repete a mesma pausa de forma idempotente", async () => {
    await openIncidentPanelWithDb(orm, { incidentId: 401 }, actors[0], now);
    const reason = "Aguardar retorno do responsável";
    const first = await pauseIncidentPanelWithDb(orm, 401, reason, actors[0], now);
    const afterFirst = (await orm.select().from(incidents).where(eq(incidents.id, 401)))[0];
    const firstHistory = await historyFor();
    const second = await pauseIncidentPanelWithDb(orm, 401, reason, actors[0], now);
    expect(second).toEqual(first);
    expect((await orm.select().from(incidents).where(eq(incidents.id, 401)))[0]).toEqual(afterFirst);
    expect(await historyFor()).toEqual(firstHistory);
    expect(await leaseFor()).toBeUndefined();
  });

  it("renova o TTL por 90 segundos sem criar auditoria duplicada", async () => {
    await openIncidentPanelWithDb(orm, { incidentId: 401 }, actors[0], now);
    const beforeHistory = await historyFor();
    const renewAt = new Date(now.getTime() + 30_000);
    const renewed = await renewIncidentPanelWithDb(orm, 401, actors[0], renewAt);
    expect(renewed.leaseExpiresAt.toISOString()).toBe(new Date(renewAt.getTime() + PANEL_LEASE_TTL_MS).toISOString());
    expect((await leaseFor())?.expiresAt.toISOString()).toBe(renewed.leaseExpiresAt.toISOString());
    expect(await historyFor()).toEqual(beforeHistory);
  });

  it("bloqueia a abertura do principal enquanto um atendimento filho legado está ativo", async () => {
    await addIncident(402, "attending", 2, 401);
    await expect(openIncidentPanelWithDb(orm, { incidentId: 401, assume: true }, actors[0], now)).rejects.toThrow("Atendimento legado #402 ainda aberto");
    expect(await leaseFor()).toBeUndefined();
    expect(await historyFor()).toHaveLength(0);
  });

  it("abrir novamente com o mesmo token renova a concessão sem duplicar auditoria nem assumir outra versão", async () => {
    const first = await openIncidentPanelWithDb(orm, { incidentId: 401 }, actors[0], now);
    const secondNow = new Date(now.getTime() + 10_000);
    const second = await openIncidentPanelWithDb(orm, { incidentId: 401 }, actors[0], secondNow);
    expect(second.leaseExpiresAt.toISOString()).toBe(new Date(secondNow.getTime() + PANEL_LEASE_TTL_MS).toISOString());
    expect(first.id).toBe(second.id);
    expect((await orm.select().from(incidents).where(eq(incidents.id, 401)))[0].version).toBe(1);
    expect(await historyFor()).toHaveLength(1);
    expect(await orm.select().from(incidentPanelLeases)).toHaveLength(1);
  });

  it("não permite adquirir com sessão inválida", async () => {
    const invalidActor = { ...actors[0], authSessionId: 999 };
    await expect(openIncidentPanelWithDb(orm, { incidentId: 401 }, invalidActor, now)).rejects.toThrow("encerrada ou substituída");
    expect((await orm.select().from(incidents).where(eq(incidents.id, 401)))[0]).toMatchObject({ status: "waiting", operatorId: null, version: 0 });
    expect(await leaseFor()).toBeUndefined();
    expect(await historyFor()).toHaveLength(0);
  });

  it("preserva índices únicos e dados legados ao reaplicar o SQL de upgrade", async () => {
    await orm.insert(incidentPanelLeases).values({ incidentId: 401, operatorId: 1, authSessionId: 101, leaseToken: actors[0].leaseToken, expiresAt: new Date(now.getTime() + PANEL_LEASE_TTL_MS) });
    let pauseReasonDropped = false;
    try {
      await pool.query("ALTER TABLE incidents DROP COLUMN pauseReason");
      pauseReasonDropped = true;
      const upgrade = fs.readFileSync(new URL("../deploy/upgrade_vps.sql", import.meta.url), "utf8");
      const marker = upgrade.lastIndexOf("-- Exclusividade temporária do painel aberto de cada atendimento.");
      const leaseUpgrade = upgrade.slice(marker);
      await pool.query(leaseUpgrade);
      await pool.query(leaseUpgrade);
      const [incidentRows] = await pool.query("SELECT id,status,notes,pauseReason FROM incidents WHERE id=401") as any;
      expect(incidentRows[0]).toMatchObject({ id: 401, status: "waiting", notes: "Anotação inicial preservada", pauseReason: null });
      expect(await leaseFor()).toMatchObject({ incidentId: 401, leaseToken: actors[0].leaseToken });
      const [indexes] = await pool.query("SHOW INDEX FROM incident_panel_leases") as any;
      expect(indexes.some((index: any) => index.Key_name === "PRIMARY" && index.Column_name === "incidentId")).toBe(true);
      expect(indexes.some((index: any) => index.Key_name === "incident_panel_leases_session_incident_unique" && Number(index.Non_unique) === 0)).toBe(true);
    } finally {
      if (pauseReasonDropped) {
        const [columns] = await pool.query("SHOW COLUMNS FROM incidents LIKE 'pauseReason'") as any;
        if (!columns.length) await pool.query("ALTER TABLE incidents ADD COLUMN pauseReason TEXT NULL");
      }
    }
  });
});
