import { describe, expect, it } from "vitest";
import { getEffectiveClientMonitoringStatus, isClientMonitoringBlocked } from "./clientMonitoringStatus";

describe("situação operacional de monitoramento do cliente", () => {
  const now = new Date("2026-10-29T12:00:00.000Z");

  it("mantém bloqueio por inadimplência até que seja alterado manualmente", () => {
    expect(getEffectiveClientMonitoringStatus({ monitoringStatus: "blocked" }, now)).toBe("blocked");
    expect(isClientMonitoringBlocked({ monitoringStatus: "blocked" }, now)).toBe(true);
  });

  it("considera suspenso somente durante o prazo configurado", () => {
    expect(getEffectiveClientMonitoringStatus({ monitoringStatus: "suspended", monitoringStatusUntil: "2026-10-30T12:00:00.000Z" }, now)).toBe("suspended");
    expect(getEffectiveClientMonitoringStatus({ monitoringStatus: "suspended", monitoringStatusUntil: "2026-10-28T12:00:00.000Z" }, now)).toBe("active");
  });
});
