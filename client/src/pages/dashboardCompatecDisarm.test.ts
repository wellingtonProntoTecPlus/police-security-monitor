import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dashboardSource = readFileSync(resolve(process.cwd(), "client/src/pages/Dashboard.tsx"), "utf8");

describe("Desarme Compatec de bancada no atendimento", () => {
  it("mostra um botão direto somente quando a bancada está habilitada e identificada pelo MAC", () => {
    expect(dashboardSource).toContain("selectedCompatecBenchEnabled");
    expect(dashboardSource).toContain("remoteCommandLabEnabled");
    expect(dashboardSource).toContain('normalizedMac.endsWith("C1BDCB")');
    expect(dashboardSource).toContain(': "DESARME"');
  });

  it("confirma a ação antes de enviar e registra o operador sem exigir campos técnicos", () => {
    expect(dashboardSource).toContain("CONFIRMAR DESARME FÍSICO?");
    expect(dashboardSource).toContain("window.confirm");
    expect(dashboardSource).toContain("disarmBenchAllMut.mutate");
    expect(dashboardSource).toContain("Desarme físico confirmado pelo operador");
  });

  it("mantém a proteção do servidor para a bancada Compatec autorizada", () => {
    const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    expect(routerSource).toContain("if (!isConfirmedCompatecBenchSystem(system))");
    expect(routerSource).toContain("MAC C1BDCB");
  });
});
