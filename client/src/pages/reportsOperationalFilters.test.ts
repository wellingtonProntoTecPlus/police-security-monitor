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

  it("limita ocorrências sem filtros a 100 e preserva até 1000 com filtros aplicados", () => {
    expect(source).toContain("const DEFAULT_REPORT_LIMIT = 100");
    expect(source).toContain("const FILTERED_REPORT_LIMIT = 1000");
    expect(source).toContain("const reportLimit = hasAppliedFilters ? FILTERED_REPORT_LIMIT : DEFAULT_REPORT_LIMIT");
    expect(source).toContain("limit: reportLimit, offset: 0, ...appliedFilters");
  });

  it("abre em Eventos recebidos e mostra somente os 20 eventos mais recentes sem filtros", () => {
    expect(source).toContain('const [reportMode, setReportMode] = useState<ReportMode>("events")');
    expect(source).toContain("const DEFAULT_EVENT_REPORT_LIMIT = 20");
    expect(source).toContain("const eventReportLimit = hasAppliedFilters ? FILTERED_REPORT_LIMIT : DEFAULT_EVENT_REPORT_LIMIT");
    expect(source).toContain("limit: eventReportLimit, offset: 0, ...appliedFilters");
    expect(source).toContain('reportMode === "events" ? "eventos" : "registros"');
    expect(source).toContain("Use os filtros acima para refinar.");
  });

  it("não busca histórico de 1.000 ocorrências para preencher operadores nem consulta listas de abas ocultas", () => {
    expect(source).toContain("trpc.occurrence.operatorNames.useQuery()");
    expect(source).not.toContain("limit: 1000, offset: 0");
    expect(source).toContain("enabled: reportMode === \"occurrences\"");
  });

  it("inclui relatório histórico de alertas de agenda filtrável e exportável", () => {
    expect(source).toContain('type ReportMode = "occurrences" | "events" | "connections" | "schedule"');
    expect(source).toContain("trpc.alarmSchedule.report.useQuery");
    expect(source).toContain("Histórico de alertas da agenda");
    expect(source).toContain("Desarme fora da agenda");
    expect(source).toContain("Arme atrasado");
    expect(source).toContain("acknowledgedByName");
  });
});
