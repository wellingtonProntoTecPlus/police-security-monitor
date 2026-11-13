import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, inArray } from "drizzle-orm";
import fs from "node:fs";
import {
  createExclusiveCompatecPhysicalCommand,
  dispatchAlarmRemoteCommand,
  listCompatecZoneArmSelections,
  resetCompatecZoneSelectionsOnDisarm,
  setCompatecZoneArmSelection,
  setDbForTesting,
  recordRemoteCommandConfirmation,
  updateAlarmRemoteCommandDelivery,
} from "./db";
import {
  alarmEvents,
  alarmRemoteCommands,
  alarmSystems,
  alarmZones,
  clients,
  compatecZoneArmSelections,
  incidents,
  occurrences,
  partnerCompanies,
  users,
} from "../drizzle/schema";

// Opt-in explícito somente para socket Unix privado local; nunca consulta DATABASE_URL.
const socket = process.env.POLICE_SHIFT_TEST_SOCKET;
const localEnabled = Boolean(socket?.startsWith("/tmp/police-shift-db/") && fs.existsSync(socket));
const database = `police_selection_test_${process.pid}`;
const TABLES = [
  "users",
  "clients",
  "partner_companies",
  "alarm_systems",
  "alarm_zones",
  "compatec_zone_arm_selections",
  "alarm_remote_commands",
  "occurrences",
  "incidents",
  "alarm_events",
];
const SYSTEM_ID = 1;
const CLIENT_ID = 1;
const OPERATOR_ID = 1;
const OTHER_OPERATOR_ID = 2;
const ZONE_NUMBERS = [3, 5] as const;

let pool!: mysql.Pool;
let orm!: ReturnType<typeof drizzle>;

