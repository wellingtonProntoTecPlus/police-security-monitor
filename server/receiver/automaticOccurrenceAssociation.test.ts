import { describe, expect, it } from "vitest";
import { getAutomaticOccurrenceAssociation } from "./automaticOccurrenceAssociation";

describe("vínculo de relatório automático", () => {
  it("preenche cliente, parceira e sistema quando o painel foi identificado", () => {
    expect(getAutomaticOccurrenceAssociation(
      { id: 18, clientId: 32 },
      { id: 32, name: "Razão Social", fantasyName: "Cliente Monitorado", partnerCompanyId: 5 },
    )).toEqual({ systemId: 18, clientId: 32, clientName: "Cliente Monitorado", partnerCompanyId: 5 });
  });

  it("mantém o relatório técnico sem cliente quando o painel não foi identificado", () => {
    expect(getAutomaticOccurrenceAssociation(undefined, undefined)).toEqual({
      systemId: null,
      clientId: null,
      clientName: null,
      partnerCompanyId: null,
    });
  });
});
