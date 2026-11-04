import { describe, expect, it } from "vitest";
import { validateShiftAssignmentInput } from "./operatorShiftPersistence";

const base = { shiftCode: "first" as const, effectiveFromDate: "2026-11-04", cycleAnchorDate: "2026-11-01", changeReason: "Ajuste de escala acordado" };

describe("validação de escalas permanentes", () => {
  it("aceita turno fixo com âncora anterior sem reinventar logins", () => {
    expect(() => validateShiftAssignmentInput(base)).not.toThrow();
    expect(() => validateShiftAssignmentInput({ ...base, effectiveFromDate: "2026-11-01" })).not.toThrow();
  });
  it("rejeita motivo ausente", () => {
    expect(() => validateShiftAssignmentInput({ ...base, changeReason: "x" })).toThrow("motivo");
  });
  it("rejeita datas malformadas e dias inexistentes", () => {
    expect(() => validateShiftAssignmentInput({ ...base, effectiveFromDate: "04/11/2026" })).toThrow("datas válidas");
    expect(() => validateShiftAssignmentInput({ ...base, cycleAnchorDate: "2026-02-30" })).toThrow("Data operacional inválida");
  });
});
