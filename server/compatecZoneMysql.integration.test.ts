import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import { buildCompatecPhysicalZonePayload } from "./remoteCommandContract";
import {
  appendIncidentNote,
  createExclusiveCompatecPhysicalCommand,
  dispatchAlarmRemoteCommand,
  getPendingCompatecCommand,
  recordRemoteCommandConfirmation,
  setDbForTesting,
} from "./db";
import {
  alarmEvents,
  alarmRemoteCommands,
  alarmSystems,
  alarmZones,
  clients,
  incidents,
  occurrences,
  partnerCompanies,
  users,
} from "../drizzle/schema";

// Opt-in explícito somente para socket Unix privado local; não consulta DATABASE_URL.
const socket = process.env.POLICE_SHIFT_TEST_SOCKET;
const localEnabled = Boolean(socket?.startsWith("/tmp/police-shift-db/") && fs.existsSync(socket));
const database = `police_compatec_test_${process.pid}`;
const TABLES = [
  "users",
  "clients",
  "partner_companies",
  "alarm_systems",
  "alarm_zones",
  "alarm_remote_commands",
  "occurrences",
  "incidents",
  "alarm_events",
];
const SYSTEM_ID = 1;
const CLIENT_ID = 1;
const OPERATOR_ID = 1;
const ZONE_NUMBER = 3;

let pool!: mysql.Pool;
let orm!: ReturnType<typeof drizzle>;

