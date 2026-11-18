import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./Dashboard.tsx", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("../../../server/routers.ts", import.meta.url), "utf8");
const zonePanelSource = readFileSync(new URL("../components/CompatecZoneConfigurationPanel.tsx", import.meta.url), "utf8");

describe("indicadores operacionais do Dashboard", () => {
  it("mantém as listas pesquisáveis por conta, cliente, fantasia ou parceira", () => {
    for (const label of ["Armados", "Desarmados", "Online", "Offline", "Bloqueados"]) {
      expect(source).toContain(label);
    }
    expect(source).toContain('placeholder="Buscar por conta, cliente, fantasia ou parceira..."');
    expect(source).toContain("matchesOperationalStatusSearch");
    expect(source).toContain("partnersById.get(client?.partnerCompanyId)?.name");
    expect(source).toContain("partnersById.get(clientsById.get(item.clientId)?.partnerCompanyId)?.name");
    expect(source).toContain('armDisarmModal === "armed" ? armDisarmData?.armed || [] : armDisarmData?.disarmed || []');
    expect(source).toContain('system.connectionStatus === "online"');
    expect(source).toContain('system.connectionStatus === "offline"');
  });

  it("mostra os dados administrativos da suspensão sem descartar a identidade do cliente", () => {
    expect(source).toContain("Clientes Bloqueados / Suspensos");
    expect(source).toContain("monitoringStatusReason");
    expect(source).toContain("monitoringStatusUntil");
  });

  it("permite solicitar Arme e Desarme sem ocorrência com operador automático e descrição/motivo", () => {
    expect(source).toContain("Armar");
    expect(source).toContain("Desarmar");
    expect(source).toContain("openStandaloneCommandRequest");
    expect(source).toContain("submitStandaloneCommandRequest");
    expect(source).not.toContain("Solicitado por");
    expect(source).not.toContain("Autorizado por");
    expect(routerSource).toContain("operatorId: ctx.user.id");
    expect(routerSource).toContain('ctx.user.name || "Operador autenticado"');
    expect(source).toContain("const auditReason = reason;");
    expect(source).toContain("o operador autenticado e a descrição/motivo ficarão no histórico do comando");
    expect(source).toContain("Descrição / motivo");
    expect(source).toContain("isStandalonePhysicalCommandSupported");
    expect(source).toContain("ARMAR");
    expect(source).toContain("DESARMAR");
  });

  it("coloca Arme/Desarme total e alterações multi-setoriais no mesmo modal standalone Compatec", () => {
    const modal = source.slice(source.indexOf("{standaloneRemoteRequest && ("), source.indexOf("{/* TOP BAR - Botões de Status */}"));
    expect(modal).toContain("Arme/Desarme total");
    expect(modal).toContain(">Setores</Button>");
    expect(modal).toContain("standaloneRemoteMode === \"zones\"");
    expect(modal).toContain("<CompatecZoneConfigurationPanel");
    expect(modal).toContain("reasonValue={standaloneRemoteReason}");
    expect(modal).toContain("onReasonValueChange={setStandaloneRemoteReason}");
    expect(modal).toContain("submitStandaloneCommandRequest");
    expect(modal).toContain("A solicitação não cria evento Contact ID nem cartão na fila");
    expect(zonePanelSource).toContain("configureCompatecZonesStandalone");
    expect(routerSource).toContain("configureCompatecZonesStandalone: operatorProcedure");
  });
});
