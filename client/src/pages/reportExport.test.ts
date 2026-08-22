import { describe, expect, it } from "vitest";
import { buildOccurrenceReportCsv, formatReportDuration } from "./reportExport";

describe("exportação de relatórios", () => {
  it("gera CSV compatível com Excel, incluindo a finalização e o operador", () => {
    const csv = buildOccurrenceReportCsv([{
      finalizedAt: "2026-08-22T12:30:00.000Z",
      account: "0044",
      clientName: "Por do Sol Floricultura",
      qualifier: "E",
      eventCode: "407",
      description: "Desarme remoto",
      observations: "Cliente confirmou \"teste\"",
      attendingTimeMs: 125000,
      operatorName: "Patrícia",
    }]);

    expect(csv).toContain("\uFEFF\"Data/Hora\";\"Conta\"");
    expect(csv).toContain("\"0044\";\"Por do Sol Floricultura\";\"E407\"");
    expect(csv).toContain("\"Cliente confirmou \"\"teste\"\"\"");
    expect(csv).toContain("\"Patrícia\"");
  });

  it("formata o tempo de atendimento de forma legível", () => {
    expect(formatReportDuration(125000)).toBe("2min 5s");
    expect(formatReportDuration(null)).toBe("-");
  });
});
