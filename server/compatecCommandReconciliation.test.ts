import { describe, expect, it } from "vitest";
import { COMPATEC_IN_FLIGHT_GRACE_MS, getCompatecReconciliationOptions, getCompatecReconciledStatus, getCompatecReconciliationOutcomeLabel, getManualCompatecApplicationEventBaseline, isCompatecCommandInFlight, isCompatecReconciliationOutcomeAllowed } from "../shared/compatecCommandReconciliation";

describe("conferência manual Compatec", () => {
  it("oferece estado parcial apenas para configuração de setores", () => {
    expect(getCompatecReconciliationOptions("configure_zones").map((item) => item.value)).toEqual(["applied", "not_applied", "partial"]);
    expect(getCompatecReconciliationOptions("configure_zones", true).map((item) => item.value)).toEqual(["partial", "verified"]);
    expect(isCompatecReconciliationOutcomeAllowed("configure_zones", "partial")).toBe(true);
    expect(isCompatecReconciliationOutcomeAllowed("arm", "partial")).toBe(false);
    expect(getCompatecReconciledStatus("configure_zones", "partial")).toBe("dispatch_unknown");
    expect(getCompatecReconciledStatus("arm", "applied")).toBe("dispatch_unknown");
    expect(getCompatecReconciledStatus("configure_zones", "verified")).toBe("reconciled");
    expect(getCompatecReconciledStatus("arm", "not_applied")).toBe("cancelled");
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

  it("lê somente um ID inteiro válido do evento-base da conferência manual", () => {
    expect(getManualCompatecApplicationEventBaseline("[EVENTO DE ESTADO BASE DA CONFERÊNCIA MANUAL: #81]")).toBe(81);
    expect(getManualCompatecApplicationEventBaseline("[EVENTO DE ESTADO BASE DA CONFERÊNCIA MANUAL: #1.5]")).toBeNull();
    expect(getManualCompatecApplicationEventBaseline("[EVENTO DE ESTADO BASE DA CONFERÊNCIA MANUAL: #-1]")).toBeNull();
    expect(getManualCompatecApplicationEventBaseline("sem marcador")).toBeNull();
  });
});

describe("janela de transmissão em andamento Compatec", () => {
  const referenceTime = new Date("2026-11-27T12:00:00.000Z");
  const at = (secondsAgo: number) => ({ updatedAt: new Date(referenceTime.getTime() - secondsAgo * 1000) });

  it("bloqueia somente enquanto o comando está realmente em transmissão", () => {
    expect(isCompatecCommandInFlight({ status: "queued", ...at(59) }, referenceTime)).toBe(true);
    expect(isCompatecCommandInFlight({ status: "queued", ...at(61) }, referenceTime)).toBe(false);
    expect(isCompatecCommandInFlight({ status: "waiting_connection", ...at(14) }, referenceTime)).toBe(true);
    expect(isCompatecCommandInFlight({ status: "waiting_connection", ...at(16) }, referenceTime)).toBe(false);
    expect(isCompatecCommandInFlight({ status: "prepared", ...at(59) }, referenceTime)).toBe(true);
    expect(isCompatecCommandInFlight({ status: "prepared", ...at(61) }, referenceTime)).toBe(false);
    expect(isCompatecCommandInFlight({ status: "dispatching", ...at(59) }, referenceTime)).toBe(true);
    expect(isCompatecCommandInFlight({ status: "dispatching", ...at(61) }, referenceTime)).toBe(false);
    expect(isCompatecCommandInFlight({ status: "sent", ...at(29) }, referenceTime)).toBe(true);
    expect(isCompatecCommandInFlight({ status: "sent", ...at(31) }, referenceTime)).toBe(false);
  });

  it("nunca bloqueia falha, cancelamento ou resultado indeterminado, mesmo recém-registrado", () => {
    for (const status of ["failed", "cancelled", "dispatch_unknown", "reconciled", "simulated"]) {
      expect(isCompatecCommandInFlight({ status, ...at(1) }, referenceTime)).toBe(false);
    }
    expect(Object.keys(COMPATEC_IN_FLIGHT_GRACE_MS).sort()).toEqual(["dispatching", "prepared", "queued", "sent", "waiting_connection"]);
  });
});
