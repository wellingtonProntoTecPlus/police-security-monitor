import { describe, expect, it } from "vitest";
import { enrichOccurrenceReportClients, filterOccurrenceReportRowsByPartner } from "./occurrenceReportEnrichment";

describe("enriquecimento do relatório de ocorrências", () => {
  it("resolve o cliente pelo sistema para registros automáticos antigos", () => {
    const rows = enrichOccurrenceReportClients([
      { id: 44, account: "0336", systemId: 18, clientId: null, clientName: null, partnerCompanyId: null },
    ], [{ id: 18, clientId: 32 }], [{ id: 32, name: "Razão Social", fantasyName: "Cliente Vetti", partnerCompanyId: 5 }]);

    expect(rows[0]).toMatchObject({
      id: 44,
      account: "0336",
      systemId: 18,
      clientId: 32,
      clientName: "Cliente Vetti",
      partnerCompanyId: 5,
    });
  });

  it("preserva o nome já gravado no relatório", () => {
    const rows = enrichOccurrenceReportClients([
      { id: 45, systemId: 18, clientId: 32, clientName: "Nome no histórico", partnerCompanyId: 5 },
    ], [{ id: 18, clientId: 32 }], [{ id: 32, name: "Razão Social", fantasyName: "Cliente Vetti", partnerCompanyId: 5 }]);

    expect(rows[0].clientName).toBe("Nome no histórico");
  });

  it("mantém registros legados no escopo da parceira depois do enriquecimento", () => {
    const enriched = enrichOccurrenceReportClients([
      { id: 46, account: "0334", systemId: 19, clientId: null, clientName: null, partnerCompanyId: null },
      { id: 47, account: "0999", systemId: 20, clientId: null, clientName: null, partnerCompanyId: null },
    ], [{ id: 19, clientId: 33 }, { id: 20, clientId: 34 }], [
      { id: 33, name: "Cliente Parceira A", partnerCompanyId: 5 },
      { id: 34, name: "Cliente Parceira B", partnerCompanyId: 6 },
    ]);

    expect(filterOccurrenceReportRowsByPartner(enriched, 5)).toHaveLength(1);
    expect(filterOccurrenceReportRowsByPartner(enriched, 5)[0]).toMatchObject({ id: 46, clientName: "Cliente Parceira A" });
  });
});