function snapshotDDL() {
  const snapshot = JSON.parse(fs.readFileSync(new URL("../drizzle/meta/0049_snapshot.json", import.meta.url), "utf8"));
  return TABLES.map((name) => {
    const table = snapshot.tables[name];
    if (!table) throw new Error(`Tabela ${name} ausente em drizzle/meta/0049_snapshot.json`);
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
  await orm.insert(users).values([
    { id: OPERATOR_ID, openId: "selection-test-operator", name: "Operador Compatec", role: "operator" },
    { id: OTHER_OPERATOR_ID, openId: "selection-test-other-operator", name: "Outro Operador", role: "operator" },
  ]);
  // managingCompanyId é referência sem FK no recorte mínimo deste teste.
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
  await orm.insert(alarmZones).values(ZONE_NUMBERS.map((zoneNumber) => ({
    alarmSystemId: SYSTEM_ID,
    zoneNumber,
    name: `Zona fictícia ${zoneNumber}`,
    isActive: true,
  })));
  await insertEvent({ eventCode: "701", qualifier: "E", description: "Desarme Compatec E701 atual", receivedAt: new Date() });
}

async function insertEvent(input: {
  alarmSystemId?: number;
  account?: string;
  brand?: string;
  eventCode: string;
  qualifier: string;
  description?: string;
  receivedAt?: Date;
}) {
  const eventSystemId = input.alarmSystemId ?? SYSTEM_ID;
  const inserted = await orm.insert(alarmEvents).values({
    alarmSystemId: eventSystemId,
    account: input.account ?? (eventSystemId === SYSTEM_ID ? "0042" : "9999"),
    brand: input.brand ?? "COMPATEC",
    eventCode: input.eventCode,
    qualifier: input.qualifier,
    description: input.description ?? null,
    receivedAt: input.receivedAt ?? new Date(Date.now() + 60_000),
  });
  return Number(inserted[0].insertId);
}

async function selectZone(zoneNumber: number, operatorId = OPERATOR_ID) {
  const selection = await setCompatecZoneArmSelection({
    alarmSystemId: SYSTEM_ID,
    operatorId,
    zoneNumber,
    selected: true,
  });
  if (!selection.selected) throw new Error("A seleção Compatec deveria ter sido gravada");
  return selection;
}

function armCommandData(operatorId = OPERATOR_ID) {
  return {
    alarmSystemId: SYSTEM_ID,
    operatorId,
    brand: "COMPATEC",
    commandType: "arm",
    transportMode: "microbus_compatec",
    status: "waiting_connection",
    zoneNumber: null,
    reason: "Teste controlado de Arme Compatec; nenhum painel físico será acessado",
    commandPayload: JSON.stringify({ requestedBy: "Solicitante fictício" }),
  };
}

function expectedArmFrames(zoneNumbers: number[]) {
  const mask = Array.from({ length: 23 }, (_, index) => zoneNumbers.includes(index + 1) ? "0008" : "0000").join(",");
  return [`MB=AK2[${mask}]\r\n`, `MB=AK1[${mask}]\r\n`, "MB=AK4[4]\r\n"];
}

describe.skipIf(!localEnabled)("Compatec seleção de zonas · integração MariaDB privado por socket", () => {
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

  it("grava somente a seleção, com expiração de no máximo 60s, sem criar comando, ocorrência, incidente ou evento", async () => {
    const before = Date.now();
    const priorEvents = await orm.select().from(alarmEvents);
    expect(priorEvents).toHaveLength(1);
    expect(priorEvents[0]).toMatchObject({ brand: "COMPATEC", eventCode: "701", qualifier: "E", alarmSystemId: SYSTEM_ID });

    const selected = await selectZone(3);

    // A seleção começa durante a chamada, não antes das consultas da fixture.
    const remainingMs = selected.expiresAt.getTime() - Date.now();
    expect(selected.expiresAt.getTime()).toBeGreaterThan(before);
    expect(remainingMs).toBeGreaterThan(0);
    expect(remainingMs).toBeLessThanOrEqual(60_000);
    expect(await orm.select().from(compatecZoneArmSelections)).toMatchObject([
      { id: selected.id, alarmSystemId: SYSTEM_ID, operatorId: OPERATOR_ID, zoneNumber: 3, armCommandId: null },
    ]);
    expect(await listCompatecZoneArmSelections(SYSTEM_ID, OPERATOR_ID)).toMatchObject([
      { id: selected.id, zoneNumber: 3, armCommandId: null },
    ]);
    expect(await orm.select().from(alarmRemoteCommands)).toHaveLength(0);
    expect(await orm.select().from(occurrences)).toHaveLength(0);
    expect(await orm.select().from(incidents)).toHaveLength(0);
    expect((await orm.select().from(alarmEvents)).map((event) => event.id)).toEqual(priorEvents.map((event) => event.id));
  });

  it("rejeita o consumo por ID após expirar a seleção", async () => {
    const selected = await selectZone(3);
    await orm.update(compatecZoneArmSelections)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(compatecZoneArmSelections.id, selected.id));

    await expect(createExclusiveCompatecPhysicalCommand(armCommandData(), [selected.id]))
      .rejects.toThrow(/seleção de zona expirou ou mudou/i);

    expect(await listCompatecZoneArmSelections(SYSTEM_ID, OPERATOR_ID)).toHaveLength(0);
    expect(await orm.select().from(compatecZoneArmSelections)).toMatchObject([
      { id: selected.id, armCommandId: null },
    ]);
    expect(await orm.select().from(alarmRemoteCommands)).toHaveLength(0);
    expect(await orm.select().from(occurrences)).toHaveLength(0);
    expect(await orm.select().from(alarmEvents)).toHaveLength(1);
  });

  it("impede que outro operador consuma ou desmarque uma seleção válida alheia", async () => {
    const selected = await selectZone(3, OPERATOR_ID);

    await expect(setCompatecZoneArmSelection({
      alarmSystemId: SYSTEM_ID,
      operatorId: OTHER_OPERATOR_ID,
      zoneNumber: 3,
      selected: false,
    })).rejects.toThrow(/outro operador está preparando esta zona/i);
    await expect(createExclusiveCompatecPhysicalCommand(armCommandData(OTHER_OPERATOR_ID), [selected.id]))
      .rejects.toThrow(/seleção de zona expirou ou mudou/i);

    expect(await listCompatecZoneArmSelections(SYSTEM_ID, OTHER_OPERATOR_ID)).toHaveLength(0);
    expect(await listCompatecZoneArmSelections(SYSTEM_ID, OPERATOR_ID)).toMatchObject([
      { id: selected.id, zoneNumber: 3, armCommandId: null },
    ]);
    expect(await orm.select().from(alarmRemoteCommands)).toHaveLength(0);
    expect(await orm.select().from(occurrences)).toHaveLength(0);
  });

  it("consome somente em ARM, revalida todas as zonas ativas e registra builder AK2→AK1→AK4[4] e auditoria", async () => {
    const selected3 = await selectZone(3);
    const selected5 = await selectZone(5);
    const ids = [selected3.id, selected5.id];

    await expect(createExclusiveCompatecPhysicalCommand({
      ...armCommandData(),
      commandType: "disarm",
    }, ids)).rejects.toThrow(/seleções de zona só podem ser consumidas pelo arme/i);
    expect(await orm.select().from(compatecZoneArmSelections)).toMatchObject([
      { id: selected3.id, armCommandId: null },
      { id: selected5.id, armCommandId: null },
    ]);

    await orm.update(alarmZones).set({ isActive: false }).where(eq(alarmZones.zoneNumber, 5));
    await expect(createExclusiveCompatecPhysicalCommand(armCommandData(), ids))
      .rejects.toThrow(/uma zona selecionada não está mais cadastrada como ativa/i);
    expect(await orm.select().from(alarmRemoteCommands)).toHaveLength(0);
    expect(await orm.select().from(occurrences)).toHaveLength(0);
    expect((await orm.select().from(compatecZoneArmSelections)).every((row) => row.armCommandId === null)).toBe(true);

    await orm.update(alarmZones).set({ isActive: true }).where(eq(alarmZones.zoneNumber, 5));
    const reservation = await createExclusiveCompatecPhysicalCommand(armCommandData(), ids);
    expect(reservation.created).toBe(true);
    if (!reservation.created) throw new Error("O Arme Compatec deveria ser reservado");
    expect(reservation.zoneNumbers).toEqual([3, 5]);

    const payload = JSON.parse(reservation.commandPayload);
    expect(payload).toMatchObject({
      mode: "physical_arm_with_zones",
      commandType: "arm",
      zoneNumbers: [3, 5],
      frames: expectedArmFrames([3, 5]),
      selectedBy: expect.arrayContaining([
        { zoneNumber: 3, operatorId: OPERATOR_ID, operatorName: "Operador Compatec" },
        { zoneNumber: 5, operatorId: OPERATOR_ID, operatorName: "Operador Compatec" },
      ]),
    });
    const [command] = await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, reservation.id));
    expect(command).toMatchObject({ commandType: "arm", status: "waiting_connection", commandPayload: reservation.commandPayload });

    const linkedSelections = await orm.select().from(compatecZoneArmSelections)
      .where(inArray(compatecZoneArmSelections.id, ids));
    expect(linkedSelections).toHaveLength(2);
    expect(linkedSelections.every((row) => row.armCommandId === reservation.id)).toBe(true);

    const rows = await orm.select().from(occurrences);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ operatorId: OPERATOR_ID, operatorName: "Operador Compatec", systemId: SYSTEM_ID });
    expect(rows[0].observations).toContain("Zonas selecionadas para inibir no Arme: 3, 5.");
    expect(rows[0].observations).toContain("Seleção zona 3: operador Operador Compatec");
    expect(rows[0].observations).toContain("Seleção zona 5: operador Operador Compatec");
    expect(await orm.select().from(incidents)).toHaveLength(0);
    expect(await orm.select().from(alarmEvents)).toHaveLength(1);
  });

  it("registra KA1 seguido de KA4 curto como duas respostas recebidas sem confirmar o estado final", async () => {
    const selected = await selectZone(3);
    const reservation = await createExclusiveCompatecPhysicalCommand(armCommandData(), [selected.id], "Solicitante fictício");
    if (!reservation.created) throw new Error("Reserva esperada");

    const firstWrite = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID, commandId: reservation.id, requiredZoneNumbers: [3],
      expectedStatuses: ["waiting_connection"], unavailableStatus: "failed",
      sentResponsePayload: "AK2→AK1 enviados; aguardando KA1.",
      send: () => ({ sent: true, payload: "AK2→AK1 fictícios" }),
    });
    expect(firstWrite.status).toBe("sent");

    const secondWrite = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID, commandId: reservation.id, requiredZoneNumbers: [3],
      expectedStatuses: ["sent"], unavailableStatus: "dispatch_unknown",
      sentResponsePayload: "MB=KA1 recebido; AK4[4] enviado.",
      send: () => ({ sent: true, payload: "AK4[4] fictício" }),
    });
    expect(secondWrite.status).toBe("sent");

    const result = await recordRemoteCommandConfirmation({
      commandId: reservation.id, responsePayload: "MB=KA4", confirmedAt: new Date(),
    });
    expect(result).toMatchObject({ recorded: true, commandType: "arm" });
    const [command] = await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, reservation.id));
    expect(command).toMatchObject({ status: "responded", panelConfirmedAt: null });
    expect(command.responsePayload).toContain("MB=KA1 recebido; AK4[4] enviado.");
    expect(command.responsePayload).toContain("MB=KA4");
    const [occurrence] = await orm.select().from(occurrences);
    expect(occurrence.description).toContain("Resposta KA4 recebida");
    expect(occurrence.observations).toContain("não confirma o estado final");
    expect(occurrence.observations).toContain("Solicitado por: Solicitante fictício");
    expect(await orm.select().from(occurrences)).toHaveLength(1);
    expect(await orm.select().from(incidents)).toHaveLength(0);
    expect(await orm.select().from(alarmEvents)).toHaveLength(1);
  });

  it("preserva ACK anterior e interrompe sem segundo envio se KA4 chegar antes de KA1", async () => {
    const selected = await selectZone(3);
    const reservation = await createExclusiveCompatecPhysicalCommand(armCommandData(), [selected.id], "Solicitante fictício");
    if (!reservation.created) throw new Error("Reserva esperada");
    const writes: string[] = [];
    await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID, commandId: reservation.id, requiredZoneNumbers: [3],
      expectedStatuses: ["waiting_connection"], unavailableStatus: "failed",
      sentResponsePayload: "AK2→AK1 enviados; aguardando KA1.",
      send: () => { writes.push("AK2", "AK1"); return { sent: true }; },
    });
    await updateAlarmRemoteCommandDelivery(reservation.id, {
      status: "dispatch_unknown", appendResponsePayload: true,
      responsePayload: "Resposta inesperada MB=KA4 antes de KA1; Arme interrompido.", executedAt: new Date(),
    });
    expect(writes).toEqual(["AK2", "AK1"]);
    const [command] = await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, reservation.id));
    expect(command.status).toBe("dispatch_unknown");
    expect(command.responsePayload).toContain("AK2→AK1 enviados; aguardando KA1.");
    expect(command.responsePayload).toContain("Resposta inesperada MB=KA4 antes de KA1");
    expect(command.panelConfirmedAt).toBeNull();
    const [occurrence] = await orm.select().from(occurrences);
    expect(occurrence.description).toContain("indeterminado");
    expect(await orm.select().from(incidents)).toHaveLength(0);
    expect(await orm.select().from(alarmEvents)).toHaveLength(1);
  });

  it("libera a seleção após indisponibilidade sem escrita: status failed e executedAt nulo", async () => {
    const selected = await selectZone(3);
    const reservation = await createExclusiveCompatecPhysicalCommand(armCommandData(), [selected.id]);
    expect(reservation.created).toBe(true);
    if (!reservation.created) throw new Error("O Arme Compatec deveria ser reservado");

    const send = vi.fn(() => ({ sent: false, message: "Socket local indisponível; nenhum quadro foi escrito" }));
    const result = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID,
      commandId: reservation.id,
      requiredZoneNumbers: [3, 5],
      expectedStatuses: ["waiting_connection"],
      unavailableStatus: "failed",
      sentResponsePayload: "Não deveria haver sucesso",
      send,
    });

    expect(result).toMatchObject({ sent: false, status: "failed" });
    expect(send).toHaveBeenCalledTimes(1);
    const [command] = await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, reservation.id));
    expect(command).toMatchObject({ status: "failed", executedAt: null });
    expect(command.responsePayload).toContain("nenhum quadro foi escrito");
    expect(await orm.select().from(compatecZoneArmSelections)).toHaveLength(0);

    const released = await selectZone(3);
    expect(released.id).not.toBe(selected.id);
    expect(await orm.select().from(compatecZoneArmSelections)).toMatchObject([
      { id: released.id, operatorId: OPERATOR_ID, zoneNumber: 3, armCommandId: null },
    ]);
    expect(await orm.select().from(alarmEvents)).toHaveLength(1);
  });

  it("mantém a seleção em dispatch_unknown e impede reenvio após exceção de send", async () => {
    const selected = await selectZone(3);
    const reservation = await createExclusiveCompatecPhysicalCommand(armCommandData(), [selected.id]);
    expect(reservation.created).toBe(true);
    if (!reservation.created) throw new Error("O Arme Compatec deveria ser reservado");

    const send = vi.fn(() => {
      throw new Error("Falha fictícia durante escrita no socket local");
    });
    const request = {
      alarmSystemId: SYSTEM_ID,
      commandId: reservation.id,
      requiredZoneNumbers: [3],
      expectedStatuses: ["waiting_connection"],
      unavailableStatus: "failed",
      sentResponsePayload: "Não deveria haver sucesso",
      send,
    };

    const first = await dispatchAlarmRemoteCommand(request);
    expect(first).toMatchObject({ sent: false, status: "dispatch_unknown" });
    expect(send).toHaveBeenCalledTimes(1);
    const retry = await dispatchAlarmRemoteCommand(request);
    expect(retry).toMatchObject({ sent: false, status: "dispatch_unknown" });
    expect(send).toHaveBeenCalledTimes(1);

    const [command] = await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, reservation.id));
    expect(command.status).toBe("dispatch_unknown");
    expect(command.responsePayload).toContain("Não reenviar automaticamente");
    expect(await orm.select().from(compatecZoneArmSelections)).toMatchObject([
      { id: selected.id, armCommandId: reservation.id, operatorId: OPERATOR_ID, zoneNumber: 3 },
    ]);
    await expect(setCompatecZoneArmSelection({
      alarmSystemId: SYSTEM_ID,
      operatorId: OPERATOR_ID,
      zoneNumber: 3,
      selected: false,
    })).rejects.toThrow(/zona vinculada a um arme/i);
    expect(await orm.select().from(alarmEvents)).toHaveLength(1);
  });

  it("só limpa seleções vinculadas com Desarme Compatec E701 persistido da mesma central; R701 e KA1 não liberam", async () => {
    const selected = await selectZone(3);
    const reservation = await createExclusiveCompatecPhysicalCommand(armCommandData(), [selected.id]);
    expect(reservation.created).toBe(true);
    if (!reservation.created) throw new Error("O Arme Compatec deveria ser reservado");

    await resetCompatecZoneSelectionsOnDisarm(SYSTEM_ID, 999_999);
    const otherSystemE701 = await insertEvent({ alarmSystemId: SYSTEM_ID + 1, eventCode: "701", qualifier: "E" });
    await resetCompatecZoneSelectionsOnDisarm(SYSTEM_ID, otherSystemE701);
    const restored701 = await insertEvent({ eventCode: "701", qualifier: "R" });
    await resetCompatecZoneSelectionsOnDisarm(SYSTEM_ID, restored701);
    const nonContactIdAck = await insertEvent({ eventCode: "KA1", qualifier: "E" });
    await resetCompatecZoneSelectionsOnDisarm(SYSTEM_ID, nonContactIdAck);
    const wrongBrand701 = await insertEvent({ brand: "JFL", eventCode: "701", qualifier: "E" });
    await resetCompatecZoneSelectionsOnDisarm(SYSTEM_ID, wrongBrand701);

    expect(await orm.select().from(compatecZoneArmSelections)).toMatchObject([
      { id: selected.id, armCommandId: reservation.id },
    ]);

    const disarmE701 = await insertEvent({
      eventCode: "701",
      qualifier: "E",
      description: "Desarme real Compatec E701 da mesma central",
    });
    await resetCompatecZoneSelectionsOnDisarm(SYSTEM_ID, disarmE701);
    expect(await orm.select().from(compatecZoneArmSelections)).toHaveLength(0);
  });

  it("também libera a seleção com Desarme real por usuário E401 da mesma central", async () => {
    const selected = await selectZone(3);
    const reservation = await createExclusiveCompatecPhysicalCommand(armCommandData(), [selected.id]);
    expect(reservation.created).toBe(true);
    if (!reservation.created) throw new Error("O Arme Compatec deveria ser reservado");

    const genericDisarm = await insertEvent({ eventCode: "401", qualifier: "E" });
    await resetCompatecZoneSelectionsOnDisarm(SYSTEM_ID, genericDisarm);

    expect(await orm.select().from(compatecZoneArmSelections)).toHaveLength(0);
  });

  it("cancela dispatching quando um Desarme real chega no intervalo anterior à escrita", async () => {
    const selected = await selectZone(3);
    const reservation = await createExclusiveCompatecPhysicalCommand(armCommandData(), [selected.id]);
    if (!reservation.created) throw new Error("Reserva esperada");
    await orm.update(alarmRemoteCommands).set({ status: "dispatching" }).where(eq(alarmRemoteCommands.id, reservation.id));
    const eventId = await insertEvent({ eventCode: "701", qualifier: "E" });
    await resetCompatecZoneSelectionsOnDisarm(SYSTEM_ID, eventId);
    const send = vi.fn(() => ({ sent: true }));
    const result = await dispatchAlarmRemoteCommand({ alarmSystemId: SYSTEM_ID, commandId: reservation.id,
      requiredZoneNumbers: [3], expectedStatuses: ["dispatching"], unavailableStatus: "failed", sentResponsePayload: "Não alcançado", send });
    expect(result.status).toBe("cancelled"); expect(send).not.toHaveBeenCalled();
    expect(await orm.select().from(compatecZoneArmSelections)).toHaveLength(0);
  });

  it("reconsulta o estado sob lock na segunda transação, mesmo antes do callback de reset", async () => {
    const selected = await selectZone(3);
    const reservation = await createExclusiveCompatecPhysicalCommand(armCommandData(), [selected.id]);
    if (!reservation.created) throw new Error("Reserva esperada");
    let transactions = 0;
    // Injeta o evento persistido depois da reserva e antes da segunda transação de escrita.
    setDbForTesting({ transaction: async (callback: any) => {
      if (++transactions === 2) await insertEvent({ eventCode: "701", qualifier: "E" });
      return orm.transaction(callback);
    } } as any);
    const send = vi.fn(() => ({ sent: true }));
    try {
      const result = await dispatchAlarmRemoteCommand({ alarmSystemId: SYSTEM_ID, commandId: reservation.id,
        requiredZoneNumbers: [3], expectedStatuses: ["waiting_connection"], unavailableStatus: "failed", sentResponsePayload: "Não alcançado", send });
      expect(result.status).toBe("cancelled"); expect(send).not.toHaveBeenCalled();
      expect(await orm.select().from(compatecZoneArmSelections)).toHaveLength(0);
    } finally { setDbForTesting(orm); }
  });
});
