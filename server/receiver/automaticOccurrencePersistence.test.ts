import { describe, expect, it } from "vitest";
import { enrichOccurrenceReportClients } from "../occurrenceReportEnrichment";
import { persistAutomaticOccurrence } from "./automaticOccurrencePersistence";

describe("persistência integrada de relatório automático", () => {
  it("simula evento identificado, persiste a occurrence e a lista com o cliente correto", async () => {
    const stored: Array<Record<string, unknown>> = [];
    const persisted = await persistAutomaticOccurrence({
      occurrence: {
        account: "0336", eventCode: "401", qualifier: "E", description: "Desarme", priority: "medium", brand: "VETTI",
        operatorName: "Sistema", observations: "Finalizada automaticamente", logs: "[]", attendingTimeMs: 0, eventReceivedAt: new Date("2026-08-13T18:00:00.000Z"),
      },
      system: { id: 18, clientId: 32 },
      client: { id: 32, name: "Cliente Vetti", partnerCompanyId: 5 },
      create: async (row) => { stored.push({ id: 101, ...row }); },
    });

    expect(stored).toHaveLength(1);
    expect(persisted).toMatchObject({ systemId: 18, clientId: 32, clientName: "Cliente Vetti", partnerCompanyId: 5 });
    const reportRows = enrichOccurrenceReportClients(stored, [{ id: 18, clientId: 32 }], [{ id: 32, name: "Cliente Vetti", partnerCompanyId: 5 }]);
    expect(reportRows[0]).toMatchObject({ id: 101, account: "0336", clientId: 32, clientName: "Cliente Vetti", partnerCompanyId: 5 });
  });
});
