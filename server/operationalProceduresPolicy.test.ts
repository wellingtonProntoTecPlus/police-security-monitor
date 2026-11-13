import { describe, expect, it } from "vitest";
import { applicableProcedures, classifyProcedureEvent } from "../shared/operationalProcedures";

describe("classifyProcedureEvent", () => {
  it("classifies event codes by their event and qualifier", () => {
    expect(classifyProcedureEvent({ eventCode: "120", qualifier: "E" })).toBe("panic");
    expect(classifyProcedureEvent({ eventCode: "130", qualifier: "E" })).toBe("alarm");
    expect(classifyProcedureEvent({ eventCode: "KOFF", qualifier: "E" })).toBe("system_problem");
  });

  it("only marks a disarm outside schedule when explicitly flagged", () => {
    expect(classifyProcedureEvent({ eventCode: "401", qualifier: "E" })).toBe("general");
    expect(classifyProcedureEvent({ eventCode: "401", qualifier: "E" }, true)).toBe("outside_schedule_disarm");
    expect(classifyProcedureEvent({ eventCode: "401", qualifier: "R" })).toBe("general");
    expect(classifyProcedureEvent({ eventCode: "407", qualifier: "R" })).toBe("general");
    expect(classifyProcedureEvent({ eventCode: "407", qualifier: "E" })).toBe("general");
  });

  it("does not classify restoration events as a new alarm or panic", () => {
    expect(classifyProcedureEvent({ eventCode: "130", qualifier: "R" })).toBe("general");
    expect(classifyProcedureEvent({ eventCode: "120", qualifier: "R" })).toBe("general");
  });

  it("treats unknown codes and benign descriptive text as general without mutating the text", () => {
    const event = Object.freeze({
      eventCode: "X999",
      qualifier: "E",
      description: "Comunicação normal; alarme preventivo informado pelo cliente.",
    });
    expect(classifyProcedureEvent(event)).toBe("general");
    expect(event.description).toBe("Comunicação normal; alarme preventivo informado pelo cliente.");
    expect(classifyProcedureEvent({ eventCode: "X001", qualifier: "E", description: null })).toBe("general");
  });
});

describe("applicableProcedures", () => {
  it("includes active general and current-type rows, ordered specific before general", () => {
    const rows = [
      { id: 1, procedureType: "general", priority: 1, isActive: true },
      { id: 2, procedureType: "alarm", priority: 9, isActive: true },
      { id: 3, procedureType: "alarm", priority: 2, isActive: true },
      { id: 4, procedureType: "panic", priority: 1, isActive: true },
      { id: 5, procedureType: "general", priority: 4, isActive: false },
      { id: 6, priority: 3, isActive: true },
      { id: 7, procedureType: "general", priority: 5, isActive: true },
    ];

    expect(applicableProcedures(rows, "alarm").map(row => row.id)).toEqual([3, 2, 1, 6, 7]);
  });

  it("excludes inactive and unrelated specific rows even when selecting general procedures", () => {
    const rows = [
      { id: 1, procedureType: "general", priority: 2, isActive: true },
      { id: 2, procedureType: "panic", priority: 1, isActive: true },
      { id: 3, procedureType: "general", priority: 1, isActive: false },
    ];

    expect(applicableProcedures(rows, "general").map(row => row.id)).toEqual([1]);
  });
});
