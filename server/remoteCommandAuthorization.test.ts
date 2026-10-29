import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const receiverSource = readFileSync(new URL("./receiver/index.ts", import.meta.url), "utf8");

describe("autorização dos comandos MicroBus de bancada", () => {
  it("preserva a simulação Intelbras legada sem transformar seu quadro em transmissão física", () => {
    expect(source).toContain('system.brand !== "INTELBRAS"');
    expect(source).toContain("validateIntelbrasSimulationTarget(input)");
    expect(source).toContain("buildIntelbrasSimulationPayload(input)");
    expect(source).toContain("nenhum quadro ISECnet/E7 foi transmitido");
    expect(receiverSource).not.toContain("buildIntelbrasIsecnetArmDisarmFrame");
  });

  it("mantém o comando físico Intelbras separado e exige estado, credencial e sessão identificada", () => {
    expect(source).toContain("sendIntelbrasPhysical: operatorProcedure");
    expect(source).toContain("isPhysicalIntelbrasSystem(system)");
    expect(source).toContain('credential.credentialKind === "intelbras_master"');
    expect(source).toContain("getLatestArmDisarmStatusForSystem");
    expect(source).toContain('transportMode: "intelbras_amt8000_e7"');
    expect(source).not.toContain('transportMode: "intelbras_e9"');
    expect(receiverSource).toContain("rememberActiveIntelbrasSession");
    expect(receiverSource).toContain("consumeIntelbrasPhysicalResponse");
    expect(receiverSource).toContain("deliverPendingIntelbrasPhysicalCommand");
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

  it("permite ao operador ativar o modo de bancada somente para os MACs físicos homologados", () => {
    const laboratoryRoute = source.slice(source.indexOf("setRemoteCommandLaboratory:"), source.indexOf("  }),\n\n  // ============================================================\n  // ALARM ZONES"));
    expect(source).toContain("setRemoteCommandLaboratory: operatorProcedure");
    expect(laboratoryRoute).toContain("isKnownRemoteCommandBenchSystem(system)");
    expect(laboratoryRoute).not.toContain('system.brand !== "COMPATEC"');
  });

  it("aguarda o próximo login Vetti e só envia a consulta depois do ACK", () => {
    expect(source).toContain('status: "waiting_connection"');
    expect(source).not.toContain("sendVettiBenchStatusQuery");
    expect(receiverSource.indexOf("socket.write(Buffer.from([0x02, 0x04, 0xC0, 0x80, 0xCF]))")).toBeLessThan(receiverSource.indexOf("deliverPendingVettiBenchStatusQuery(confirmedBenchSystem, socket)"));
  });
});
