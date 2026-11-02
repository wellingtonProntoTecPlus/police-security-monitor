import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INTELBRAS_PHYSICAL_COMMAND_DISABLED_MESSAGE, INTELBRAS_PHYSICAL_COMMAND_ENABLED } from "@shared/remoteCommandCredentialProfiles";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const receiverSource = readFileSync(new URL("./receiver/index.ts", import.meta.url), "utf8");
const databaseSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

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
