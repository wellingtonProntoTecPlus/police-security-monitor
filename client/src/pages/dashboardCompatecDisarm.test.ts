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

  it("usa formulário operacional de Arme com confirmação e chaves sem exigir tela técnica", () => {
    expect(dashboardSource).toContain("submitCompatecArmQuick");
    expect(dashboardSource).toContain("CONFIRMAR ARME FÍSICO DA CENTRAL COMPATEC?");
    expect(dashboardSource).toContain("armCompatecAllMut.mutate");
    expect(dashboardSource).toContain("openStandaloneCommandRequest({ ...selectedSystem");
    expect(dashboardSource).toContain("selectionIds: selections.map((item) => item.id)");
    expect(dashboardSource).toContain("CompatecZoneArmControls");
  });

  it("mantém o quadro oficial AK4[4] no fluxo técnico de compatibilidade", () => {
    expect(dashboardSource).toContain("armCompatecAllMut");
    expect(dashboardSource).toContain("submitCompatecBenchArmAll");
    expect(dashboardSource).toContain("Armar central Compatec (MB=AK4[4])");
    expect(dashboardSource).toContain('selectedSystem?.brand !== "COMPATEC" || selectedSystem.isActive === false');
  });

  it("inibe somente no Arme e mantém Toggle, partições e PGM bloqueados", () => {
    expect(dashboardSource).toContain("A inibição AK2→AK1 será enviada antes de AK4[4]");
    expect(dashboardSource).toContain("Inibir/Restaurar Zona transmite AK2→AK1");
    expect(dashboardSource).toContain("Arme Stay/partição continua bloqueado até homologação Compatec");
    expect(dashboardSource).toContain("AK4[9–11] são toggle; não serão enviados");
  });
});

describe("Identificação do usuário nos eventos 701", () => {
  it("não transforma o argumento 000 em Usuário 0", () => {
    expect(dashboardSource).toContain('event.eventCode === "701"');
    expect(dashboardSource).toContain('Number(event.zoneUser || 0) === 0');
    expect(dashboardSource).toContain("Usuário do painel: não informado");
  });

  it("usa a mesma indicação na fila, no atendimento e nos dados do sistema", () => {
    expect(dashboardSource).toContain("panelUserDisplayText");
    expect(dashboardSource).toContain("getPanelUserDisplayText(selectedEvent, selectedPanelUser)");
    expect(dashboardSource).toContain("selectedEventArgument");
  });
});
