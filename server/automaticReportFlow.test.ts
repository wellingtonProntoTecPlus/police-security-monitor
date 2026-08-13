import { describe, expect, it } from "vitest";
import { getAutomaticOccurrenceAssociation } from "./receiver/automaticOccurrenceAssociation";
import { enrichOccurrenceReportClients } from "./occurrenceReportEnrichment";

describe("fluxo de relatório automático identificado", () => {
  it("leva o vínculo do painel identificado até a linha exibida no relatório", () => {
    const association = getAutomaticOccurrenceAssociation(
      { id: 18, clientId: 32 },
      { id: 32, name: "Cliente Vetti", partnerCompanyId: 5 },
    );
    const rows = enrichOccurrenceReportClients([
      { id: 100, account: "0336", eventCode: "401", ...association },
    ], [{ id: 18, clientId: 32 }], [{ id: 32, name: "Cliente Vetti", partnerCompanyId: 5 }]);

    expect(rows[0]).toMatchObject({
      account: "0336",
      eventCode: "401",
      systemId: 18,
      clientId: 32,
      clientName: "Cliente Vetti",
      partnerCompanyId: 5,
    });
  });
});
