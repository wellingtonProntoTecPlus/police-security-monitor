import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INTELBRAS_PHYSICAL_COMMAND_DISABLED_MESSAGE, INTELBRAS_PHYSICAL_COMMAND_ENABLED } from "@shared/remoteCommandCredentialProfiles";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const receiverSource = readFileSync(new URL("./receiver/index.ts", import.meta.url), "utf8");
const databaseSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../client/src/pages/Dashboard.tsx", import.meta.url), "utf8");
const zonePanelSource = readFileSync(new URL("../client/src/components/CompatecZoneConfigurationPanel.tsx", import.meta.url), "utf8");
const maintenanceSource = readFileSync(new URL("./incidentMaintenancePersistence.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const upgradeSource = readFileSync(new URL("../deploy/upgrade_vps.sql", import.meta.url), "utf8");

describe("autorização dos comandos MicroBus de bancada", () => {
  it("preserva a simulação Intelbras legada sem transformar seu quadro em transmissão física", () => {
    expect(source).toContain('system.brand !== "INTELBRAS"');
    expect(source).toContain("validateIntelbrasSimulationTarget(input)");
    expect(source).toContain("buildIntelbrasSimulationPayload(input)");
    expect(source).toContain("nenhum quadro ISECnet/E7 foi transmitido");
    expect(receiverSource).not.toContain("buildIntelbrasIsecnetArmDisarmFrame");
  });

  it("mantém o Arme/Desarme AMT-8000 fisicamente bloqueado enquanto o protocolo de Senha Master não está validado", () => {
    expect(INTELBRAS_PHYSICAL_COMMAND_ENABLED).toBe(false);
    expect(INTELBRAS_PHYSICAL_COMMAND_DISABLED_MESSAGE).toContain("Senha Master");
    expect(source).toContain("sendIntelbrasPhysical: operatorProcedure");
    const physicalRoute = source.slice(source.indexOf("sendIntelbrasPhysical: operatorProcedure"), source.indexOf("queryVettiBenchStatus: operatorProcedure"));
    expect(physicalRoute).toContain("throw new TRPCError({ code: \"PRECONDITION_FAILED\"");
    expect(physicalRoute).not.toContain("createExclusiveIntelbrasPhysicalCommand");
    expect(physicalRoute).not.toContain("sendIntelbrasPhysicalCommand(");
    expect(physicalRoute).not.toContain('getAlarmRemoteCredentialForTransport(system.id, "intelbras_remote_configuration")');
    expect(physicalRoute).not.toContain("await assertPartnerSystemScope");
    expect(receiverSource).toContain("rememberActiveIntelbrasSession");
    expect(receiverSource).toContain("consumeIntelbrasPhysicalResponse");
    expect(receiverSource).not.toContain("deliverPendingIntelbrasPhysicalCommand");
    expect(receiverSource).toContain("Comandos Intelbras de alternância nunca são disparados automaticamente");
    const pendingQuery = databaseSource.slice(databaseSource.indexOf("export async function getPendingIntelbrasPhysicalCommand"), databaseSource.indexOf("export async function setAlarmSystemRemoteCommandLabEnabled"));
    expect(pendingQuery).toContain('eq(alarmRemoteCommands.status, "queued")');
    expect(pendingQuery).not.toContain('inArray(alarmRemoteCommands.status, ["queued", "waiting_connection"])');
  });

  it("mantém consultas restritas à bancada e permite o Desarme somente para Compatec ativa", () => {
    expect(source).toContain("queryBenchStatus: operatorProcedure");
    expect(source).toContain("queryBenchSectors: operatorProcedure");
    expect(source).toContain("disarmBenchAll: operatorProcedure");
    expect(source).toContain("isConfirmedCompatecBenchSystem(system)");
    expect(source).toContain("MAC C1BDCB");
    const statusQueryRoute = source.slice(source.indexOf("queryBenchStatus: operatorProcedure"), source.indexOf("queryBenchSectors: operatorProcedure"));
    const sectorsQueryRoute = source.slice(source.indexOf("queryBenchSectors: operatorProcedure"), source.indexOf("armCompatecAll: operatorProcedure"));
    expect(statusQueryRoute).toContain("createExclusiveCompatecPhysicalCommand");
    expect(sectorsQueryRoute).toContain("createExclusiveCompatecPhysicalCommand");
    expect(statusQueryRoute).toContain('transportMode: "microbus_compatec"');
    expect(sectorsQueryRoute).toContain('transportMode: "microbus_compatec"');
    const disarmRoute = source.slice(source.indexOf("disarmBenchAll: operatorProcedure"), source.indexOf("  }),\n  alarmPgm: router"));
    expect(disarmRoute).toContain('system.brand !== "COMPATEC" || system.isActive === false');
    expect(disarmRoute).not.toContain("isConfirmedCompatecBenchSystem(system)");
    expect(disarmRoute).toContain('const payload = "MB=AK4[12]\\r\\n"');
    expect(disarmRoute).not.toContain("MB=AK4[0,03FF]");
    expect(disarmRoute).toContain("getLatestArmDisarmStatusForSystem");
    expect(disarmRoute).toContain('currentState.qualifier !== "R"');
    expect(disarmRoute).toContain("createExclusiveCompatecPhysicalCommand");
  });

  it("libera o Arme físico para toda Compatec ativa e cadastrada e usa o quadro fixo AK4[4]", () => {
    expect(source).toContain("armCompatecAll: operatorProcedure");
    const armRoute = source.slice(source.indexOf("armCompatecAll: operatorProcedure"), source.indexOf("  }),\n    disarmBenchAll: operatorProcedure"));
    expect(armRoute).toContain('system.brand !== "COMPATEC" || system.isActive === false');
    expect(armRoute).not.toContain("isConfirmedCompatecBenchSystem(system)");
    expect(armRoute).toContain('const payload = "MB=AK4[4]\\r\\n"');
    expect(armRoute).toContain("createExclusiveCompatecPhysicalCommand");
    expect(armRoute).toContain('commandType: "arm"');
    expect(armRoute).toContain('transportMode: "microbus_compatec"');
    expect(armRoute).toContain("getLatestArmDisarmStatusForSystem");
    expect(armRoute).toContain('currentState.qualifier !== "E"');
  });

  it("bloqueia comando físico avulso e exige configuração multi-setorial auditada com lease", () => {
    const zoneRoute = source.slice(source.indexOf("compatecZonePhysical: operatorProcedure"), source.indexOf("  }),\n  alarmPgm: router"));
    expect(zoneRoute).toContain("assertPartnerSystemScope(ctx, input.alarmSystemId)");
    expect(zoneRoute).toContain("Comando físico de setor individual desativado");
    expect(zoneRoute).not.toContain("sendCompatecMw1PhysicalCommand");
    const configRoute = source.slice(source.indexOf("configureCompatecZones: operatorProcedure"), source.indexOf("compatecZonePhysical: operatorProcedure"));
    expect(configRoute).toContain("createExclusiveCompatecZoneConfiguration");
    expect(configRoute).toContain("requiredPanelActor: actor");
    expect(configRoute).toContain("requiredZoneNumbers: reservation.zoneChanges.map");
    expect(configRoute).toContain('expectedStatuses: ["prepared"]');
    expect(configRoute).toContain("sendCompatecMw1PhysicalCommand");
    expect(databaseSource).toContain("await assertActivePanelLease(tx, input.incidentId, input.actor)");
    expect(databaseSource).toContain("eq(incidents.alarmSystemId, alarmSystemId)");
  });

  it("permite setores no modal sem ocorrência, mas exige sessão operacional, identidade física e auditoria", () => {
    const route = source.slice(source.indexOf("configureCompatecZonesStandalone:"), source.indexOf("compatecZonePhysical: operatorProcedure"));
    const reservation = databaseSource.slice(
      databaseSource.indexOf("export async function createStandaloneCompatecZoneConfiguration"),
      databaseSource.indexOf("export async function createExclusiveCompatecZoneConfiguration"),
    );
    expect(route).toContain("standaloneCompatecZoneConfigurationInputSchema");
    expect(route).toContain("assertPartnerSystemScope(ctx, input.alarmSystemId)");
    expect(route).toContain("if (!ctx.authSessionId)");
    expect(route).toContain("createStandaloneCompatecZoneConfiguration");
    expect(route).toContain("requiredOperatorSession: { operatorId: ctx.user.id, authSessionId: ctx.authSessionId }");
    expect(route).toContain("requiredPhysicalIdentity: reservation.physicalIdentity");
    expect(route).toContain("requiredZoneNumbers: reservation.zoneChanges.map");
    expect(route).toContain('expectedStatuses: ["prepared"]');
    expect(reservation).toContain("lockActiveOperatorSession(tx, input.operatorId, input.authSessionId)");
    expect(reservation).toContain("getCompatecConnectionIdentity(systemRef)");
    expect(reservation).toContain("incidentId: null");
    expect(reservation).toContain("operatorId: input.operatorId");
    expect(reservation).toContain("syncCompatecRemoteCommandOccurrence(tx, command)");
  });

  it("não deixa o modal standalone contornar atendimento aberto e serializa novos incidentes pela central", () => {
    const reservation = databaseSource.slice(
      databaseSource.indexOf("export async function createStandaloneCompatecZoneConfiguration"),
      databaseSource.indexOf("export async function createExclusiveCompatecZoneConfiguration"),
    );
    const dispatcher = databaseSource.slice(
      databaseSource.indexOf("export async function dispatchAlarmRemoteCommand"),
      databaseSource.indexOf("export async function expireStaleRemoteCommandDispatches"),
    );
    expect(reservation).toContain("hasOpenIncidentForAlarmSystem(tx, input.alarmSystemId)");
    expect(reservation).toContain("ocorrência aberta. Faça a configuração dentro do atendimento assumido");
    expect(dispatcher.match(/hasOpenIncidentForAlarmSystem\(tx, input\.alarmSystemId\)/g)).toHaveLength(2);
    expect(dispatcher).toContain("Comando standalone cancelado sem transmissão");
    expect(databaseSource).toContain("async function lockAlarmSystemForIncidentInsert");
    expect(databaseSource).toContain("await lockAlarmSystemForIncidentInsert(tx, input.alarmSystemId)");
    expect(databaseSource).toContain("await lockAlarmSystemForIncidentInsert(tx, data.alarmSystemId)");
    expect(databaseSource).toContain("await lockAlarmSystemForIncidentInsert(tx, system.id)");
    expect(schemaSource).toContain('index("incidents_system_status_idx").on(table.alarmSystemId, table.status)');
    expect(upgradeSource).toContain("CREATE INDEX `incidents_system_status_idx` ON `incidents` (`alarmSystemId`,`status`)");
    expect(upgradeSource).toContain("INDEX_NAME='incidents_system_status_idx'");
  });

  it("mantém ordem de locks cliente→central na reserva setorial, igual ao dispatcher e à exclusão do cliente", () => {
    const reservation = databaseSource.slice(
      databaseSource.indexOf("export async function createExclusiveCompatecZoneConfiguration"),
      databaseSource.indexOf("export async function dispatchAlarmRemoteCommand"),
    );
    const clientLock = reservation.indexOf(".from(clients)");
    const systemLock = reservation.indexOf(".from(alarmSystems).where(and(eq(alarmSystems.id, input.alarmSystemId), eq(alarmSystems.clientId, client.id))).for(\"update\")");
    expect(clientLock).toBeGreaterThan(-1);
    expect(systemLock).toBeGreaterThan(clientLock);
  });

  it("mantém ocorrências→central na manutenção manual e automática para evitar ciclo com comandos Compatec", () => {
    const start = maintenanceSource.slice(maintenanceSource.indexOf("export async function startSystemMaintenanceWithDb"), maintenanceSource.indexOf("export async function endSystemMaintenanceWithDb"));
    const end = maintenanceSource.slice(maintenanceSource.indexOf("export async function endSystemMaintenanceWithDb"), maintenanceSource.indexOf("export async function reconcileOperationalIncidentWindowsWithDb"));
    expect(start.indexOf(".from(incidents)")).toBeGreaterThan(-1);
    expect(start.indexOf(".from(incidents)")).toBeLessThan(start.indexOf(".from(alarmSystems)"));
    expect(end.indexOf(".from(incidents)")).toBeGreaterThan(-1);
    expect(end.indexOf(".from(incidents)")).toBeLessThan(end.indexOf(".from(alarmSystems)"));
    const windows = maintenanceSource.slice(maintenanceSource.indexOf("export async function reconcileOperationalIncidentWindowsWithDb"));
    expect(windows.indexOf("const rows = await tx.select().from(incidents)")).toBeLessThan(windows.indexOf("const [current] = await tx.select().from(alarmSystems)"));
    expect(start).toContain('isolationLevel: "read committed"');
    expect(end).toContain('isolationLevel: "read committed"');
    expect(windows.match(/isolationLevel: "read committed"/g)).toHaveLength(2);
  });

  it("mantém confirmação, motivo e payload auditável sem campo de solicitante ou protocolo na tela", () => {
    expect(dashboardSource).toContain("<CompatecZoneConfigurationPanel");
    expect(dashboardSource).not.toContain("compatecZonePhysicalMut.mutate");
    expect(zonePanelSource).toContain("window.confirm(confirmation)");
    expect(zonePanelSource).toContain("incidentConfigure.mutate({");
    expect(zonePanelSource).toContain("standaloneConfigure.mutate({");
    expect(zonePanelSource).toContain("reason: normalizedReason");
    expect(zonePanelSource).toContain("leaseToken,");
    expect(zonePanelSource).toContain("reason: normalizedReason, zoneChanges");
    expect(zonePanelSource).not.toContain("requestedBy");
    expect(zonePanelSource).not.toContain("Solicitado por");
    expect(zonePanelSource).toContain("Descrição / motivo: ${normalizedReason}");
    expect(zonePanelSource).not.toMatch(/buildCompatecZoneConfigurationFrames|\bAK[124]\b|\bKA1\b|quadros físicos/i);
    expect(dashboardSource).toContain('toast.success("Alteração dos setores recebida. Confira o estado final no painel."');
    expect(dashboardSource).toContain('toast.info(`${ev.actionLabel || "Comando Compatec"}: resposta ${responseCode} recebida. ${caution}`');
    expect(dashboardSource).toContain("A resposta não confirma o estado final; confira o evento/status real do painel.");
    expect(dashboardSource).toContain("disabled>Arme por partição indisponível até homologação Compatec</Button>");
  });

  it("integra parser fragmentado e emite ACK KA1 separado de confirmação de Arme/Desarme", () => {
    expect(receiverSource).toContain("getCompatecMw1StatusResponseLineForSocket(socket, data)");
    expect(receiverSource).toContain('kind: "remote_command_ack"');
    expect(receiverSource).not.toContain("getCompatecMw1StatusResponseLine(data)");
    expect(dashboardSource).toContain('ev.kind === "remote_command_ack"');
  });

  it("não mantém a rota de Desarme físico restrita exclusivamente ao administrador", () => {
    expect(source).not.toContain("disarmBenchAll: adminProcedure");
  });

  it("expõe somente consulta e Desarme Vetti para o operador e preserva a trava de bancada", () => {
    expect(source).toContain("queryVettiBenchStatus: operatorProcedure");
    expect(source).toContain("disarmVettiBench: operatorProcedure");
    expect(source).toContain("isConfirmedVettiBenchSystem(system)");
    expect(source).toContain('system.account !== "0336"');
    expect(source).toContain("MAC 2DE4A8");
    expect(source).toContain("createExclusiveVettiBenchCommand");
    expect(source).not.toMatch(/(^|\n)\s*armVettiBench:\s*operatorProcedure/);
    expect(source).toContain('commandType: "disarm", transportMode: "vsec_bench"');
  });

  it("exige admin e justificativa para habilitar a bancada Intelbras e audita sem transmitir", () => {
    const laboratoryRoute = source.slice(source.indexOf("setRemoteCommandLaboratory:"), source.indexOf("  }),\n\n  // ============================================================\n  // ALARM ZONES"));
    expect(source).toContain("setRemoteCommandLaboratory: operatorProcedure");
    expect(laboratoryRoute).toContain("isKnownRemoteCommandBenchSystem(system)");
    expect(laboratoryRoute).toContain('ctx.user.role !== "admin"');
    expect(laboratoryRoute).toContain("auditar a bancada AMT-8000");
    expect(laboratoryRoute).not.toContain('system.brand !== "COMPATEC"');
  });

  it("aguarda o próximo login Vetti e só envia a consulta depois do ACK", () => {
    expect(source).toContain('status: "waiting_connection"');
    expect(source).not.toContain("sendVettiBenchStatusQuery");
    expect(receiverSource.indexOf("socket.write(Buffer.from([0x02, 0x04, 0xC0, 0x80, 0xCF]))")).toBeLessThan(receiverSource.indexOf("deliverPendingVettiBenchStatusQuery(confirmedBenchSystem, socket)"));
  });
});
