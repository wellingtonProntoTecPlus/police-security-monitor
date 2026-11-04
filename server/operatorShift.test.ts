import { describe, expect, it } from "vitest";
import {
  addCalendarDays, getCurrentShiftWindow, getNextShiftWindow, getShiftReminderDueMinutes,
  getShiftWindowFor, getCurrentShiftWindows, getShiftAfter, isScheduledShiftDate, localDateKey, resolveOperatorShift,
} from "@shared/operatorShift";

const schedule = { shiftCode: "first" as const, cycleAnchorDate: "2026-11-01", effectiveFromDate: "2026-11-01" };

describe("escala operacional dia sim/dia não", () => {
  it("alterna pela data-âncora e não muda a paridade quando edita a escala", () => {
    expect(isScheduledShiftDate(schedule, "2026-11-01")).toBe(true);
    expect(isScheduledShiftDate(schedule, "2026-11-02")).toBe(false);
    expect(isScheduledShiftDate(schedule, "2026-11-03")).toBe(true);
    expect(isScheduledShiftDate(schedule, "2026-10-31")).toBe(false);
  });

  it("só aplica a regra base a partir da vigência e limita vigência encerrada", () => {
    expect(isScheduledShiftDate({ ...schedule, effectiveFromDate: "2026-11-04", effectiveUntilDate: "2026-11-08" }, "2026-11-03")).toBe(false);
    expect(isScheduledShiftDate({ ...schedule, effectiveFromDate: "2026-11-04", effectiveUntilDate: "2026-11-08" }, "2026-11-09")).toBe(false);
  });

  it("uma exceção pontual substitui escala sem alterar regra permanente", () => {
    expect(resolveOperatorShift({ workDate: "2026-11-02", schedule, exception: { kind: "work", shiftCode: "third" } })).toBe("third");
    expect(resolveOperatorShift({ workDate: "2026-11-01", schedule, exception: { kind: "off", shiftCode: null } })).toBeNull();
  });

  it("trata o terceiro turno cruzando meia-noite e calcula a sequência dos próximos turnos", () => {
    const night = getShiftWindowFor("2026-11-04", "third");
    expect(night.startAt.toISOString()).toBe("2026-11-04T22:00:00.000Z");
    expect(night.endAt.toISOString()).toBe("2026-11-05T10:00:00.000Z");
    expect(getCurrentShiftWindow(new Date("2026-11-05T09:30:00.000Z")).workDate).toBe("2026-11-04");
    expect(getNextShiftWindow(new Date("2026-11-05T09:30:00.000Z")).shiftCode).toBe("first");
  });

  it("mapeia horários civis de São Paulo e aviso nos intervalos de 40/20 minutos", () => {
    expect(localDateKey(new Date("2026-11-05T10:00:00.000Z"))).toBe("2026-11-05");
    const first = getCurrentShiftWindow(new Date("2026-11-04T10:00:00.000Z"));
    expect(first.endAt.toISOString()).toBe("2026-11-04T16:00:00.000Z");
    expect(getShiftReminderDueMinutes(new Date(first.endAt.getTime() - 40 * 60_000 + 1), first.endAt)).toBe(40);
    expect(getShiftReminderDueMinutes(new Date(first.endAt.getTime() - 20 * 60_000 + 1), first.endAt)).toBe(20);
    expect(getShiftReminderDueMinutes(new Date(first.endAt), first.endAt)).toBeNull();
  });

  it("valida a aritmética de datas sem depender do fuso do processo", () => {
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(() => addCalendarDays("2026-02-30", 1)).toThrow("Data operacional inválida");
  });

  it("escala Comercial ocorre de segunda a sexta às 08h–18h, sem usar a âncora alternada", () => {
    const commercial = { shiftCode: "commercial" as const, cycleAnchorDate: "2026-11-04", effectiveFromDate: "2026-11-01" };
    expect(isScheduledShiftDate(commercial, "2026-11-02")).toBe(true); // segunda
    expect(isScheduledShiftDate(commercial, "2026-11-06")).toBe(true); // sexta
    expect(isScheduledShiftDate(commercial, "2026-11-07")).toBe(false); // sábado
    expect(isScheduledShiftDate(commercial, "2026-11-08")).toBe(false); // domingo
    const window = getShiftWindowFor("2026-11-02", "commercial");
    expect(window.startAt.toISOString()).toBe("2026-11-02T11:00:00.000Z");
    expect(window.endAt.toISOString()).toBe("2026-11-02T21:00:00.000Z");
    expect(getShiftAfter("2026-11-02", "commercial").shiftCode).toBe("second");
  });

  it("mostra Comercial junto do turno regular apenas durante o expediente de dias úteis", () => {
    expect(getCurrentShiftWindows(new Date("2026-11-04T11:30:00.000Z")).map((window) => window.shiftCode)).toEqual(["first", "commercial"]);
    expect(getCurrentShiftWindows(new Date("2026-11-07T11:30:00.000Z")).map((window) => window.shiftCode)).toEqual(["first"]);
    expect(getCurrentShiftWindows(new Date("2026-11-04T21:00:00.000Z")).map((window) => window.shiftCode)).toEqual(["second"]);
  });
});
