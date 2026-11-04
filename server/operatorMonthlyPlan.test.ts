import { describe, expect, it } from "vitest";
import { buildOperatorMonthlyPlan } from "@shared/operatorMonthlyPlan";

const people = [
  { id: 1, name: "Amanda" },
  { id: 2, name: "Stephane" },
];

const assignments = [
  {
    id: 1,
    userId: 1,
    shiftCode: "first" as const,
    cycleAnchorDate: "2026-01-01",
    effectiveFromDate: "2026-01-01",
    effectiveUntilDate: "2026-01-15",
    isActive: true,
  },
  {
    id: 2,
    userId: 1,
    shiftCode: "first" as const,
    cycleAnchorDate: "2026-01-16",
    effectiveFromDate: "2026-01-16",
    effectiveUntilDate: null,
    isActive: true,
  },
  {
    id: 3,
    userId: 2,
    shiftCode: "second" as const,
    cycleAnchorDate: "2026-01-02",
    effectiveFromDate: "2026-01-01",
    effectiveUntilDate: "2026-01-15",
    isActive: true,
  },
  {
    id: 4,
    userId: 2,
    shiftCode: "second" as const,
    cycleAnchorDate: "2026-01-17",
    effectiveFromDate: "2026-01-16",
    effectiveUntilDate: null,
    isActive: true,
  },
];

function plan(exceptions: Array<{
  id: number;
  userId: number;
  workDate: string;
  kind: "work" | "off";
  shiftCode: "first" | "second" | "third" | "commercial" | null;
  isActive: boolean;
  reason: string;
}> = [], fromDate = "2026-01-15", toDate = "2026-01-19") {
  return buildOperatorMonthlyPlan({ people, assignments, exceptions, fromDate, toDate });
}

function datesFor(rows: ReturnType<typeof plan>, operatorName: string) {
  return rows.filter((row) => row.operatorName === operatorName).map((row) => row.workDate);
}

describe("plano mensal permanente de escala", () => {
  it("mantém as âncoras históricas e alterna a partir das novas vigências", () => {
    const rows = plan();

    expect(datesFor(rows, "Amanda")).toEqual(["2026-01-15", "2026-01-16", "2026-01-18"]);
    expect(datesFor(rows, "Stephane")).toEqual(["2026-01-17", "2026-01-19"]);
    expect(rows.filter((row) => row.workDate === "2026-01-16").map((row) => row.operatorName)).toEqual(["Amanda"]);
    expect(rows.filter((row) => row.workDate === "2026-01-17").map((row) => row.operatorName)).toEqual(["Stephane"]);
  });

  it("exceções pontuais de off/work nos dias 16 e 17 não alteram a paridade futura", () => {
    const baseline = plan();
    const withExceptions = plan([
      { id: 10, userId: 1, workDate: "2026-01-16", kind: "off", shiftCode: null, isActive: true, reason: "folga pontual" },
      { id: 11, userId: 2, workDate: "2026-01-17", kind: "work", shiftCode: "second", isActive: true, reason: "cobertura pontual" },
    ]);

    expect(withExceptions.filter((row) => row.workDate >= "2026-01-18")).toEqual(
      baseline.filter((row) => row.workDate >= "2026-01-18"),
    );
    expect(withExceptions.find((row) => row.operatorName === "Amanda" && row.workDate === "2026-01-16")).toBeUndefined();
    expect(withExceptions.find((row) => row.operatorName === "Stephane" && row.workDate === "2026-01-17")?.isException).toBe(true);
  });

  it("converte o terceiro turno para a data seguinte no fim da janela", () => {
    const rows = buildOperatorMonthlyPlan({
      people: [{ id: 3, name: "Noturno" }],
      assignments: [{
        id: 20, userId: 3, shiftCode: "third", cycleAnchorDate: "2026-01-16",
        effectiveFromDate: "2026-01-16", effectiveUntilDate: null, isActive: true,
      }],
      exceptions: [], fromDate: "2026-01-16", toDate: "2026-01-16",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].workDate).toBe("2026-01-16");
    expect(rows[0].startAt.toISOString()).toBe("2026-01-16T22:00:00.000Z");
    expect(rows[0].endAt.toISOString()).toBe("2026-01-17T10:00:00.000Z");
  });

  it("projeta escala Comercial de segunda a sexta e exclui sábado e domingo", () => {
    const rows = buildOperatorMonthlyPlan({
      people: [{ id: 4, name: "Comercial" }],
      assignments: [{ id: 40, userId: 4, shiftCode: "commercial", cycleAnchorDate: "2026-11-02", effectiveFromDate: "2026-11-02", effectiveUntilDate: null, isActive: true }],
      exceptions: [], fromDate: "2026-11-02", toDate: "2026-11-08",
    });
    expect(rows.map((row) => row.workDate)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
    expect(rows[0].startAt.toISOString()).toBe("2026-11-02T11:00:00.000Z");
    expect(rows[0].endAt.toISOString()).toBe("2026-11-02T21:00:00.000Z");
  });

  it("aceita exatamente 93 dias e rejeita 94 dias ou datas inválidas", () => {
    expect(plan([], "2026-01-01", "2026-04-03")).toBeDefined();
    expect(() => plan([], "2026-01-01", "2026-04-04")).toThrow("Consulte até 93 dias de escala por vez");
    expect(() => plan([], "2026-02-30", "2026-03-01")).toThrow("Data operacional inválida");
    expect(() => plan([], "2026-03-02", "2026-03-01")).toThrow("Consulte até 93 dias de escala por vez");
  });
});
