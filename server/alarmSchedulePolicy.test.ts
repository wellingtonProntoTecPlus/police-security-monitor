import { describe, expect, it } from "vitest";
import {
  classifyContactIdOperationalEvent,
  evaluateAlarmSchedule,
  getAlarmScheduleEventAction,
  type AlarmSchedule,
  type ContactIdOperationalEvent,
} from "./alarmSchedulePolicy";

const local = (value: string) => new Date(`${value}-03:00`);

function classify(event: Partial<ContactIdOperationalEvent>) {
  return classifyContactIdOperationalEvent(event as ContactIdOperationalEvent);
}

describe("classificação operacional Contact ID", () => {
  it.each([
    ["401", "E", undefined, "disarm", "disarmed"],
    ["401", "R", undefined, "arm", "armed"],
    ["407", "E", undefined, "disarm", "disarmed"],
    ["407", "R", undefined, "arm", "armed"],
    ["408", "R", undefined, "arm", "armed"],
    ["409", "E", undefined, "disarm", "disarmed"],
    ["409", "R", undefined, "arm", "armed"],
    ["441", "R", undefined, "arm", "armed"],
    ["701", "E", "Compatec", "disarm", "disarmed"],
    ["701", "R", "COMPATEC", "arm", "armed"],
    ["3401", "E", "Vetti", "arm", "armed"],
    ["3403", "E", "VETTI", "arm", "armed"],
    ["3407", "E", "VETTI", "arm", "armed"],
    ["3441", "E", "VETTI", "arm", "armed"],
    ["456", "E", "Radioenge", "disarm", "disarmed"],
    ["456", "R", "RADIOENGE", "arm", "armed"],
  ] as const)("reconhece %s%s com a marca e o estado corretos", (code, qualifier, brand, kind, state) => {
    const result = classify({ eventCode: code, qualifier, brand });
    expect(result.kind).toBe(kind);
    expect(result.state).toBe(state);
  });

  it("preserva Stay como arme operacional, inclusive no Vetti 3441 e no Radioenge 456", () => {
    expect(classify({ eventCode: "3441", qualifier: "E", brand: "VETTI" })).toMatchObject({
      kind: "arm",
      state: "armed",
      mode: "stay",
    });
    expect(classify({ eventCode: "456", qualifier: "R", brand: "RADIOENGE" })).toMatchObject({
      kind: "arm",
      state: "armed",
      mode: "stay",
    });
    expect(classify({ eventCode: "441", qualifier: "R", brand: "JFL", description: "Arme Stay" })).toMatchObject({
      kind: "arm",
      state: "armed",
      mode: "stay",
    });
  });

  it("respeita o qualifier e não assume que todo E/R de código parcial é um estado", () => {
    expect(classify({ eventCode: "408", qualifier: "E", brand: "JFL" })).toEqual({
      kind: "unknown",
      state: "unknown",
    });
    expect(classify({ eventCode: "441", qualifier: "E", brand: "JFL" })).toEqual({
      kind: "unknown",
      state: "unknown",
    });
    expect(classify({ eventCode: "701", qualifier: "E", brand: "JFL" })).toEqual({
      kind: "unknown",
      state: "unknown",
    });
  });

  it("usa o registro exato do catálogo para 403, e permanece desconhecido sem evidência", () => {
    expect(classify({ eventCode: "403", qualifier: "E", brand: "JFL" })).toEqual({
      kind: "unknown",
      state: "unknown",
    });
    expect(classify({
      eventCode: "403",
      qualifier: "E",
      brand: "JFL",
      catalogRecord: {
        code: "403",
        qualifier: "E",
        fabricante: "JFL",
        tipo: "arme",
        description: "Autoarme por horário programado",
      },
    })).toEqual({ kind: "arm", state: "armed" });
    expect(classify({
      eventCode: "403",
      qualifier: "R",
      brand: "RADIOENGE",
      catalog: [{
        code: "403",
        qualifier: "R",
        fabricante: "RADIOENGE",
        tipo: "desarme",
        description: "Autodesarme da partição",
      }],
    })).toEqual({ kind: "disarm", state: "disarmed" });
    expect(classify({
      eventCode: "403",
      qualifier: "E",
      brand: "JFL",
      catalogRecord: {
        code: "403",
        qualifier: "E",
        fabricante: "JFL",
        tipo: "arme",
        description: "Autodesarme por horário programado",
      },
    })).toEqual({ kind: "unknown", state: "unknown" });
  });

  it("reconhece isolamento por códigos conhecidos, qualifier e descrição contextual", () => {
    expect(classify({ eventCode: "570", qualifier: "E", brand: "JFL" })).toEqual({
      kind: "isolation",
      state: "isolated",
    });
    expect(classify({ eventCode: "570", qualifier: "R", brand: "RADIOENGE" })).toEqual({
      kind: "isolation",
      state: "restored",
    });
    expect(classify({ eventCode: "573", qualifier: "E", brand: "JFL" })).toEqual({
      kind: "isolation",
      state: "isolated",
    });
    expect(classify({ eventCode: "1530", qualifier: "E", brand: "VETTI" })).toEqual({
      kind: "isolation",
      state: "isolated",
    });
    expect(classify({ eventCode: "1570", qualifier: "E", brand: "VETTI" })).toEqual({
      kind: "isolation",
      state: "isolated",
    });
    expect(classify({ eventCode: "3570", qualifier: "R", brand: "VETTI" })).toEqual({
      kind: "isolation",
      state: "restored",
    });
    expect(classify({
      eventCode: "999",
      qualifier: "E",
      brand: "JFL",
      description: "Setor 07 em bypass",
    })).toEqual({ kind: "isolation", state: "isolated" });
    expect(classify({
      eventCode: "999",
      qualifier: "R",
      brand: "JFL",
      description: "Zona 07 restaurada após inibição",
    })).toEqual({ kind: "isolation", state: "restored" });
  });

  it("não transforma qualquer evento de sistema em isolamento", () => {
    expect(classify({
      eventCode: "306",
      qualifier: "E",
      brand: "COMPATEC",
      tipo: "sistema",
      description: "Alteração da programação da central",
    })).toEqual({ kind: "unknown", state: "unknown" });
    expect(classify({
      eventCode: "999",
      qualifier: "E",
      brand: "JFL",
      tipo: "sistema",
      description: "Reset do sistema",
    })).toEqual({ kind: "unknown", state: "unknown" });
  });
});

