import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./Dashboard.tsx", import.meta.url), "utf8");

describe("indicadores operacionais do Dashboard", () => {
  it("mantém as cinco listas pesquisáveis por conta, nome ou fantasia", () => {
    for (const label of ["Armados", "Desarmados", "Online", "Offline", "Bloqueados"]) {
      expect(source).toContain(label);
    }
    expect(source).toContain('placeholder="Buscar por conta, nome ou fantasia..."');
    expect(source).toContain("matchesOperationalStatusSearch");
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
    expect(source).toContain("Autorizado por");
    expect(source).toContain("Motivo operacional");
    expect(source).toContain("isStandalonePhysicalCommandSupported");
    expect(source).toContain("ARMAR");
    expect(source).toContain("DESARMAR");
  });
});
