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
});
