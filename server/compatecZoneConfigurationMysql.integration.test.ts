import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";
import fs from "node:fs";
import { authSessions, alarmEvents, alarmRemoteCommands, alarmScheduleOverrides, alarmSchedules, alarmSystems, alarmZones, clients, incidentHistory, incidentPanelLeases, incidents, occurrences, partnerCompanies, partnerHolidays, users } from "../drizzle/schema";
import { appendIncidentNote, createAlarmEventWithOpenIncident, createExclusiveCompatecPhysicalCommand, createExclusiveCompatecZoneConfiguration, createOccurrenceAndCloseIncident, createStandaloneCompatecZoneConfiguration, dispatchAlarmRemoteCommand, expireStaleRemoteCommandDispatches, getAlarmScheduleContext, getPendingCompatecCommand, listIndeterminateCompatecCommands, openIncidentPanel, pauseIncidentPanel, reconcileCompatecCommand, recordRemoteCommandConfirmation, setDbForTesting, updateAlarmRemoteCommandDelivery, updateAlarmSchedule, upsertAlarmSchedule } from "./db";
import { evaluateAlarmSchedule } from "./alarmSchedulePolicy";
import { buildCompatecZoneConfigurationFrames } from "../shared/compatecZoneConfiguration";
import { areCompatecArmScheduleBasesAllowed, getCompatecArmAuditReason } from "../shared/compatecArmAuthorization";
import type { PanelActor } from "./incidentPanelLease";

// Opt-in somente para o MariaDB local descartável via socket Unix; nunca usa DATABASE_URL ou rede.
const socket = process.env.POLICE_SHIFT_TEST_SOCKET;
const localEnabled = Boolean(socket?.startsWith("/tmp/police-shift-db/") && fs.existsSync(socket));
const database = `police_sector_config_${process.pid}`;
const SYSTEM_ID = 78;
const CLIENT_ID = 88;
const INCIDENT_ID = 901;
const OPERATOR_ID = 701;
const SESSION_ID = 9701;
const LEASE_TOKEN = "11111111-1111-4111-8111-111111111111";
const TABLES = ["users", "auth_sessions", "partner_companies", "clients", "alarm_systems", "alarm_zones", "alarm_remote_commands", "occurrences", "incidents", "incident_history", "incident_panel_leases", "alarm_events", "alarm_schedules", "alarm_schedule_overrides", "partner_holidays"];
let pool!: mysql.Pool;
let orm!: ReturnType<typeof drizzle>;

