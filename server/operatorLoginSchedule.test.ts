import { describe, expect, it } from "vitest";
import { getUserLoginScheduleStatus } from "./operatorShiftSchedule";
import { getShiftWindowFor } from "@shared/operatorShift";

const db = (hasAssignment: boolean) => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => hasAssignment ? [{ id: 1 }] : [] }) }) }) });

describe("auditoria do dia e horário no login", () => {
  it("não confunde janela antecipada dos lembretes com horário previsto de trabalho", async () => {
    const window = getShiftWindowFor("2026-11-04", "first");
    expect(await getUserLoginScheduleStatus(db(true), 1, new Date("2026-11-04T09:50:00Z"), window)).toBe("outside_window");
    expect(await getUserLoginScheduleStatus(db(true), 1, window.startAt, window)).toBe("scheduled");
    expect(await getUserLoginScheduleStatus(db(true), 1, window.endAt, window)).toBe("outside_window");
  });

  it("mantém o terceiro turno ancorado ao dia anterior após meia-noite", async () => {
    const window = getShiftWindowFor("2026-11-04", "third");
    expect(await getUserLoginScheduleStatus(db(true), 1, new Date("2026-11-05T05:00:00Z"), window)).toBe("scheduled");
  });

  it("exige motivo quando há escala mas é folga, incluindo Comercial no fim de semana", async () => {
    expect(await getUserLoginScheduleStatus(db(true), 1, new Date("2026-11-07T15:00:00Z"), null)).toBe("outside_window");
  });

  it("não acusa falta nem obriga motivo fictício quando não há escala vigente cadastrada", async () => {
    expect(await getUserLoginScheduleStatus(db(false), 1, new Date("2026-11-07T15:00:00Z"), null)).toBeNull();
  });
});
