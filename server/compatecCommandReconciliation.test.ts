import { describe, expect, it } from "vitest";
import { getCompatecReconciliationOptions, getCompatecReconciliationOutcomeLabel, isCompatecReconciliationOutcomeAllowed } from "../shared/compatecCommandReconciliation";

describe("conferência manual Compatec", () => {
  it("oferece estado parcial apenas para configuração de setores", () => {
    expect(getCompatecReconciliationOptions("configure_zones").map((item) => item.value)).toEqual(["applied", "not_applied", "partial"]);
    expect(isCompatecReconciliationOutcomeAllowed("configure_zones", "partial")).toBe(true);
    expect(isCompatecReconciliationOutcomeAllowed("arm", "partial")).toBe(false);
  });

  it("limita comandos de consulta a resultado conferido ou conferência externa sem resposta", () => {
    expect(getCompatecReconciliationOptions("query_sectors").map((item) => item.value)).toEqual(["verified", "unavailable"]);
    expect(isCompatecReconciliationOutcomeAllowed("query_status", "applied")).toBe(false);
    expect(isCompatecReconciliationOutcomeAllowed("query_status", "verified")).toBe(true);
  });

  it("não oferece reconciliação a tipos fora da allowlist", () => {
    expect(isCompatecReconciliationOutcomeAllowed("activate_pgm", "applied")).toBe(false);
    expect(getCompatecReconciliationOutcomeLabel("arm", "applied")).toContain("confirmada na central");
  });
});