function snapshotDDL() {
  const snapshot = JSON.parse(fs.readFileSync(new URL("../drizzle/meta/0059_snapshot.json", import.meta.url), "utf8"));
  return TABLES.map((name) => {
    const table = snapshot.tables[name];
    if (!table) throw new Error(`Tabela ${name} ausente no snapshot de schema`);
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

const actor: PanelActor = {
  operatorId: OPERATOR_ID,
  operatorName: "Operadora Compatec de teste",
  authSessionId: SESSION_ID,
  leaseToken: LEASE_TOKEN,
};
const expectedPhysicalIdentity = { macAddress: "C1BDCB", imeiGprs: null, receiverPort: 9271 };
const zoneChanges = [
  { zoneNumber: 1, armState: "armed" as const },
  { zoneNumber: 2, armState: "armed" as const },
  { zoneNumber: 3, bypassState: "annulled" as const },
  { zoneNumber: 4, bypassState: "annulled" as const },
];
const input = () => ({
  alarmSystemId: SYSTEM_ID,
  incidentId: INCIDENT_ID,
  reason: "Solicitação fictícia para teste de integração local",
  zoneChanges,
  actor,
});

async function fixture() {
  const now = new Date();
  await orm.insert(users).values({ id: OPERATOR_ID, openId: "compatec-sector-test", name: actor.operatorName, role: "operator" });
  await orm.insert(authSessions).values({
    id: SESSION_ID,
    userId: OPERATOR_ID,
    tokenHash: "a".repeat(64),
    createdAt: new Date(now.getTime() - 1000),
    expiresAt: new Date(now.getTime() + 3600_000),
    lastSeenAt: now,
  });
  await orm.insert(partnerCompanies).values({ id: 1, managingCompanyId: 1, name: "Parceira fictícia Compatec" });
  await orm.insert(clients).values({
    id: CLIENT_ID,
    partnerCompanyId: 1,
    type: "pj",
    propertyType: "company",
    name: "Cliente fictício Compatec",
    fantasyName: "Cliente Compatec teste",
    isActive: true,
  });
  await orm.insert(alarmSystems).values({
    id: SYSTEM_ID,
    clientId: CLIENT_ID,
    account: "0342",
    brand: "COMPATEC",
    model: "AW320 PRO",
    macAddress: "C1BDCB",
    receiverPort: 9271,
    isActive: true,
  });
  await orm.insert(alarmZones).values([1, 2, 3, 4].map((zoneNumber) => ({
    alarmSystemId: SYSTEM_ID,
    zoneNumber,
    name: `Setor fictício ${zoneNumber}`,
    isActive: true,
  })));
  await orm.insert(incidents).values({
    id: INCIDENT_ID,
    eventId: 5001,
    alarmSystemId: SYSTEM_ID,
    clientId: CLIENT_ID,
    operatorId: OPERATOR_ID,
    status: "attending",
    version: 1,
    notes: "Nota inicial da ocorrência preservada",
  });
  await orm.insert(incidentPanelLeases).values({
    incidentId: INCIDENT_ID,
    operatorId: OPERATOR_ID,
    authSessionId: SESSION_ID,
    leaseToken: LEASE_TOKEN,
    expiresAt: new Date(now.getTime() + 60_000),
  });
  await orm.insert(alarmEvents).values({
    alarmSystemId: SYSTEM_ID,
    account: "0342",
    brand: "COMPATEC",
    qualifier: "E",
    eventCode: "701",
    description: "Evento Contact ID fictício preexistente",
    receiverPort: 9271,
    rawData: "Conta recebida: 0342\nIdentificado por mac_ascii: C1BDCB",
    receivedAt: now,
  });
}

async function commandRows() { return orm.select().from(alarmRemoteCommands); }
async function reportRows() { return orm.select().from(occurrences); }
async function disarmedStateEventId() {
  const [event] = await orm.select({ id: alarmEvents.id }).from(alarmEvents).where(and(
    eq(alarmEvents.alarmSystemId, SYSTEM_ID), eq(alarmEvents.qualifier, "E"), eq(alarmEvents.eventCode, "701"),
  )).limit(1);
  if (!event) throw new Error("Fixture Compatec não tem evento E701 para validar o estado desarmado");
  return event.id;
}

function directEvidence(commandType: string, outcome: string, referenceId = 12345) {
  const states: Record<string, Record<string, string>> = {
    arm: { not_applied: "disarmed", applied: "armed", verified: "armed" },
    disarm: { not_applied: "armed", applied: "disarmed", verified: "disarmed" },
    isolate_zone: { not_applied: "zone_normal", applied: "zone_isolated", verified: "zone_isolated" },
    restore_zone: { not_applied: "zone_isolated", applied: "zone_normal", verified: "zone_normal" },
    configure_zones: { not_applied: "all_targets_unchanged", applied: "all_targets_applied", partial: "some_targets_changed", verified: "all_targets_applied" },
    query_status: { verified: "query_verified", unavailable: "unavailable" },
    query_sectors: { verified: "query_verified", unavailable: "unavailable" },
  };
  return {
    verificationSource: "official_app_command_history" as const,
    observedState: states[commandType]?.[outcome] || "unavailable",
    evidenceReference: `Registro #APP-${referenceId}`,
  };
}

async function removeOpenFixtureIncident() {
  await orm.delete(incidentPanelLeases).where(eq(incidentPanelLeases.incidentId, INCIDENT_ID));
  await orm.delete(incidents).where(eq(incidents.id, INCIDENT_ID));
}

// Só habilitado pelo script de validação privada, que cria e remove um MariaDB em /tmp.
describe.skipIf(!localEnabled)("Compatec configuração multi-setorial · integração MariaDB privado", () => {
  beforeAll(async () => {
    const admin = await mysql.createConnection({ socketPath: socket!, user: "root", multipleStatements: true });
    try { await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`); }
    finally { await admin.end(); }
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
      try { await pool.query(`DROP DATABASE \`${database}\``); }
      finally { await pool.end(); }
    }
  });

  it("reserva os exemplos oficiais em duas máscaras, grava relatório e não cria Contact ID nem outra ocorrência/fila", async () => {
    const existingEvents = await orm.select().from(alarmEvents);
    const existingIncidents = await orm.select().from(incidents);
    const reservation = await createExclusiveCompatecZoneConfiguration(input());
    expect(reservation.created).toBe(true);
    if (!reservation.created) return;

    const frames = buildCompatecZoneConfigurationFrames(zoneChanges);
    expect(frames).toHaveLength(2);
    const mask = ["0080", "0080", "0008", "0008", ...Array(19).fill("0000")].join(",");
    expect(frames).toEqual([`MB=AK2[${mask}]\r\n`, `MB=AK1[${mask}]\r\n`]);
    expect(reservation.commandPayload).toContain("physical_zone_configuration");
    expect(JSON.parse(reservation.commandPayload).frames).toEqual(frames);
    expect(JSON.parse(reservation.commandPayload).frames.join("\n")).not.toContain("AK4");
    expect(JSON.parse(reservation.commandPayload)).not.toHaveProperty("requestedBy");

    const commands = await commandRows();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ commandType: "configure_zones", status: "prepared", incidentId: INCIDENT_ID, operatorId: OPERATOR_ID, alarmSystemId: SYSTEM_ID });
    expect(commands[0].panelConfirmedAt).toBeNull();
    expect(await orm.select().from(alarmEvents)).toEqual(existingEvents);
    const incidentsAfterReservation = await orm.select().from(incidents);
    expect(incidentsAfterReservation.map((incident) => incident.id)).toEqual(existingIncidents.map((incident) => incident.id));
    const [incident] = await orm.select().from(incidents).where(eq(incidents.id, INCIDENT_ID));
    expect(incident.notes).toContain("Nota inicial da ocorrência preservada");
    expect(incident.notes).toContain(`Operador: ${actor.operatorName}`);
    expect(incident.notes).not.toContain("Solicitado por:");
    expect(incident.notes).toContain("Setor 1: armado");
    expect(incident.notes).toContain("Setor 3: anulado");
    const [report] = await reportRows();
    expect(report.description).toContain("Alteração de setores 1, 2, 3, 4");
    expect(report.observations).toContain("Motivo: Solicitação fictícia");
    expect(report.observations).toContain("Aguardando retorno");
    expect(report.observations).not.toMatch(/COMANDO REMOTO|PoliceCentral|Operador:|Solicitado por|KA1|AK2|Auditoria do comando|Quadros enviados/);
    expect(report.observations).not.toContain("[COMANDO REMOTO");
    expect(report.logs).toContain(`[COMANDO REMOTO #${commands[0].id}]`);
    expect(commands[0].responsePayload).toContain("KA1");
    expect(await orm.select().from(occurrences)).toHaveLength(1);
  });

  it("recusa configuração standalone enquanto a central possui ocorrência e lease de atendimento abertos", async () => {
    await expect(createStandaloneCompatecZoneConfiguration({
      alarmSystemId: SYSTEM_ID,
      operatorId: OPERATOR_ID,
      authSessionId: SESSION_ID,
      reason: "Solicitação standalone enquanto existe atendimento",
      zoneChanges: [{ zoneNumber: 1, armState: "armed" }],
    })).rejects.toThrow("Esta central possui uma ocorrência aberta");
    expect(await commandRows()).toHaveLength(0);
    expect(await reportRows()).toHaveLength(0);
  });

  it("envia a configuração standalone com uma sessão autenticada e grava o relatório sem criar ocorrência ou Contact ID", async () => {
    await removeOpenFixtureIncident();
    const eventsBefore = await orm.select().from(alarmEvents);
    const incidentsBefore = await orm.select().from(incidents);
    const reservation = await createStandaloneCompatecZoneConfiguration({
      alarmSystemId: SYSTEM_ID,
      operatorId: OPERATOR_ID,
      authSessionId: SESSION_ID,
      reason: "Cliente pediu setores",
      zoneChanges: [
        { zoneNumber: 1, armState: "armed" },
        { zoneNumber: 2, armState: "disarmed", bypassState: "annulled" },
      ],
    });
    expect(reservation.created).toBe(true);
    if (!reservation.created) return;
    expect(reservation.physicalIdentity).toMatchObject({ brand: "COMPATEC", ...expectedPhysicalIdentity });

    const send = vi.fn(() => ({ sent: true, payload: "fake local socket write" }));
    const dispatched = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID,
      commandId: reservation.id,
      requiredOperatorSession: { operatorId: OPERATOR_ID, authSessionId: SESSION_ID },
      requiredPhysicalIdentity: reservation.physicalIdentity,
      requiredZoneNumbers: reservation.zoneChanges.map((change) => change.zoneNumber),
      expectedStatuses: ["prepared"],
      unavailableStatus: "failed",
      sentResponsePayload: "Fake local dispatch accepted; panel response pending.",
      send,
    });
    expect(dispatched).toMatchObject({ sent: true, status: "sent" });
    expect(send).toHaveBeenCalledOnce();

    const [command] = await commandRows();
    expect(command).toMatchObject({
      id: reservation.id,
      incidentId: null,
      operatorId: OPERATOR_ID,
      commandType: "configure_zones",
      status: "sent",
    });
    expect(command.commandPayload).toContain("physical_zone_configuration");
    const reports = await reportRows();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ eventCode: "REMOTE", description: expect.stringContaining("Alteração de setores 1, 2") });
    expect(reports[0].observations).toContain("Motivo: Cliente pediu setores");
    expect(reports[0].logs).toContain(`[COMANDO REMOTO #${reservation.id}]`);
    expect(reports[0].observations).not.toMatch(/COMANDO REMOTO|AK2|AK1|KA1|frame|payload|fake local/i);
    expect(await orm.select().from(alarmEvents)).toEqual(eventsBefore);
    expect((await orm.select().from(incidents)).map((incident) => incident.id)).toEqual(incidentsBefore.map((incident) => incident.id));
  });

  it("cancela o despacho standalone antes do socket se a sessão operacional for revogada", async () => {
    await removeOpenFixtureIncident();
    const reservation = await createStandaloneCompatecZoneConfiguration({
      alarmSystemId: SYSTEM_ID,
      operatorId: OPERATOR_ID,
      authSessionId: SESSION_ID,
      reason: "Solicitação standalone para teste de sessão",
      zoneChanges: [{ zoneNumber: 1, armState: "armed" }],
    });
    if (!reservation.created) throw new Error("Reserva standalone não criada");
    await orm.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.id, SESSION_ID));
    const send = vi.fn(() => ({ sent: true, payload: "fake local socket write" }));

    const dispatched = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID,
      commandId: reservation.id,
      requiredOperatorSession: { operatorId: OPERATOR_ID, authSessionId: SESSION_ID },
      requiredPhysicalIdentity: reservation.physicalIdentity,
      requiredZoneNumbers: reservation.zoneChanges.map((change) => change.zoneNumber),
      expectedStatuses: ["prepared"],
      unavailableStatus: "failed",
      sentResponsePayload: "Fake local dispatch accepted.",
      send,
    });

    expect(dispatched).toMatchObject({ sent: false, status: "cancelled" });
    expect(send).not.toHaveBeenCalled();
    const [command] = await commandRows();
    expect(command.status).toBe("cancelled");
    expect(command.responsePayload).toContain("sessão operacional inválida");
    expect((await reportRows())[0].observations).not.toContain("fake local socket");
  });

  it("cancela antes do socket se uma ocorrência surgir depois da reserva standalone", async () => {
    await removeOpenFixtureIncident();
    const reservation = await createStandaloneCompatecZoneConfiguration({
      alarmSystemId: SYSTEM_ID,
      operatorId: OPERATOR_ID,
      authSessionId: SESSION_ID,
      reason: "Configuração solicitada antes do novo atendimento",
      zoneChanges: [{ zoneNumber: 1, armState: "armed" }],
    });
    if (!reservation.created) throw new Error("Reserva standalone não criada");
    await createAlarmEventWithOpenIncident({
      event: {
        alarmSystemId: SYSTEM_ID,
        account: "0342",
        brand: "COMPATEC",
        qualifier: "E",
        eventCode: "E130",
        description: "Novo evento durante a configuração standalone",
        priority: "high",
        receiverPort: 9271,
        remoteIp: "127.0.0.1",
        rawData: "LOCAL_TEST_EVENT",
        receivedAt: new Date(),
      },
      incident: { alarmSystemId: SYSTEM_ID, clientId: CLIENT_ID, status: "waiting", priority: "high", notes: "Novo atendimento local de teste" },
    });
    const send = vi.fn(() => ({ sent: true, payload: "fake local socket write" }));

    const dispatched = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID,
      commandId: reservation.id,
      requiredOperatorSession: { operatorId: OPERATOR_ID, authSessionId: SESSION_ID },
      requiredPhysicalIdentity: reservation.physicalIdentity,
      requiredZoneNumbers: reservation.zoneChanges.map((change) => change.zoneNumber),
      expectedStatuses: ["prepared"],
      unavailableStatus: "failed",
      sentResponsePayload: "Fake local dispatch accepted.",
      send,
    });
    expect(dispatched).toMatchObject({ sent: false, status: "cancelled" });
    expect(dispatched.message).toContain("central agora possui ocorrência aberta");
    expect(send).not.toHaveBeenCalled();
    expect((await commandRows())[0].status).toBe("cancelled");
  });

  it("finaliza com notas persistidas atuais mesmo quando a tela envia observações em cache antigo", async () => {
    const reservation = await createExclusiveCompatecZoneConfiguration(input());
    if (!reservation.created) throw new Error("Reserva de configuração não criada");
    const staleClientObservations = "Conferi o estado e finalizei o atendimento.";

    await createOccurrenceAndCloseIncident(INCIDENT_ID, {
      account: "0342",
      eventCode: "701",
      observations: staleClientObservations,
    } as any, OPERATOR_ID, actor.operatorName, SESSION_ID, LEASE_TOKEN);

    const report = (await reportRows()).find((item) => item.incidentId === INCIDENT_ID && item.eventCode === "701");
    expect(report).toBeTruthy();
    if (!report) return;
    expect(report.observations).toContain(staleClientObservations);
    expect(report.observations).toContain("Nota inicial da ocorrência preservada");
    expect(report.observations).toContain("Motivo: Solicitação fictícia");
    expect(report.observations).not.toContain("Solicitado por:");
    expect(report.observations).not.toMatch(/COMANDO REMOTO|PoliceCentral|Operador:|KA1|AK2|Auditoria do comando|Quadros enviados/);
    const [storedIncident] = await orm.select().from(incidents);
    expect(storedIncident.notes).toContain(`[COMANDO REMOTO #${reservation.id} SOLICITADO]`);
    expect(storedIncident.notes).toContain(`Operador: ${actor.operatorName}`);
    expect(storedIncident.notes).toContain("resposta indica recebimento, não confirmação dos estados finais");
    const [closedIncident] = await orm.select().from(incidents);
    expect(closedIncident).toMatchObject({ status: "closed", resolution: report.observations });
    const finalizedHistory = (await orm.select().from(incidentHistory)).find((row) => row.action === "finalized");
    expect(finalizedHistory?.note).toBe(report.observations);
  });

  it("não duplica o motivo de pausa pré-preenchido ao retomar e mantém o texto igual em relatório, resolução e histórico", async () => {
    const pauseReason = "Aguardar retorno do responsável";
    await orm.update(incidents).set({ status: "observing" }).where(eq(incidents.id, INCIDENT_ID));
    await pauseIncidentPanel(INCIDENT_ID, pauseReason, actor);
    const resumedActor = { ...actor, leaseToken: "22222222-2222-4222-8222-222222222222" };
    const resumed = await openIncidentPanel({ incidentId: INCIDENT_ID }, resumedActor);
    expect(resumed.pauseReason).toBe(pauseReason);
    await createOccurrenceAndCloseIncident(INCIDENT_ID, {
      account: "0342",
      eventCode: "130",
      observations: pauseReason,
    } as any, OPERATOR_ID, actor.operatorName, SESSION_ID, resumed.leaseToken);

    const report = (await reportRows()).find((item) => item.incidentId === INCIDENT_ID && item.eventCode === "130");
    expect(report).toBeTruthy();
    if (!report) return;
    expect(report.observations?.split(pauseReason)).toHaveLength(2);
    const [closedIncident] = await orm.select().from(incidents);
    expect(closedIncident.resolution).toBe(report.observations);
    const finalizedHistory = (await orm.select().from(incidentHistory)).find((row) => row.action === "finalized");
    expect(finalizedHistory?.note).toBe(report.observations);
  });

  it("impede que uma consulta AK0 seja reservada enquanto a configuração de setores está preparada", async () => {
    const configuration = await createExclusiveCompatecZoneConfiguration(input());
    if (!configuration.created) throw new Error("Reserva de configuração não criada");
    const query = await createExclusiveCompatecPhysicalCommand({
      alarmSystemId: SYSTEM_ID,
      incidentId: INCIDENT_ID,
      operatorId: OPERATOR_ID,
      brand: "COMPATEC",
      commandType: "query_status",
      transportMode: "microbus_compatec",
      status: "queued",
      partition: null,
      zoneNumber: null,
      pgmNumber: null,
      reason: "Consulta de estado fictícia",
      commandPayload: "MB=AK0\\r\\n",
    });

    expect(query).toMatchObject({ created: false, activeCommandId: configuration.id, activeStatus: "prepared" });
    expect(await commandRows()).toHaveLength(1);
  });

  it("registra KA1 como recebido, sem panelConfirmedAt nem declaração de estado final", async () => {
    const reservation = await createExclusiveCompatecZoneConfiguration(input());
    if (!reservation.created) throw new Error("Reserva de teste não criada");
    let sendCalls = 0;
    const dispatch = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID,
      commandId: reservation.id,
      requiredPanelActor: actor,
      requiredPhysicalIdentity: expectedPhysicalIdentity,
      requiredZoneNumbers: zoneChanges.map((change) => change.zoneNumber),
      expectedStatuses: ["prepared"],
      unavailableStatus: "failed",
      sentResponsePayload: "AK2→AK1 escrito pelo teste; aguardando KA1.",
      send: () => { sendCalls += 1; return { sent: true, payload: "AK2→AK1" }; },
    });
    expect(dispatch).toMatchObject({ sent: true, status: "sent" });
    expect(sendCalls).toBe(1);

    const confirmed = await recordRemoteCommandConfirmation({ commandId: reservation.id, responsePayload: "MB=KA1" });
    expect(confirmed.recorded).toBe(true);
    const [stored] = await commandRows();
    expect(stored.status).toBe("responded");
    expect(stored.panelConfirmedAt).toBeNull();
    expect(stored.responsePayload).toContain("MB=KA1");
    const [report] = await reportRows();
    expect(report.description).toContain("Alteração de setores");
    expect(report.observations).toContain("Resposta recebida; conferir estado final");
    expect(`${report.description}\n${report.observations}`).not.toMatch(/KA1|AK2|Auditoria do comando/);
    expect(await orm.select().from(alarmEvents)).toHaveLength(1);
    expect(await orm.select().from(incidents)).toHaveLength(1);
    expect(await reportRows()).toHaveLength(1);
  });

  it("não enfileira para envio tardio quando a sessão física não existe e não reenvia após falha", async () => {
    const reservation = await createExclusiveCompatecZoneConfiguration(input());
    if (!reservation.created) throw new Error("Reserva de teste não criada");
    let sendCalls = 0;
    const dispatch = () => dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID,
      commandId: reservation.id,
      requiredPanelActor: actor,
      requiredPhysicalIdentity: expectedPhysicalIdentity,
      requiredZoneNumbers: zoneChanges.map((change) => change.zoneNumber),
      expectedStatuses: ["prepared"],
      unavailableStatus: "failed",
      sentResponsePayload: "Não esperado no teste sem sessão.",
      send: () => { sendCalls += 1; return { sent: false, message: "Nenhuma sessão TCP física ativa identificada." }; },
    });
    const first = await dispatch();
    const second = await dispatch();
    expect(first).toMatchObject({ sent: false, status: "failed" });
    expect(second).toMatchObject({ sent: false, status: "failed" });
    expect(sendCalls).toBe(1);
    const [stored] = await commandRows();
    expect(stored.responsePayload).toContain("Nenhuma sessão TCP física ativa identificada");
    expect(stored.executedAt).toBeNull();
  });

  it("marca exceção durante a escrita como indeterminada e nunca reenvia", async () => {
    const reservation = await createExclusiveCompatecZoneConfiguration(input());
    if (!reservation.created) throw new Error("Reserva de teste não criada");
    let sendCalls = 0;
    const dispatch = () => dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID,
      commandId: reservation.id,
      requiredPanelActor: actor,
      requiredPhysicalIdentity: expectedPhysicalIdentity,
      requiredZoneNumbers: zoneChanges.map((change) => change.zoneNumber),
      expectedStatuses: ["prepared"],
      unavailableStatus: "failed",
      sentResponsePayload: "Não esperado: o socket lançou exceção.",
      send: () => { sendCalls += 1; throw new Error("interrupção simulada do socket"); },
    });

    expect(await dispatch()).toMatchObject({ sent: false, status: "dispatch_unknown" });
    expect(await dispatch()).toMatchObject({ sent: false, status: "dispatch_unknown" });
    expect(sendCalls).toBe(1);
    const [stored] = await commandRows();
    expect(stored.responsePayload).toContain("Não reenviar automaticamente");
  });

  it("anexa nota apenas à ocorrência da central correspondente, sem gerar Contact ID ou outra ocorrência", async () => {
    const previousEvents = await orm.select().from(alarmEvents);
    const previousOccurrences = await orm.select().from(occurrences);
    await appendIncidentNote(INCIDENT_ID, SYSTEM_ID, "Nota da central correta");
    await appendIncidentNote(INCIDENT_ID, SYSTEM_ID + 1, "Nota de outra central que deve ser ignorada");

    const [incident] = await orm.select().from(incidents).where(eq(incidents.id, INCIDENT_ID));
    expect(incident.notes).toBe("Nota inicial da ocorrência preservada\nNota da central correta");
    expect(await orm.select().from(incidents)).toHaveLength(1);
    expect(await orm.select().from(alarmEvents)).toEqual(previousEvents);
    expect(await orm.select().from(occurrences)).toEqual(previousOccurrences);
  });

  it("barra a escrita se algum setor for desativado depois da reserva", async () => {
    const reservation = await createExclusiveCompatecZoneConfiguration(input());
    if (!reservation.created) throw new Error("Reserva de teste não criada");
    await orm.update(alarmZones).set({ isActive: false }).where(and(
      eq(alarmZones.alarmSystemId, SYSTEM_ID),
      eq(alarmZones.zoneNumber, zoneChanges[0].zoneNumber),
    ));
    let sendCalls = 0;
    const dispatch = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID,
      commandId: reservation.id,
      requiredPanelActor: actor,
      requiredPhysicalIdentity: expectedPhysicalIdentity,
      requiredZoneNumbers: zoneChanges.map((change) => change.zoneNumber),
      expectedStatuses: ["prepared"],
      unavailableStatus: "failed",
      sentResponsePayload: "Não esperado: a zona foi desativada após a reserva.",
      send: () => { sendCalls += 1; return { sent: true, payload: "AK2→AK1" }; },
    });
    expect(dispatch).toMatchObject({ sent: false, status: "failed" });
    expect(dispatch.message).toContain("Nenhum quadro foi transmitido");
    expect(sendCalls).toBe(0);
    const [stored] = await commandRows();
    expect(stored.responsePayload).toContain("Configuração de setores cancelada");
    expect(stored.executedAt).toBeNull();
  });

  it("cancela sem escrever se MAC/IMEI/porta mudarem após a reserva", async () => {
    const reservation = await createExclusiveCompatecZoneConfiguration(input());
    if (!reservation.created) throw new Error("Reserva de teste não criada");
    await orm.update(alarmSystems).set({ macAddress: "AABBCC" }).where(eq(alarmSystems.id, SYSTEM_ID));
    let sendCalls = 0;

    const dispatch = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID,
      commandId: reservation.id,
      requiredPanelActor: actor,
      requiredPhysicalIdentity: expectedPhysicalIdentity,
      requiredZoneNumbers: zoneChanges.map((change) => change.zoneNumber),
      expectedStatuses: ["prepared"],
      unavailableStatus: "failed",
      sentResponsePayload: "Não esperado: identidade física mudou.",
      send: () => { sendCalls += 1; return { sent: true, payload: "AK2→AK1" }; },
    });
    expect(dispatch).toMatchObject({ sent: false, status: "cancelled" });
    expect(dispatch.message).toContain("MAC, IMEI, marca ou porta do cadastro mudou");
    expect(sendCalls).toBe(0);
    const [stored] = await commandRows();
    expect(stored.responsePayload).toContain("Nenhum quadro foi transmitido");
  });

  it("cancela reserva interrompida antes da primeira escrita e nunca reenvia na reconexão", async () => {
    const reservation = await createExclusiveCompatecZoneConfiguration(input());
    if (!reservation.created) throw new Error("Reserva de teste não criada");
    let sendCalls = 0;

    expect(await expireStaleRemoteCommandDispatches(new Date(Date.now() + 3 * 60_000))).toBe(1);
    const [stored] = await commandRows();
    expect(stored.status).toBe("cancelled");
    expect(stored.responsePayload).toContain("nenhum quadro foi escrito");
    expect(await getPendingCompatecCommand(SYSTEM_ID)).toBeUndefined();

    const retry = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID,
      commandId: reservation.id,
      requiredPanelActor: actor,
      requiredPhysicalIdentity: expectedPhysicalIdentity,
      requiredZoneNumbers: zoneChanges.map((change) => change.zoneNumber),
      expectedStatuses: ["prepared"],
      unavailableStatus: "failed",
      sentResponsePayload: "Não deve ser enviado após interrupção.",
      send: () => { sendCalls += 1; return { sent: true, payload: "AK2→AK1" }; },
    });
    expect(retry).toMatchObject({ sent: false, status: "cancelled" });
    expect(sendCalls).toBe(0);
  });

  it("expira configuração enviada sem KA1 como indeterminada e nunca a retransmite", async () => {
    const reservation = await createExclusiveCompatecZoneConfiguration(input());
    if (!reservation.created) throw new Error("Reserva de teste não criada");
    let sendCalls = 0;

    const sent = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID,
      commandId: reservation.id,
      requiredPanelActor: actor,
      requiredPhysicalIdentity: expectedPhysicalIdentity,
      requiredZoneNumbers: zoneChanges.map((change) => change.zoneNumber),
      expectedStatuses: ["prepared"],
      unavailableStatus: "failed",
      sentResponsePayload: "AK2→AK1 enviado; aguardando KA1.",
      send: () => { sendCalls += 1; return { sent: true, payload: reservation.commandPayload }; },
    });
    expect(sent).toMatchObject({ sent: true, status: "sent" });
    expect(sendCalls).toBe(1);

    await orm.update(alarmRemoteCommands).set({ updatedAt: new Date(Date.now() - 60_000) }).where(eq(alarmRemoteCommands.id, reservation.id));
    expect(await expireStaleRemoteCommandDispatches()).toBe(1);
    const [expired] = await commandRows();
    expect(expired.status).toBe("dispatch_unknown");
    expect(expired.responsePayload).toContain("KA1 não recebido no prazo");
    expect(await getPendingCompatecCommand(SYSTEM_ID)).toBeUndefined();

    const retry = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID,
      commandId: reservation.id,
      requiredPanelActor: actor,
      requiredPhysicalIdentity: expectedPhysicalIdentity,
      requiredZoneNumbers: zoneChanges.map((change) => change.zoneNumber),
      expectedStatuses: ["prepared"],
      unavailableStatus: "failed",
      sentResponsePayload: "Não deve haver retransmissão.",
      send: () => { sendCalls += 1; return { sent: true, payload: reservation.commandPayload }; },
    });
    expect(retry).toMatchObject({ sent: false, status: "dispatch_unknown" });
    expect(sendCalls).toBe(1);
  });

  it("não bloqueia nova tentativa após resultado indeterminado e registra a conferência sem reenviar quadros", async () => {
    const reservation = await createExclusiveCompatecZoneConfiguration(input());
    if (!reservation.created) throw new Error("Reserva de teste não criada");
    let sendCalls = 0;
    const sent = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID,
      commandId: reservation.id,
      requiredPanelActor: actor,
      requiredPhysicalIdentity: expectedPhysicalIdentity,
      requiredZoneNumbers: zoneChanges.map((change) => change.zoneNumber),
      expectedStatuses: ["prepared"],
      unavailableStatus: "failed",
      sentResponsePayload: "AK2→AK1 enviado; aguardando KA1.",
      send: () => { sendCalls += 1; return { sent: true, payload: reservation.commandPayload }; },
    });
    expect(sent).toMatchObject({ sent: true, status: "sent" });
    await orm.update(alarmRemoteCommands).set({ updatedAt: new Date(Date.now() - 60_000) }).where(eq(alarmRemoteCommands.id, reservation.id));
    expect(await expireStaleRemoteCommandDispatches()).toBe(1);
    expect(await listIndeterminateCompatecCommands(SYSTEM_ID)).toMatchObject([{ id: reservation.id, commandType: "configure_zones", status: "dispatch_unknown" }]);

    // Resultado indeterminado não bloqueia: a nova tentativa é aceita na hora.
    const retry = await createExclusiveCompatecZoneConfiguration(input());
    expect(retry).toMatchObject({ created: true });
    if (!retry.created) throw new Error("Nova tentativa deveria ter sido aceita");
    await orm.update(alarmRemoteCommands).set({ status: "cancelled", responsePayload: "Reserva criada apenas para provar a liberação." }).where(eq(alarmRemoteCommands.id, retry.id));

    // Resposta tardia não sobrescreve o comando antigo nem cria bloqueio.
    expect(await recordRemoteCommandConfirmation({ commandId: reservation.id, responsePayload: "MB=KA1", confirmedAt: new Date() })).toMatchObject({ recorded: true, commandType: "configure_zones" });
    const [afterLateAck] = await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, reservation.id));
    expect(afterLateAck.status).toBe("dispatch_unknown");
    expect(afterLateAck.responsePayload).toContain("Nenhum bloqueio permanece");
    expect(afterLateAck.panelConfirmedAt).toBeNull();

    const reconciled = await reconcileCompatecCommand({
      commandId: reservation.id,
      operatorId: OPERATOR_ID,
      operatorName: actor.operatorName,
      authSessionId: SESSION_ID,
      outcome: "applied",
      verificationMethod: "Aplicativo Compatec conferido",
      details: "Setores 1 a 4 conferidos pelo responsável",
      ...directEvidence("configure_zones", "applied"),
    });
    expect(reconciled).toMatchObject({ reconciled: true, commandId: reservation.id, incidentId: INCIDENT_ID, status: "dispatch_unknown" });
    const [stored] = await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, reservation.id));
    expect(stored.status).toBe("dispatch_unknown");
    expect(stored.panelConfirmedAt).toBeNull();
    expect(stored.responsePayload).toContain("Conferência manual");
    expect(stored.responsePayload).toContain("Aplicativo Compatec conferido");
    expect(stored.responsePayload).toContain("Nenhum bloqueio permanece");
    const [history] = await orm.select().from(incidentHistory);
    expect(history).toMatchObject({ incidentId: INCIDENT_ID, operatorId: OPERATOR_ID, action: "remote_command_reconciled" });
    expect(history.note).toContain("não é confirmação eletrônica");
    expect(await orm.select().from(alarmEvents)).toHaveLength(1);

    // A conferência final é opcional e apenas encerra a auditoria; nunca bloqueia.
    const finalCheck = await reconcileCompatecCommand({
      commandId: reservation.id, operatorId: OPERATOR_ID, operatorName: actor.operatorName, authSessionId: SESSION_ID,
      outcome: "verified", verificationMethod: "Aplicativo Compatec consultado novamente",
      details: "Todos os setores conferidos no estado solicitado", ...directEvidence("configure_zones", "verified", 12346),
    });
    expect(finalCheck).toMatchObject({ reconciled: true, status: "reconciled" });
    expect(await listIndeterminateCompatecCommands(SYSTEM_ID)).toHaveLength(0);
    const [verified] = await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, reservation.id));
    expect(verified.status).toBe("reconciled");
    expect(verified.responsePayload).toContain("[CONFERÊNCIA MANUAL: ESTADO FINAL VERIFICADO]");

    const nextRequest = await createExclusiveCompatecZoneConfiguration(input());
    expect(nextRequest).toMatchObject({ created: true });
    expect(sendCalls).toBe(1);
  });

  it("cancela após conferência real de não aplicação, libera novo comando standalone e preserva o cancelamento frente a ACK tardio", async () => {
    const stateEventId = await disarmedStateEventId();
    const reserved = await createExclusiveCompatecPhysicalCommand({
      alarmSystemId: SYSTEM_ID,
      incidentId: null,
      operatorId: OPERATOR_ID,
      brand: "COMPATEC",
      commandType: "arm",
      transportMode: "microbus_compatec",
      status: "dispatch_unknown",
      partition: null,
      zoneNumber: null,
      pgmNumber: null,
      reason: getCompatecArmAuditReason("customer_request", stateEventId),
      commandPayload: "MB=AK4[4]",
      responsePayload: "Comando sem confirmação eletrônica; conferir a central.",
      executedAt: new Date(Date.now() - 24 * 60 * 60_000),
    });
    if (!reserved.created) throw new Error("Comando indeterminado de teste não reservado");

    expect(await listIndeterminateCompatecCommands(SYSTEM_ID)).toMatchObject([{ id: reserved.id, incidentId: null, status: "dispatch_unknown" }]);
    const immediateRetry = await createExclusiveCompatecPhysicalCommand({
      alarmSystemId: SYSTEM_ID, incidentId: null, operatorId: OPERATOR_ID, brand: "COMPATEC",
      commandType: "disarm", transportMode: "microbus_compatec", status: "queued", partition: null,
      zoneNumber: null, pgmNumber: null, reason: "Desarme de teste", commandPayload: "MB=AK4[12]",
    });
    expect(immediateRetry).toMatchObject({ created: true });
    if (!immediateRetry.created) throw new Error("Nova tentativa deveria ter sido aceita");
    await orm.update(alarmRemoteCommands).set({ status: "cancelled", responsePayload: "Reserva de teste encerrada." }).where(eq(alarmRemoteCommands.id, immediateRetry.id));

    const reconciled = await reconcileCompatecCommand({
      commandId: reserved.id,
      operatorId: OPERATOR_ID,
      operatorName: actor.operatorName,
      authSessionId: SESSION_ID,
      outcome: "not_applied",
      verificationMethod: "Aplicativo Compatec conferido",
      details: "Estado desarmado confirmado; Arme anterior não ocorreu",
      ...directEvidence("arm", "not_applied"),
    });
    expect(reconciled).toMatchObject({ reconciled: true, commandId: reserved.id, incidentId: null, status: "cancelled" });

    const [cancelled] = await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, reserved.id));
    expect(cancelled).toMatchObject({ id: reserved.id, status: "cancelled", operatorId: OPERATOR_ID, incidentId: null, panelConfirmedAt: null });
    expect(cancelled.responsePayload).toContain("[CANCELAMENTO APÓS VERIFICAÇÃO: NÃO APLICADO]");
    expect(cancelled.responsePayload).toContain(actor.operatorName);
    expect(cancelled.responsePayload).toContain("Aplicativo Compatec conferido");
    expect(await listIndeterminateCompatecCommands(SYSTEM_ID)).toHaveLength(0);
    const report = (await reportRows()).find((row) => row.logs?.includes(`[COMANDO REMOTO #${reserved.id}]`));
    expect(report).toBeTruthy();
    expect(report?.operatorId).toBe(OPERATOR_ID);
    expect(report?.observations).toContain("Não aplicado; conferência manual registrada");

    expect(await recordRemoteCommandConfirmation({ commandId: reserved.id, responsePayload: "MB=KA4", confirmedAt: new Date() })).toMatchObject({ recorded: false });
    await updateAlarmRemoteCommandDelivery(reserved.id, { status: "dispatch_unknown", appendResponsePayload: true, responsePayload: "Resposta atrasada" });
    await updateAlarmRemoteCommandDelivery(reserved.id, { status: "sent", responsePayload: "Atualização tardia" });
    const [stillCancelled] = await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, reserved.id));
    expect(stillCancelled.status).toBe("cancelled");
    expect(stillCancelled.responsePayload).toContain("[CANCELAMENTO APÓS VERIFICAÇÃO: NÃO APLICADO]");
    expect(stillCancelled.responsePayload).not.toContain("Resposta atrasada");
    expect(stillCancelled.responsePayload).not.toContain("Atualização tardia");

    const next = await createExclusiveCompatecPhysicalCommand({
      alarmSystemId: SYSTEM_ID, incidentId: null, operatorId: OPERATOR_ID, brand: "COMPATEC",
      commandType: "arm", transportMode: "microbus_compatec", status: "queued", partition: null,
      zoneNumber: null, pgmNumber: null, reason: getCompatecArmAuditReason("customer_request", stateEventId),
      commandPayload: "MB=AK4[4]",
    });
    expect(next.created).toBe(true);
    if (!next.created) return;
    let nextSendCalls = 0;
    const fakeTransport = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID,
      commandId: next.id,
      expectedStatuses: ["queued"],
      unavailableStatus: "waiting_connection",
      sentResponsePayload: "Fake local dispatch accepted; no physical socket used.",
      send: () => { nextSendCalls += 1; return { sent: true, payload: "fake in-memory test result" }; },
    });
    expect(fakeTransport).toMatchObject({ sent: true, status: "sent" });
    expect(nextSendCalls).toBe(1);
  });

  it("libera novo comando imediatamente após registrar Arme manualmente aplicado", async () => {
    const reserved = await createExclusiveCompatecPhysicalCommand({
      alarmSystemId: SYSTEM_ID,
      incidentId: null,
      operatorId: OPERATOR_ID,
      brand: "COMPATEC",
      commandType: "arm",
      transportMode: "microbus_compatec",
      status: "dispatch_unknown",
      partition: null,
      zoneNumber: null,
      pgmNumber: null,
      reason: "Base autorizadora do Arme: Pedido do cliente",
      commandPayload: "MB=AK4[4]",
      responsePayload: "Comando sem confirmação eletrônica; conferir a central.",
    });
    if (!reserved.created) throw new Error("Comando indeterminado de teste não reservado");
    await orm.insert(alarmEvents).values({
      alarmSystemId: SYSTEM_ID,
      account: "0342",
      brand: "COMPATEC",
      qualifier: "R",
      eventCode: "401",
      description: "Estado armado real anterior à conferência manual",
      receiverPort: 9271,
      rawData: "Conta recebida: 0342\nIdentificado por mac_ascii: C1BDCB",
      receivedAt: new Date(Date.now() + 10_000),
    });
    const reconciled = await reconcileCompatecCommand({
      commandId: reserved.id,
      operatorId: OPERATOR_ID,
      operatorName: actor.operatorName,
      authSessionId: SESSION_ID,
      outcome: "applied",
      verificationMethod: "Aplicativo Compatec conferido",
      details: "Central armada e estado conferido ao vivo",
      ...directEvidence("arm", "applied", 12347),
    });
    expect(reconciled).toMatchObject({ reconciled: true, status: "dispatch_unknown" });
    const [stored] = await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, reserved.id));
    expect(stored.status).toBe("dispatch_unknown");
    expect(stored.responsePayload).toContain("[CONFERÊNCIA MANUAL: APLICADO]");
    expect(stored.responsePayload).toContain("Nenhum bloqueio permanece");

    // Um evento posterior incompatível não é necessário para liberar: a nova
    // tentativa já é aceita logo após o registro da conferência.
    const released = await createExclusiveCompatecPhysicalCommand({
      alarmSystemId: SYSTEM_ID, incidentId: null, operatorId: OPERATOR_ID, brand: "COMPATEC",
      commandType: "disarm", transportMode: "microbus_compatec", status: "queued", partition: null,
      zoneNumber: null, pgmNumber: null, reason: "Desarme solicitado", commandPayload: "MB=AK4[12]",
    });
    expect(released.created).toBe(true);
    if (!released.created) throw new Error("Novo comando deveria ter sido aceito");
    await orm.update(alarmRemoteCommands).set({ status: "cancelled", responsePayload: "Reserva de teste encerrada." }).where(eq(alarmRemoteCommands.id, released.id));
  });

  it("cancela sem transmissão quando o estado muda entre a reserva e o despacho do Arme", async () => {
    const reserved = await createExclusiveCompatecPhysicalCommand({
      alarmSystemId: SYSTEM_ID, incidentId: null, operatorId: OPERATOR_ID, brand: "COMPATEC",
      commandType: "arm", transportMode: "microbus_compatec", status: "queued", partition: null,
      zoneNumber: null, pgmNumber: null,
      reason: "Base autorizadora do Arme: Pedido do cliente; estado desarmado conferido no evento #5001",
      commandPayload: "MB=AK4[4]",
    });
    if (!reserved.created) throw new Error("Arme de teste não reservado");
    await orm.insert(alarmEvents).values({
      alarmSystemId: SYSTEM_ID, account: "0342", brand: "COMPATEC", qualifier: "R", eventCode: "401",
      description: "Arme real recebido antes do envio solicitado", receiverPort: 9271,
      rawData: "Conta recebida: 0342\nIdentificado por mac_ascii: C1BDCB", receivedAt: new Date(Date.now() + 10_000),
    });
    let sendCalls = 0;
    const result = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID, commandId: reserved.id, expectedStatuses: ["queued"],
      unavailableStatus: "waiting_connection", sentResponsePayload: "Não deveria transmitir",
      send: () => { sendCalls += 1; return { sent: true, payload: "não transmitir" }; },
    });
    expect(result).toMatchObject({ sent: false, status: "cancelled" });
    expect(result.message).toContain("estado DESARMADO mudou desde a autorização");
    expect(sendCalls).toBe(0);
  });

  it("não envia Arme programado se a agenda ativa deixou de autorizar antes do envio", async () => {
    const stateEventId = await disarmedStateEventId();
    const timeParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo", weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date());
    const part = (type: string) => timeParts.find((item) => item.type === type)?.value;
    const nowMinutes = Number(part("hour")) * 60 + Number(part("minute"));
    const armMinutes = (nowMinutes - 20 + 1440) % 1440;
    const armAt = `${String(Math.floor(armMinutes / 60)).padStart(2, "0")}:${String(armMinutes % 60).padStart(2, "0")}`;
    const scheduleResult = await upsertAlarmSchedule({
      alarmSystemId: SYSTEM_ID,
      partition: 1,
      isActive: true,
      mondayArm: armAt,
      tuesdayArm: armAt,
      wednesdayArm: armAt,
      thursdayArm: armAt,
      fridayArm: armAt,
      saturdayArm: armAt,
      sundayArm: armAt,
    });
    const scheduleContext = await getAlarmScheduleContext(SYSTEM_ID);
    const activeSchedules = scheduleContext?.schedules ?? (scheduleContext?.schedule ? [scheduleContext.schedule] : []);
    const decisions = activeSchedules.map((schedule) => evaluateAlarmSchedule({
      schedule,
      holidays: (scheduleContext?.holidayDates || []).map((date) => ({ date, holidayArm: schedule.holidayArm, holidayDisarm: schedule.holidayDisarm })),
      exceptions: scheduleContext?.exceptions || [],
      at: new Date(),
      actualState: "disarmed",
    }));
    expect(areCompatecArmScheduleBasesAllowed("scheduled_arm_overdue", decisions)).toBe(true);
    const reserved = await createExclusiveCompatecPhysicalCommand({
      alarmSystemId: SYSTEM_ID, incidentId: null, operatorId: OPERATOR_ID, brand: "COMPATEC",
      commandType: "arm", transportMode: "microbus_compatec", status: "queued", partition: null,
      zoneNumber: null, pgmNumber: null,
      reason: getCompatecArmAuditReason("scheduled_arm_overdue", stateEventId),
      commandPayload: "MB=AK4[4]",
    });
    if (!reserved.created) throw new Error("Arme programado de teste não reservado");
    await updateAlarmSchedule(scheduleResult.id, { isActive: false });
    expect(await getAlarmScheduleContext(SYSTEM_ID)).toMatchObject({ schedules: [] });
    let sendCalls = 0;
    const result = await dispatchAlarmRemoteCommand({
      alarmSystemId: SYSTEM_ID, commandId: reserved.id, expectedStatuses: ["queued"],
      unavailableStatus: "waiting_connection", sentResponsePayload: "Não deveria transmitir",
      send: () => { sendCalls += 1; return { sent: true, payload: "não transmitir" }; },
    });
    expect(result).toMatchObject({ sent: false, status: "cancelled" });
    expect(result.message).toContain("agendas ativas de todas as partições");
    expect(sendCalls).toBe(0);
  });

  it("mantém indeterminados também os comandos legados e Arme/Desarme após qualquer resposta tardia", async () => {
    const commandTypes = ["arm", "disarm", "isolate_zone", "query_sectors"] as const;
    await orm.insert(alarmRemoteCommands).values(commandTypes.map((commandType) => ({
      alarmSystemId: SYSTEM_ID,
      incidentId: INCIDENT_ID,
      operatorId: OPERATOR_ID,
      brand: "COMPATEC",
      commandType,
      transportMode: "microbus_compatec",
      status: "dispatch_unknown",
      partition: null,
      zoneNumber: commandType === "isolate_zone" ? 3 : null,
      pgmNumber: null,
      reason: `Resposta tardia ${commandType}`,
      commandPayload: commandType === "query_sectors" ? "MB=AK0[]" : "MB=AK4[4]",
      responsePayload: "Resultado indeterminado",
    })));
    const rows = await commandRows();
    for (const row of rows) {
      if (row.commandType === "query_sectors") {
        await updateAlarmRemoteCommandDelivery(row.id, { status: "responded", responsePayload: "MB=AK3[estado]" });
      } else {
        expect(await recordRemoteCommandConfirmation({ commandId: row.id, responsePayload: row.commandType === "arm" || row.commandType === "disarm" ? "MB=KA4[4]" : "MB=KA1" })).toMatchObject({ recorded: true });
      }
      await updateAlarmRemoteCommandDelivery(row.id, { status: "failed", responsePayload: "Atualização tardia não pode liberar" });
    }
    const afterLateResponses = await commandRows();
    expect(afterLateResponses.every((row) => row.status === "dispatch_unknown")).toBe(true);
    expect(afterLateResponses.every((row) => row.responsePayload?.includes("Bloqueio mantido até conferência manual"))).toBe(true);
    expect(afterLateResponses.every((row) => row.panelConfirmedAt === null)).toBe(true);

    for (const row of afterLateResponses) {
      await reconcileCompatecCommand({
        commandId: row.id,
        operatorId: OPERATOR_ID,
        operatorName: actor.operatorName,
        authSessionId: SESSION_ID,
        outcome: row.commandType === "query_sectors" ? "verified" : "applied",
        verificationMethod: "Aplicativo Compatec conferido",
        details: `Estado de ${row.commandType} conferido com responsável`,
        ...directEvidence(row.commandType, row.commandType === "query_sectors" ? "verified" : "applied"),
      });
    }
    const reconciledRows = await commandRows();
    expect(reconciledRows.find((row) => row.commandType === "query_sectors")?.status).toBe("reconciled");
    expect(reconciledRows.filter((row) => row.commandType !== "query_sectors").every((row) => row.status === "dispatch_unknown")).toBe(true);
  });

  it("cancela comandos individuais antigos que aguardavam conexão e não os envia no próximo login", async () => {
    await orm.insert(alarmRemoteCommands).values([
      {
        alarmSystemId: SYSTEM_ID, incidentId: INCIDENT_ID, operatorId: OPERATOR_ID, brand: "COMPATEC",
        commandType: "isolate_zone", transportMode: "microbus_compatec", status: "waiting_connection",
        partition: null, zoneNumber: 3, pgmNumber: null, reason: "Comando anterior pendente",
        commandPayload: "MB=AK2[legacy-isolate]", responsePayload: "Nunca enviado",
      },
      {
        alarmSystemId: SYSTEM_ID, incidentId: INCIDENT_ID, operatorId: OPERATOR_ID, brand: "COMPATEC",
        commandType: "configure_zones", transportMode: "microbus_compatec", status: "waiting_connection",
        partition: null, zoneNumber: null, pgmNumber: null, reason: "Comando anterior pendente",
        commandPayload: JSON.stringify({ protocol: "Compatec MicroBus", mode: "physical_zone_configuration", commandType: "configure_zones", zoneChanges, frames: buildCompatecZoneConfigurationFrames(zoneChanges) }),
        responsePayload: "Nunca enviado",
      },
    ]);

    expect(await getPendingCompatecCommand(SYSTEM_ID)).toBeUndefined();
    const commands = await commandRows();
    expect(commands).toHaveLength(2);
    expect(commands.every((command) => command.status === "cancelled")).toBe(true);
    expect(commands.every((command) => command.responsePayload?.includes("cancelado sem transmissão"))).toBe(true);
  });

  it("rejeita sem gravar quando faltar identidade física/porta, zona ativa ou lease desta tela", async () => {
    await orm.update(alarmSystems).set({ macAddress: null, receiverPort: null }).where(eq(alarmSystems.id, SYSTEM_ID));
    await expect(createExclusiveCompatecZoneConfiguration(input())).rejects.toThrow(/MAC ou IMEI de 6 caracteres hexadecimais.*porta do receptor/i);
    expect(await commandRows()).toHaveLength(0);

    await orm.update(alarmSystems).set({ macAddress: null, imeiGprs: null, serialNumber: "1234567890", isepId: "ABCD", receiverPort: 9271 }).where(eq(alarmSystems.id, SYSTEM_ID));
    await expect(createExclusiveCompatecZoneConfiguration(input())).rejects.toThrow(/MAC ou IMEI de 6 caracteres hexadecimais/i);
    expect(await commandRows()).toHaveLength(0);

    await orm.update(alarmSystems).set({ macAddress: "C1BDCB", receiverPort: 9271 }).where(eq(alarmSystems.id, SYSTEM_ID));
    await orm.update(alarmZones).set({ isActive: false }).where(eq(alarmZones.zoneNumber, 4));
    await expect(createExclusiveCompatecZoneConfiguration(input())).rejects.toThrow(/Setor 4 não está cadastrado como ativo/i);
    expect(await commandRows()).toHaveLength(0);

    await orm.update(alarmZones).set({ isActive: true }).where(eq(alarmZones.zoneNumber, 4));
    await orm.update(incidentPanelLeases).set({ leaseToken: "22222222-2222-4222-8222-222222222222" }).where(eq(incidentPanelLeases.incidentId, INCIDENT_ID));
    await expect(createExclusiveCompatecZoneConfiguration(input())).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await commandRows()).toHaveLength(0);
  });

  it("serializa duas reservas concorrentes e cria somente um comando físico pendente", async () => {
    const reservations = await Promise.all([createExclusiveCompatecZoneConfiguration(input()), createExclusiveCompatecZoneConfiguration(input())]);
    expect(reservations.filter((reservation) => reservation.created)).toHaveLength(1);
    expect(reservations.filter((reservation) => !reservation.created)).toHaveLength(1);
    expect(await commandRows()).toHaveLength(1);
    expect(await orm.select().from(occurrences)).toHaveLength(1);
    expect(await orm.select().from(alarmEvents)).toHaveLength(1);
    expect(await orm.select().from(incidents)).toHaveLength(1);
  });
});
