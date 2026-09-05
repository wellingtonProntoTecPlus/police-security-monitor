import { describe, expect, it } from "vitest";
import { getLatestArmDisarmStatusBySystem } from "./armDisarmStatus";

describe("status operacional de arme e desarme", () => {
  it("usa a conta cadastrada do sistema para normalizar evento Vetti legado", () => {
    const statuses = getLatestArmDisarmStatusBySystem([
      { account: "0A03", qualifier: "R", receivedAt: new Date("2026-08-13T12:46:16.000Z"), alarmSystemId: 7 },
    ], [{ id: 7, account: "0336" }]);

    expect(statuses).toEqual([{
      account: "0336",
      qualifier: "R",
      receivedAt: new Date("2026-08-13T12:46:16.000Z"),
      alarmSystemId: 7,
    }]);
  });

  it("mantém somente o evento mais recente de cada sistema e não mistura contas repetidas", () => {
    const statuses = getLatestArmDisarmStatusBySystem([
      { account: "0A03", qualifier: "E", receivedAt: new Date("2026-08-13T12:50:00.000Z"), alarmSystemId: 7 },
      { account: "0336", qualifier: "R", receivedAt: new Date("2026-08-13T12:40:00.000Z"), alarmSystemId: 7 },
      { account: "0336", qualifier: "R", receivedAt: new Date("2026-08-13T12:45:00.000Z"), alarmSystemId: 8 },
    ], [{ id: 7, account: "0336" }, { id: 8, account: "0336" }]);

    expect(statuses).toEqual([
      { account: "0336", qualifier: "E", receivedAt: new Date("2026-08-13T12:50:00.000Z"), alarmSystemId: 7 },
      { account: "0336", qualifier: "R", receivedAt: new Date("2026-08-13T12:45:00.000Z"), alarmSystemId: 8 },
    ]);
  });

  it("não mantém estado operacional para sistema inativo", () => {
    const statuses = getLatestArmDisarmStatusBySystem([
      { account: "0022", qualifier: "R", receivedAt: new Date("2026-09-05T20:00:00.000Z"), alarmSystemId: 54 },
      { account: "0029", qualifier: "E", receivedAt: new Date("2026-09-05T20:01:00.000Z"), alarmSystemId: 55 },
    ], [
      { id: 54, account: "0022", isActive: false },
      { id: 55, account: "0029", isActive: true },
    ]);

    expect(statuses).toEqual([{
      account: "0029",
      qualifier: "E",
      receivedAt: new Date("2026-09-05T20:01:00.000Z"),
      alarmSystemId: 55,
    }]);
  });
});
