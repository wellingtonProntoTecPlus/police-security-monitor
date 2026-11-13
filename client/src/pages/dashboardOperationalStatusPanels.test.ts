import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./Dashboard.tsx", import.meta.url), "utf8");

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

  it("permite solicitar Arme e Desarme sem ocorrência com rastreabilidade obrigatória", () => {
    expect(source).toContain("Armar");
    expect(source).toContain("Desarmar");
    expect(source).toContain("openStandaloneCommandRequest");
    expect(source).toContain("submitStandaloneCommandRequest");
    expect(source).toContain("Solicitado por");
    expect(source).not.toContain("Autorizado por");
    expect(source).toContain("Operador autenticado: ${user?.name || \"Operador\"}");
    expect(source).toContain("Solicitado por: ${requester}; Motivo: ${reason}");
    expect(source).toContain("o operador autenticado, o solicitante e o motivo ficarão no histórico do comando");
    expect(source).toContain("Motivo operacional");
    expect(source).toContain("isStandalonePhysicalCommandSupported");
    expect(source).toContain("ARMAR");
    expect(source).toContain("DESARMAR");
  });
});