describe("agenda operacional em America/Sao_Paulo", () => {
  const weeklySchedule: AlarmSchedule = {
    weekly: {
      monday: { armAt: "20:00", disarmAt: "07:00" },
      tuesday: { armAt: "20:00", disarmAt: "07:00" },
      wednesday: { armAt: "20:00", disarmAt: "07:00" },
      thursday: { armAt: "20:00", disarmAt: "07:00" },
      friday: { armAt: "20:00", disarmAt: "07:00" },
      saturday: { armAt: null, disarmAt: null },
      sunday: { armAt: null, disarmAt: null },
    },
  };

  it("calcula o dia da semana e aplica o fuso de São Paulo sem depender do timezone do processo", () => {
    const beforeArm = evaluateAlarmSchedule({ schedule: weeklySchedule, at: "2026-10-26T22:59:00Z" });
    expect(beforeArm.expectedState).toBe("disarmed");
    expect(beforeArm.transition).toMatchObject({ kind: "arm", state: "armed" });
    expect(beforeArm.transition?.at.toISOString()).toBe("2026-10-26T23:00:00.000Z");

    const afterArm = evaluateAlarmSchedule({ schedule: weeklySchedule, at: "2026-10-26T23:00:00Z" });
    expect(afterArm.expectedState).toBe("armed");
    expect(afterArm.status).toBe("report_only");

    const Saturday = evaluateAlarmSchedule({ schedule: weeklySchedule, at: local("2026-10-31T12:00") });
    expect(Saturday.expectedState).toBe("armed");
    expect(Saturday.transition).toMatchObject({ kind: "disarm", state: "disarmed" });
  });

  it("não cria transição para horários ausentes ou null", () => {
    const result = evaluateAlarmSchedule({
      schedule: { weekly: { monday: { armAt: null, disarmAt: null } } },
      at: local("2026-10-26T12:00"),
    });
    expect(result).toMatchObject({
      expectedState: "unknown",
      transition: null,
      status: "report_only",
    });
  });

  it("substitui o dia semanal por agenda especial de feriado", () => {
    const schedule: AlarmSchedule = {
      ...weeklySchedule,
      holidays: [{ date: "2026-10-26", holidayArm: "10:00", holidayDisarm: "12:00" }],
    };
    expect(evaluateAlarmSchedule({ schedule, at: local("2026-10-26T09:59") })).toMatchObject({
      expectedState: "armed",
      transition: { kind: "arm", state: "armed" },
    });
    expect(evaluateAlarmSchedule({ schedule, at: local("2026-10-26T10:00") }).expectedState).toBe("armed");
    expect(evaluateAlarmSchedule({ schedule, at: local("2026-10-26T12:01") }).expectedState).toBe("disarmed");
    expect(evaluateAlarmSchedule({ schedule, at: local("2026-10-26T12:01") }).transition?.kind).toBe("disarm");
  });

  it("aplica feriado nacional recorrente no formato DD/MM", () => {
    const schedule: AlarmSchedule = {
      weekly: { friday: { armAt: "20:00", disarmAt: "07:00" } },
      holidays: [{ date: "30/10", holidayArm: "22:00", holidayDisarm: "09:00" }],
    };
    expect(evaluateAlarmSchedule({ schedule, at: local("2026-10-30T21:00") })).toMatchObject({
      expectedState: "disarmed",
      transition: { kind: "arm", state: "armed" },
    });
    expect(evaluateAlarmSchedule({ schedule, at: local("2027-10-30T21:00") })).toMatchObject({
      expectedState: "disarmed",
      transition: { kind: "arm", state: "armed" },
    });
  });

  it("permite feriado sem horários e mantém a substituição sem inventar o semanal", () => {
    const schedule: AlarmSchedule = {
      weekly: { monday: { armAt: "20:00", disarmAt: "07:00" } },
      holidays: [{ date: "2026-10-26", holidayArm: null, holidayDisarm: null }],
    };
    const result = evaluateAlarmSchedule({ schedule, at: local("2026-10-26T20:30") });
    expect(result.expectedState).toBe("armed");
    expect(result.transition).toMatchObject({ kind: "disarm", state: "disarmed" });
  });

  it("suspende toda a programação da data", () => {
    const schedule: AlarmSchedule = {
      weekly: { monday: { armAt: "20:00", disarmAt: "07:00" } },
      exceptions: [{ date: "2026-10-26", suspended: true }],
    };
    const result = evaluateAlarmSchedule({ schedule, at: local("2026-10-26T21:00") });
    expect(result.expectedState).toBe("unknown");
    expect(result.transition).toBeNull();
  });

  it("aplica exceção temporária apenas durante sua janela de uma hora", () => {
    const schedule: AlarmSchedule = {
      weekly: { monday: { armAt: "20:00", disarmAt: "07:00" } },
      exceptions: [{
        date: "2026-10-26",
        suspended: true,
        validFromAt: local("2026-10-26T20:00"),
        validUntilAt: local("2026-10-26T21:00"),
      }],
    };

    const before = evaluateAlarmSchedule({ schedule, at: local("2026-10-26T19:59") });
    expect(before.expectedState).toBe("disarmed");

    const during = evaluateAlarmSchedule({ schedule, at: local("2026-10-26T20:30") });
    expect(during.expectedState).toBe("unknown");
    expect(during.status).toBe("report_only");
    expect(during.transition).toBeNull();

    const after = evaluateAlarmSchedule({ schedule, at: local("2026-10-26T21:01") });
    expect(after.expectedState).toBe("armed");
  });

  it("sobrepõe individualmente os horários e preserva o horário base faltante", () => {
    const schedule: AlarmSchedule = {
      weekly: { monday: { armAt: "20:00", disarmAt: "07:00" } },
      exceptions: [{ date: "2026-10-26", override: { armAt: "21:00" } }],
    };
    const beforeOverride = evaluateAlarmSchedule({ schedule, at: local("2026-10-26T20:30") });
    expect(beforeOverride.expectedState).toBe("disarmed");
    expect(beforeOverride.transition).toMatchObject({ kind: "arm", state: "armed" });
    expect(beforeOverride.transition?.at.toISOString()).toBe("2026-10-27T00:00:00.000Z");

    const afterOverride = evaluateAlarmSchedule({ schedule, at: local("2026-10-26T21:01") });
    expect(afterOverride.expectedState).toBe("armed");
  });

  it("aceita campos por dia do modelo existente e exceção indexada pela data", () => {
    const schedule: AlarmSchedule & Record<string, unknown> = {
      mondayArm: "20:00",
      mondayDisarm: "07:00",
      dateExceptions: {
        "2026-10-26": { override: { disarmAt: "08:00" } },
      },
    };
    const result = evaluateAlarmSchedule({ schedule, at: local("2026-10-26T07:30") });
    expect(result.expectedState).toBe("armed");
    expect(result.transition).toMatchObject({ kind: "disarm", state: "disarmed" });
    expect(result.transition?.at.toISOString()).toBe("2026-10-26T11:00:00.000Z");
    const afterOverride = evaluateAlarmSchedule({ schedule, at: local("2026-10-26T08:05") });
    expect(afterOverride.expectedState).toBe("disarmed");
  });
});

