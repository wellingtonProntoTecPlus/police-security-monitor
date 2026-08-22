import { describe, expect, it } from "vitest";
import { matchesOperationalEventGroup, resolveOperationalEventCategory } from "./operationalEventReport";

describe("filtros operacionais de eventos", () => {
  const codes = [
    { code: "130", qualifier: "E", fabricante: "JFL", category: "alarm" },
    { code: "401", qualifier: "E", fabricante: "UNIVERSAL", isUniversal: true, category: "arm_disarm" },
    { code: "401", qualifier: "R", fabricante: "UNIVERSAL", isUniversal: true, category: "arm_disarm" },
    { code: "602", qualifier: "E", fabricante: "UNIVERSAL", isUniversal: true, category: "test" },
    { code: "1721", qualifier: "E", fabricante: "JFL", category: "analytics" },
  ];

  it("classifica disparos, analíticos, arme, desarme e teste pela tabela Contact ID", () => {
    expect(resolveOperationalEventCategory({ eventCode: "130", qualifier: "E", brand: "JFL" }, codes)).toBe("alarm");
    expect(resolveOperationalEventCategory({ eventCode: "1721", qualifier: "E", brand: "JFL" }, codes)).toBe("analytics");
    expect(resolveOperationalEventCategory({ eventCode: "401", qualifier: "R", brand: "VETTI" }, codes)).toBe("arm_disarm");
    expect(resolveOperationalEventCategory({ eventCode: "602", qualifier: "E", brand: "JFL" }, codes)).toBe("test");
  });

  it("separa arme de desarme e mantém disparos analíticos no grupo de alarmes", () => {
    expect(matchesOperationalEventGroup({ eventCode: "401", qualifier: "R" }, "arm_disarm", "arm")).toBe(true);
    expect(matchesOperationalEventGroup({ eventCode: "401", qualifier: "E" }, "arm_disarm", "disarm")).toBe(true);
    expect(matchesOperationalEventGroup({ eventCode: "1721", qualifier: "E" }, "analytics", "alarm")).toBe(true);
    expect(matchesOperationalEventGroup({ eventCode: "602", qualifier: "E" }, "test", "alarm")).toBe(false);
  });
});
