import { describe, expect, it } from "vitest";
import { getLatestArmDisarmStatusBySystem, isArmDisarmStatusEvent } from "./armDisarmStatus";

describe("status operacional de arme e desarme", () => {
  it("usa a conta cadastrada do sistema para normalizar evento Vetti legado", () => {
    const statuses = getLatestArmDisarmStatusBySystem([
      { account: "0A03", brand: "VETTI", eventCode: "401", qualifier: "R", receivedAt: new Date("2026-08-13T12:46:16.000Z"), alarmSystemId: 7 },
    ], [{ id: 7, account: "0336" }]);

    expect(statuses).toEqual([{
      account: "0336",
      qualifier: "R",
      receivedAt: new Date("2026-08-13T12:46:16.000Z"),
      alarmSystemId: 7,
      brand: "VETTI",
      eventCode: "401",
      state: "armed",
    }]);
  });

  it("mantém somente o evento mais recente de cada sistema e não mistura contas repetidas", () => {
    const statuses = getLatestArmDisarmStatusBySystem([
      { account: "0A03", brand: "JFL", eventCode: "401", qualifier: "E", receivedAt: new Date("2026-08-13T12:50:00.000Z"), alarmSystemId: 7 },
      { account: "0336", brand: "JFL", eventCode: "401", qualifier: "R", receivedAt: new Date("2026-08-13T12:40:00.000Z"), alarmSystemId: 7 },
      { account: "0336", brand: "JFL", eventCode: "401", qualifier: "R", receivedAt: new Date("2026-08-13T12:45:00.000Z"), alarmSystemId: 8 },
    ], [{ id: 7, account: "0336" }, { id: 8, account: "0336" }]);

    expect(statuses).toEqual([
      { account: "0336", qualifier: "E", receivedAt: new Date("2026-08-13T12:50:00.000Z"), alarmSystemId: 7, brand: "JFL", eventCode: "401", state: "disarmed" },
      { account: "0336", qualifier: "R", receivedAt: new Date("2026-08-13T12:45:00.000Z"), alarmSystemId: 8, brand: "JFL", eventCode: "401", state: "armed" },
    ]);
  });

  it("não mantém estado operacional para sistema inativo", () => {
    const statuses = getLatestArmDisarmStatusBySystem([
      { account: "0022", brand: "JFL", eventCode: "401", qualifier: "R", receivedAt: new Date("2026-09-05T20:00:00.000Z"), alarmSystemId: 54 },
      { account: "0029", brand: "JFL", eventCode: "401", qualifier: "E", receivedAt: new Date("2026-09-05T20:01:00.000Z"), alarmSystemId: 55 },
    ], [
      { id: 54, account: "0022", isActive: false },
      { id: 55, account: "0029", isActive: true },
    ]);

    expect(statuses).toEqual([{
      account: "0029",
      qualifier: "E",
      receivedAt: new Date("2026-09-05T20:01:00.000Z"),
      alarmSystemId: 55,
      brand: "JFL",
      eventCode: "401",
      state: "disarmed",
    }]);
  });

  it("reconhece R701 somente quando o evento vem da Compatec", () => {
    expect(isArmDisarmStatusEvent({ brand: "COMPATEC", eventCode: "701", qualifier: "E" })).toBe(true);
    expect(isArmDisarmStatusEvent({ brand: "JFL", eventCode: "701", qualifier: "E" })).toBe(false);
    expect(isArmDisarmStatusEvent({ brand: "VETTI", eventCode: "401", qualifier: "R" })).toBe(true);
  });

  it("uses event state, not raw qualifier, for brand-specific arm events", () => {
    const statuses = getLatestArmDisarmStatusBySystem([
      { account: "0100", brand: "VETTI", eventCode: "3401", qualifier: "E", receivedAt: new Date("2026-10-31T20:00:00.000Z"), alarmSystemId: 99 },
    ], [{ id: 99, account: "0100" }]);
    expect(statuses[0]).toMatchObject({ state: "armed", qualifier: "E", eventCode: "3401" });
  });
});
