import { describe, expect, it } from "vitest";
import { getOperationalDateKey, getScheduleOverrideWindow } from "./alarmScheduleOverrideWindow";

describe("janela de exceção operacional", () => {
  it("limita suspensão de uma hora ao instante de início e ao dia solicitado", () => {
    const now = new Date("2026-11-01T15:30:00.000Z");
    const window = getScheduleOverrideWindow({ overrideDate: "2026-11-01", duration: "hour", now });
    expect(window.validFromAt).toEqual(now);
    expect(window.validUntilAt.getTime() - now.getTime()).toBe(60 * 60_000);
    expect(() => getScheduleOverrideWindow({ overrideDate: "2026-10-31", duration: "hour", now })).toThrow("deve começar hoje");
  });

  it("cobre exatamente um dia ou sete dias locais sem depender do horário UTC", () => {
    const now = new Date("2026-11-01T15:30:00.000Z");
    const day = getScheduleOverrideWindow({ overrideDate: "2026-11-01", duration: "day", now });
    const week = getScheduleOverrideWindow({ overrideDate: "2026-11-01", duration: "week", now });
    expect(getOperationalDateKey(day.validFromAt)).toBe("2026-11-01");
    expect(day.validUntilAt.getTime() - day.validFromAt.getTime()).toBe(24 * 60 * 60_000);
    expect(week.validUntilAt.getTime() - week.validFromAt.getTime()).toBe(7 * 24 * 60 * 60_000);
    expect(week.endDate).toBe("2026-11-07");
  });
});
