import { describe, expect, it } from "vitest";
import { canBulkFinalizeIncident, getBulkFinalizationFeedback } from "../shared/incidentBulkFinalization";

describe("elegibilidade e retorno de finalização em massa", () => {
  it.each(["waiting", "attending", "observing"] as const)("permite o registro raiz automático %s sem operador", status => {
    expect(canBulkFinalizeIncident({ status, operatorId: null }, 7)).toBe(true);
    expect(canBulkFinalizeIncident({ status, operatorId: 7 }, 7)).toBe(true);
    expect(canBulkFinalizeIncident({ status, operatorId: 8 }, 7)).toBe(false);
  });
  it("preserva manutenção, despacho órfão e filhos sem dono; permite finalizar o próprio filho", () => {
    expect(canBulkFinalizeIncident({ status: "maintenance", operatorId: 7 }, 7)).toBe(false);
    expect(canBulkFinalizeIncident({ status: "closed", operatorId: 7 }, 7)).toBe(false);
    expect(canBulkFinalizeIncident({ status: "dispatched", operatorId: null }, 7)).toBe(false);
    expect(canBulkFinalizeIncident({ status: "observing", operatorId: null, parentIncidentId: 1 }, 7)).toBe(false);
    expect(canBulkFinalizeIncident({ status: "attending", operatorId: 7, parentIncidentId: 1 }, 7)).toBe(true);
  });
  it("não anuncia sucesso quando nenhum registro foi encerrado", () => {
    expect(getBulkFinalizationFeedback({ count: 0, skippedCount: 10 }, "0041")).toMatchObject({ type: "info", message: expect.stringContaining("Nenhum evento foi finalizado") });
  });
  it("informa explicitamente fechamento parcial e registros protegidos", () => {
    expect(getBulkFinalizationFeedback({ count: 2, skippedCount: 3 }, "0334")).toMatchObject({ type: "warning", message: expect.stringContaining("3 registro(s) protegido(s) permanecem") });
    expect(getBulkFinalizationFeedback({ count: 2, skippedCount: 0 }, "0334").type).toBe("success");
  });
});
