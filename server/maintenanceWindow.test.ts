import { describe, expect, it } from "vitest";
import { isSystemInMaintenance } from "./db";

describe("janela de manutenção do sistema", () => {
  const start = new Date("2026-08-12T12:00:00.000Z");
  const end = new Date("2026-08-12T14:00:00.000Z");

  it("considera ativo somente dentro do período programado", () => {
    const system = { maintenanceStartAt: start, maintenanceEndAt: end };

    expect(isSystemInMaintenance(system, new Date("2026-08-12T11:59:59.000Z"))).toBe(false);
    expect(isSystemInMaintenance(system, new Date("2026-08-12T12:00:00.000Z"))).toBe(true);
    expect(isSystemInMaintenance(system, new Date("2026-08-12T13:00:00.000Z"))).toBe(true);
    expect(isSystemInMaintenance(system, new Date("2026-08-12T14:00:00.000Z"))).toBe(false);
  });

  it("não ativa manutenção quando a programação está incompleta", () => {
    expect(isSystemInMaintenance({ maintenanceStartAt: start, maintenanceEndAt: null }, new Date("2026-08-12T13:00:00.000Z"))).toBe(false);
    expect(isSystemInMaintenance(null, new Date("2026-08-12T13:00:00.000Z"))).toBe(false);
  });
});
