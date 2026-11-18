import { describe, expect, it } from "vitest";
import { buildOccurrenceReportCsv, formatReportDuration, summarizeReportObservations } from "./reportExport";
import { buildRemoteCommandIncidentNotes, buildRemoteCommandRequestNote } from "../../../server/remoteCommandEventCorrelation";

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

  it("exporta resumo curto da auditoria remota sem KA/AK, frames, origem ou blocos repetidos", () => {
    const raw = [
      buildRemoteCommandRequestNote({ commandId: 109, commandType: "configure_zones", operatorName: "Wellington", reason: "Ativar interno", zoneChanges: [{ zoneNumber: 1, armState: "armed" }, { zoneNumber: 2, armState: "disarmed" }] }),
      buildRemoteCommandIncidentNotes({ commandId: 109, commandType: "configure_zones", commandLabel: "Configuração de setores via PoliceCentral", operatorName: "Wellington", reason: "Ativar interno", response: "MB=KA1", zoneChanges: [{ zoneNumber: 1, armState: "armed" }, { zoneNumber: 2, armState: "disarmed" }] }),
    ].join("\n");
    const shortObservations = summarizeReportObservations(raw);
    expect(shortObservations.split("\n")).toHaveLength(2);
    expect(shortObservations).toContain("Alteração de setores 1, 2");
    expect(shortObservations).toContain("Ativar interno");
    const csv = buildOccurrenceReportCsv([{ observations: shortObservations }]);
    expect(csv).toContain("Alteração de setores 1, 2");
    expect(csv).not.toMatch(/COMANDO REMOTO|PoliceCentral|KA1|AK2|Auditoria do comando|Quadros enviados/);
  });
});
