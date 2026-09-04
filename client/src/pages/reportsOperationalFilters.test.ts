import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/Reports.tsx"), "utf8");

describe("Relatórios operacionais", () => {
  it("oferece períodos rápidos, período personalizado e filtros de evento", () => {
    expect(source).toContain('label: "Hoje"');
    expect(source).toContain('label: "Ontem"');
    expect(source).toContain('label: "Esta semana"');
    expect(source).toContain('label: "Este mês"');
    expect(source).toContain('label: "Personalizado"');
    expect(source).toContain('label: "Disparos e alarmes"');
    expect(source).toContain('label: "Arme"');
    expect(source).toContain('label: "Desarme"');
  });

  it("oferece filtros de parceira, cliente e consulta atual de Online e Offline", () => {
    expect(source).toContain("Empresa parceira");
    expect(source).toContain("Todos os clientes");
    expect(source).toContain("Online e Offline");
    expect(source).toContain("Somente Online");
    expect(source).toContain("Somente Offline");
    expect(source).toContain("Exportar CSV");
  });

  it("limita relatórios sem filtros a 100 e preserva até 1000 com filtros aplicados", () => {
    expect(source).toContain("const DEFAULT_REPORT_LIMIT = 100");
    expect(source).toContain("const FILTERED_REPORT_LIMIT = 1000");
    expect(source).toContain("const reportLimit = hasAppliedFilters ? FILTERED_REPORT_LIMIT : DEFAULT_REPORT_LIMIT");
    expect(source).toContain("limit: reportLimit");
    expect(source).toContain("Sem filtros: exibindo os {DEFAULT_REPORT_LIMIT} registros mais recentes.");
  });
});
