import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const receiverSource = readFileSync(new URL("./receiver/index.ts", import.meta.url), "utf8");

describe("autorização dos comandos MicroBus de bancada", () => {
  it("permite operador autenticado nas ações de bancada sem abrir exceção para outros sistemas", () => {
    expect(source).toContain("queryBenchStatus: operatorProcedure");
    expect(source).toContain("queryBenchSectors: operatorProcedure");
    expect(source).toContain("disarmBenchAll: operatorProcedure");
    expect(source).toContain("isConfirmedCompatecBenchSystem(system)");
    expect(source).toContain("MAC C1BDCB");
  });

  it("não mantém a rota de Desarme físico restrita exclusivamente ao administrador", () => {
    expect(source).not.toContain("disarmBenchAll: adminProcedure");
  });

  it("expõe somente a consulta Vetti de status para o operador e preserva a trava de bancada", () => {
    expect(source).toContain("queryVettiBenchStatus: operatorProcedure");
    expect(source).toContain("isConfirmedVettiBenchSystem(system)");
    expect(source).toContain('system.account !== "0336"');
    expect(source).toContain("MAC 2DE4A8");
    expect(source).not.toContain("armVettiBench");
    expect(source).not.toContain("disarmVettiBench");
  });

  it("aguarda o próximo login Vetti e só envia a consulta depois do ACK", () => {
    expect(source).toContain('status: "waiting_connection"');
    expect(source).not.toContain("sendVettiBenchStatusQuery");
    expect(receiverSource.indexOf("socket.write(Buffer.from([0x02, 0x04, 0xC0, 0x80, 0xCF]))")).toBeLessThan(receiverSource.indexOf("deliverPendingVettiBenchStatusQuery(confirmedBenchSystem)"));
  });
});
