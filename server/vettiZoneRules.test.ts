import { describe, expect, it } from "vitest";
import { canRestoreVettiZone, isVetti24HourZone } from "@shared/vettiZoneRules";

describe("regra operacional de zonas Vetti", () => {
  it("reconhece zona 24 horas como a única que exige restauro explícito", () => {
    expect(isVetti24HourZone({ zoneNumber: 1, type: "24h" })).toBe(true);
    expect(canRestoreVettiZone({ zoneNumber: 1, type: "24h" })).toBe(true);
  });

  it("não oferece restauro manual para zonas comuns, que retornam no Desarme", () => {
    expect(canRestoreVettiZone({ zoneNumber: 1, type: "perimeter" })).toBe(false);
    expect(canRestoreVettiZone({ zoneNumber: 2, type: "internal" })).toBe(false);
    expect(canRestoreVettiZone({ zoneNumber: 3, type: "panic" })).toBe(false);
    expect(canRestoreVettiZone(null)).toBe(false);
  });
});