function snapshotDDL() {
  const snapshot = JSON.parse(fs.readFileSync(new URL("../drizzle/meta/0048_snapshot.json", import.meta.url), "utf8"));
  return TABLES.map((name) => {
    const table = snapshot.tables[name];
    if (!table) throw new Error(`Tabela ${name} ausente em drizzle/meta/0048_snapshot.json`);
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

async function fixture() {
  await orm.insert(users).values({ id: OPERATOR_ID, openId: "compatec-test-operator", name: "Operador Compatec", role: "operator" });
  // O helper de snapshot do teste cria somente as tabelas usadas nesta integração;
  // partner_companies.managingCompanyId é mantido como referência sem FK, tal como no teste de escala.
  await orm.insert(partnerCompanies).values({ id: 1, managingCompanyId: 1, name: "Parceira fictícia" });
  await orm.insert(clients).values({
    id: CLIENT_ID,
    partnerCompanyId: 1,
    type: "pj",
    propertyType: "company",
    name: "Cliente Compatec fictício",
    fantasyName: "Cliente Compatec",
    isActive: true,
  });
  await orm.insert(alarmSystems).values({
    id: SYSTEM_ID,
    clientId: CLIENT_ID,
    account: "0042",
    brand: "COMPATEC",
    model: "Painel Compatec de teste",
    macAddress: "A1B2C3",
    receiverPort: 9271,
    isActive: true,
  });
  await orm.insert(alarmZones).values({
    alarmSystemId: SYSTEM_ID,
    zoneNumber: ZONE_NUMBER,
    name: "Zona fictícia de teste",
    isActive: true,
  });
}

function commandData(commandType: "isolate_zone" | "restore_zone" | "query_status" | "query_sectors") {
  const isZoneCommand = commandType === "isolate_zone" || commandType === "restore_zone";
  return {
    alarmSystemId: SYSTEM_ID,
    operatorId: OPERATOR_ID,
    brand: "COMPATEC",
    commandType,
    transportMode: "microbus_compatec",
    status: "waiting_connection",
    zoneNumber: isZoneCommand ? ZONE_NUMBER : null,
    reason: `Teste controlado ${commandType}; nenhum painel físico será acessado`,
    commandPayload: isZoneCommand
      ? buildCompatecPhysicalZonePayload({ commandType, requestedBy: "Solicitante fictício", zoneNumber: ZONE_NUMBER })
      : commandType === "query_status" ? "MB=AK0\r\n" : "MB=AK1\r\n",
  };
}

// O helper de ocorrência Compatec só lê users/alarm_systems/clients e grava occurrences;
// envio também usa alarm_zones, confirmação usa incidents apenas para comandos vinculados,
// e appendIncidentNote usa incidents. Não há dependência de tabelas adicionais neste fluxo.
describe.skipIf(!localEnabled)("Compatec zona · integração MariaDB privado por socket", () => {
  beforeAll(async () => {
    const admin = await mysql.createConnection({ socketPath: socket!, user: "root", multipleStatements: true });
    try {
      await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
    } finally {
      await admin.end();
    }
    pool = mysql.createPool({ socketPath: socket!, user: "root", database, connectionLimit: 4, timezone: "Z", multipleStatements: true });
    await pool.query(snapshotDDL());
    orm = drizzle(pool);
    setDbForTesting(orm);
  });

  beforeEach(async () => {
    for (const table of [...TABLES].reverse()) await pool.query(`DELETE FROM \`${table}\``);
    await fixture();
  });

  afterAll(async () => {
    setDbForTesting(null);
    if (pool) {
      try {
        await pool.query(`DROP DATABASE \`${database}\``);
      } finally {
        await pool.end();
      }
    }
  });

  it.each(["isolate_zone", "restore_zone"] as const)("registra %s como ocorrência auditável e trata KA1 como recebimento, não confirmação de bypass", async (commandType) => {
    const reservation = await createExclusiveCompatecPhysicalCommand(commandData(commandType));
    expect(reservation.created).toBe(true);
    if (!reservation.created) throw new Error("A reserva Compatec deveria ter sido criada");
    const commandId = reservation.id;

    const initialOccurrences = await orm.select().from(occurrences);
    expect(initialOccurrences).toHaveLength(1);
    const occurrenceId = initialOccurrences[0].id;
    expect(await orm.select().from(alarmEvents)).toHaveLength(0);
    expect(await orm.select().from(incidents)).toHaveLength(0);
    expect(await getPendingCompatecCommand(SYSTEM_ID)).toMatchObject({ id: commandId, zoneNumber: ZONE_NUMBER });

    const send = vi.fn(() => ({
      sent: true,
      payload: "BYTES FICTÍCIOS: MB=AK2[...]\\r\\nMB=AK1[...]\\r\\n",
    }));
    const dispatch = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID,
      commandId,
      requiredZoneNumber: ZONE_NUMBER,
      expectedStatuses: ["waiting_connection"],
      unavailableStatus: "failed",
      sentResponsePayload: "Quadros fictícios gravados no socket de teste; aguardando KA1.",
      send,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(dispatch).toMatchObject({ sent: true, status: "sent", payload: expect.stringContaining("BYTES FICTÍCIOS") });
    expect((await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, commandId)))[0]).toMatchObject({ status: "sent", panelConfirmedAt: null });

    const confirmedAt = new Date("2026-11-12T18:00:00.000Z");
    const confirmation = await recordRemoteCommandConfirmation({
      commandId,
      responsePayload: "MB=KA1[0008]\\r\\n",
      confirmedAt,
    });
    expect(confirmation).toMatchObject({ recorded: true, commandId, occurrenceId });

    const [confirmedCommand] = await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, commandId));
    const afterConfirmation = await orm.select().from(occurrences);
    expect(confirmedCommand).toMatchObject({ status: "responded", panelConfirmedAt: null, responsePayload: "MB=KA1[0008]\\r\\n" });
    expect(afterConfirmation).toHaveLength(1);
    expect(afterConfirmation[0].id).toBe(occurrenceId);
    expect(afterConfirmation[0].observations).toContain("Solicitado por: Solicitante fictício");
    expect(afterConfirmation[0].observations).toContain(`Zona: ${ZONE_NUMBER}`);
    expect(afterConfirmation[0].observations).toContain("indica recebimento do comando, não confirmação do estado final do bypass");
    expect(await orm.select().from(alarmEvents)).toHaveLength(0);
    expect(await orm.select().from(incidents)).toHaveLength(0);

    const repeated = await recordRemoteCommandConfirmation({
      commandId,
      responsePayload: "MB=KA1[0008]\\r\\n",
      confirmedAt,
    });
    expect(repeated).toMatchObject({ recorded: true, commandId, occurrenceId });
    expect(await orm.select().from(occurrences)).toHaveLength(1);
    expect((await orm.select().from(occurrences))[0].id).toBe(occurrenceId);
    expect((await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, commandId)))[0].panelConfirmedAt).toBeNull();
  });

  it("bloqueia e audita a transmissão se a zona fica inativa enquanto o comando aguarda conexão", async () => {
    const reservation = await createExclusiveCompatecPhysicalCommand(commandData("isolate_zone"));
    expect(reservation.created).toBe(true);
    if (!reservation.created) throw new Error("A reserva Compatec deveria ter sido criada");
    const commandId = reservation.id;
    expect(await getPendingCompatecCommand(SYSTEM_ID)).toMatchObject({ id: commandId, zoneNumber: ZONE_NUMBER });

    await orm.update(alarmZones).set({ isActive: false }).where(eq(alarmZones.alarmSystemId, SYSTEM_ID));
    const send = vi.fn(() => ({ sent: true, payload: "BYTES FICTÍCIOS QUE NÃO DEVEM SER ENVIADOS" }));
    const result = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID,
      commandId,
      requiredZoneNumber: ZONE_NUMBER,
      expectedStatuses: ["waiting_connection"],
      unavailableStatus: "failed",
      sentResponsePayload: "Não deveria ser alcançado",
      send,
    });

    expect(result).toMatchObject({ sent: false, status: "failed" });
    expect(send).not.toHaveBeenCalled();
    expect((await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, commandId)))[0]).toMatchObject({
      status: "failed",
      responsePayload: expect.stringContaining("zona 3 não está mais cadastrada como ativa"),
    });
    const rows = await orm.select().from(occurrences);
    expect(rows).toHaveLength(1);
    expect(rows[0].observations).toContain("não está mais cadastrada como ativa");
    expect(rows[0].description).toContain("Falha; a central não confirmou o comando");
    expect(await orm.select().from(alarmEvents)).toHaveLength(0);
    expect(await orm.select().from(incidents)).toHaveLength(0);
  });

  it("serializa reserva de zona contra consultas AK0/AK1 simultâneas na mesma central", async () => {
    const candidates = [
      commandData("isolate_zone"),
      commandData("query_status"),
      commandData("query_sectors"),
    ];
    const results = await Promise.all(candidates.map((data) => createExclusiveCompatecPhysicalCommand(data)));

    const winners = results.filter((result) => result.created);
    expect(winners).toHaveLength(1);
    expect(results.filter((result) => !result.created)).toHaveLength(2);
    const [active] = await orm.select().from(alarmRemoteCommands);
    expect(await orm.select().from(alarmRemoteCommands)).toHaveLength(1);
    expect(active.status).toBe("waiting_connection");
    const [winnerIndex] = results.flatMap((result, index) => result.created ? [index] : []);
    expect(await orm.select().from(occurrences)).toHaveLength(winnerIndex === 0 ? 1 : 0);
    expect(await orm.select().from(alarmEvents)).toHaveLength(0);
    expect(await orm.select().from(incidents)).toHaveLength(0);
  });

  it("registra dispatch_unknown após send lançar e nunca reenvia o comando", async () => {
    const reservation = await createExclusiveCompatecPhysicalCommand(commandData("restore_zone"));
    expect(reservation.created).toBe(true);
    if (!reservation.created) throw new Error("A reserva Compatec deveria ter sido criada");
    const commandId = reservation.id;
    const send = vi.fn(() => {
      throw new Error("Falha fictícia de escrita no socket");
    });
    const request = {
      alarmSystemId: SYSTEM_ID,
      commandId,
      requiredZoneNumber: ZONE_NUMBER,
      expectedStatuses: ["waiting_connection"],
      unavailableStatus: "failed",
      sentResponsePayload: "Não deveria haver sucesso",
      send,
    };

    const firstAttempt = await dispatchAlarmRemoteCommand(request);
    expect(firstAttempt).toMatchObject({ sent: false, status: "dispatch_unknown" });
    expect(send).toHaveBeenCalledTimes(1);
    const retry = await dispatchAlarmRemoteCommand(request);
    expect(retry).toMatchObject({ sent: false, status: "dispatch_unknown" });
    expect(send).toHaveBeenCalledTimes(1);

    const [command] = await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, commandId));
    expect(command.status).toBe("dispatch_unknown");
    expect(command.responsePayload).toContain("Não reenviar automaticamente");
    expect((await orm.select().from(occurrences)).map((row) => row.id)).toEqual([expect.any(Number)]);
    expect((await orm.select().from(occurrences))[0].observations).toContain("Resultado indeterminado");
    expect(await orm.select().from(alarmEvents)).toHaveLength(0);
    expect(await orm.select().from(incidents)).toHaveLength(0);
  });

  it("anexa nota apenas ao incidente da central correspondente, sem criar outro incidente", async () => {
    const inserted = await orm.insert(incidents).values({
      eventId: 9876,
      alarmSystemId: SYSTEM_ID,
      clientId: CLIENT_ID,
      status: "attending",
      notes: "Nota original",
    });
    const incidentId = Number(inserted[0].insertId);

    await appendIncidentNote(incidentId, SYSTEM_ID, "Nota da central correta");
    await appendIncidentNote(incidentId, SYSTEM_ID + 1, "Nota de outra central que deve ser ignorada");

    const rows = await orm.select().from(incidents);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: incidentId, alarmSystemId: SYSTEM_ID });
    expect(rows[0].notes).toBe("Nota original\nNota da central correta");
    expect(await orm.select().from(alarmEvents)).toHaveLength(0);
    expect(await orm.select().from(occurrences)).toHaveLength(0);
  });
});
