import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dashboardSource = readFileSync(resolve(process.cwd(), "client/src/pages/Dashboard.tsx"), "utf8");

describe("Desarme Compatec no atendimento", () => {
  it("mostra um botão direto para toda central Compatec ativa e cadastrada", () => {
    expect(dashboardSource).toContain("selectedCompatecDisarmEnabled");
    expect(dashboardSource).toContain('selectedSystem?.brand === "COMPATEC" && selectedSystem.isActive !== false');
    expect(dashboardSource).toContain('selectedCompatecAction === "arm"');
    expect(dashboardSource).toContain('selectedCompatecAction === "disarm"');
    expect(dashboardSource).toContain(': "DESARME"');
    expect(dashboardSource).toContain(': "ARMAR"');
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

describe("Arme Compatec de bancada", () => {
  it("relaciona o estado retornado pela API ao sistema da ocorrência", () => {
    expect(dashboardSource).toContain("const systemId = selectedEvent?.alarmSystemId ?? selectedSystem?.id");
    expect(dashboardSource).toContain("item.alarmSystemId === systemId || item.systemId === systemId");
  });

  it("confirma o Arme rápido sem abrir o modal de comandos", () => {
    expect(dashboardSource).toContain("submitCompatecArmQuick");
    expect(dashboardSource).toContain("CONFIRMAR ARME FÍSICO?");
    expect(dashboardSource).toContain("armCompatecAllMut.mutate");
    expect(dashboardSource).toContain("Arme físico MicroBus confirmado pelo operador.");
  });

  it("mantém o quadro oficial AK4[4] no fluxo técnico de compatibilidade", () => {
    expect(dashboardSource).toContain("armCompatecAllMut");
    expect(dashboardSource).toContain("submitCompatecBenchArmAll");
    expect(dashboardSource).toContain("Armar central Compatec (MB=AK4[4])");
    expect(dashboardSource).toContain('selectedSystem?.brand !== "COMPATEC" || selectedSystem.isActive === false');
  });

  it("mantém Toggle, partições, setores e PGM fora do fluxo físico", () => {
    expect(dashboardSource).toContain("O Toggle, partições, setores e PGM não serão usados");
    expect(dashboardSource).toContain("Toggle, Zona e PGM permanecem bloqueados para transmissão");
  });
});