describe("tolerância e status de agenda", () => {
  const schedule: AlarmSchedule = {
    weekly: { monday: { armAt: "20:00", disarmAt: "07:00" } },
  };

  it("aceita evento no limite de dez minutos e rejeita evento posterior", () => {
    const within = evaluateAlarmSchedule({
      schedule,
      at: local("2026-10-26T20:09"),
      event: { eventCode: "401", qualifier: "R", brand: "JFL", receivedAt: local("2026-10-26T20:09") },
    });
    expect(within.status).toBe("within_schedule");
    expect(within.transition?.kind).toBe("arm");

    const late = evaluateAlarmSchedule({
      schedule,
      at: local("2026-10-26T20:11"),
      event: { eventCode: "401", qualifier: "R", brand: "JFL", receivedAt: local("2026-10-26T20:11") },
    });
    expect(late.status).toBe("missed_arm");

    const fixedTolerance = evaluateAlarmSchedule({
      schedule,
      at: local("2026-10-26T20:14"),
      event: { eventCode: "401", qualifier: "R", brand: "JFL", receivedAt: local("2026-10-26T20:14") },
    });
    expect(fixedTolerance.status).toBe("missed_arm");
    expect(fixedTolerance.toleranceMinutes).toBe(10);
  });

  it("marca desarme fora da janela como inesperado e não gera evento falso sem observação", () => {
    const unexpected = evaluateAlarmSchedule({
      schedule,
      at: local("2026-10-26T20:30"),
      event: { eventCode: "401", qualifier: "E", brand: "JFL", receivedAt: local("2026-10-26T20:30") },
    });
    expect(unexpected.expectedState).toBe("armed");
    expect(unexpected.status).toBe("unexpected_disarm");

    const reportOnly = evaluateAlarmSchedule({ schedule, at: local("2026-10-26T20:30") });
    expect(reportOnly.status).toBe("report_only");
    expect(reportOnly.expectedState).toBe("armed");
  });

  it("marca missed_arm somente quando há estado observado ainda desarmado", () => {
    const missed = evaluateAlarmSchedule({
      schedule,
      at: local("2026-10-26T20:20"),
      actualState: "disarmed",
    });
    expect(missed).toMatchObject({ expectedState: "armed", status: "missed_arm" });

    const aligned = evaluateAlarmSchedule({
      schedule,
      at: local("2026-10-26T20:20"),
      actualState: "armed",
    });
    expect(aligned.status).toBe("within_schedule");
  });

  it("não abre fila para Arme/Desarme sem agenda, nem para Stay ou isolamento", () => {
    const ordinaryArm = classify({ eventCode: "401", qualifier: "R", brand: "JFL" });
    const stayArm = classify({ eventCode: "3441", qualifier: "E", brand: "VETTI" });
    const zoneIsolation = classify({ eventCode: "570", qualifier: "E", brand: "JFL" });
    expect(getAlarmScheduleEventAction({ classification: ordinaryArm, hasActiveSchedule: false })).toBe("report_only");
    expect(getAlarmScheduleEventAction({ classification: stayArm, hasActiveSchedule: true, decision: { expectedState: "armed", transition: null, status: "unexpected_disarm", toleranceMinutes: 10 } })).toBe("report_only");
    expect(getAlarmScheduleEventAction({ classification: zoneIsolation, hasActiveSchedule: true })).toBe("report_only");
  });

  it("abre fila para desarme inesperado, mas deixa Arme atrasado no relatório após o evento chegar", () => {
    const unexpectedDisarm = classify({ eventCode: "401", qualifier: "E", brand: "JFL" });
    const lateArm = classify({ eventCode: "401", qualifier: "R", brand: "JFL" });
    const unexpectedDecision = evaluateAlarmSchedule({
      schedule,
      at: local("2026-10-26T20:30"),
      event: { eventCode: "401", qualifier: "E", brand: "JFL", receivedAt: local("2026-10-26T20:30") },
    });
    const lateArmDecision = evaluateAlarmSchedule({
      schedule,
      at: local("2026-10-26T20:11"),
      event: { eventCode: "401", qualifier: "R", brand: "JFL", receivedAt: local("2026-10-26T20:11") },
    });
    expect(getAlarmScheduleEventAction({ classification: unexpectedDisarm, hasActiveSchedule: true, decision: unexpectedDecision })).toBe("queue");
    expect(getAlarmScheduleEventAction({ classification: lateArm, hasActiveSchedule: true, decision: lateArmDecision })).toBe("report_only");
  });

  it("expõe a transição próxima ou vencida aplicável sem mutar o agendamento", () => {
    const result = evaluateAlarmSchedule({ schedule, at: local("2026-10-26T19:55") });
    expect(result.transition).toMatchObject({ kind: "arm", state: "armed", isOverdue: false });
    expect(result.nextTransition).toMatchObject({ kind: "arm", state: "armed" });
    expect(result.nextApplicableTransition).toMatchObject({ kind: "arm", state: "armed" });
    expect(result.overdueTransition).toBeNull();
    expect(schedule.weekly?.monday).toEqual({ armAt: "20:00", disarmAt: "07:00" });
  });
});
