import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dashboardSource = readFileSync(resolve(process.cwd(), "client/src/pages/Dashboard.tsx"), "utf8");

describe("Desarme Compatec no atendimento", () => {
  it("mostra um botão direto para toda central Compatec ativa e cadastrada", () => {
    expect(dashboardSource).toContain("selectedCompatecDisarmEnabled");
    expect(dashboardSource).toContain('selectedSystem?.brand === "COMPATEC" && selectedSystem.isActive !== false');
    expect(dashboardSource).toContain(': "DESARME"');
  });

  it("confirma a ação antes de enviar e registra o operador sem exigir campos técnicos", () => {
    expect(dashboardSource).toContain("CONFIRMAR DESARME FÍSICO?");
    expect(dashboardSource).toContain("window.confirm");
    expect(dashboardSource).toContain("disarmBenchAllMut.mutate");
    expect(dashboardSource).toContain("Desarme físico confirmado pelo operador");
  });

  it("mantém a proteção do servidor por marca, cadastro ativo e escopo do parceiro", () => {
    const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const disarmRoute = routerSource.slice(routerSource.indexOf("disarmBenchAll: operatorProcedure"), routerSource.indexOf("  }),\n  alarmPgm: router"));
    expect(disarmRoute).toContain('system.brand !== "COMPATEC" || system.isActive === false');
    expect(disarmRoute).toContain('transportMode: "microbus_compatec"');
    expect(disarmRoute).not.toContain("isConfirmedCompatecBenchSystem(system)");
  });
});
