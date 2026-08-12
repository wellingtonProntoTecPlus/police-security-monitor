import { describe, expect, it } from "vitest";
import { canCloseIncidentAfterReport } from "./occurrenceClosureContract";

describe("contrato de transferência da fila ao relatório", () => {
  it("fecha o incidente somente após o relatório receber ID persistido", () => {
    expect(canCloseIncidentAfterReport(55)).toBe(true);
  });

  it("mantém o incidente aberto se o relatório não foi gravado", () => {
    expect(canCloseIncidentAfterReport(undefined)).toBe(false);
    expect(canCloseIncidentAfterReport(0)).toBe(false);
  });
});
