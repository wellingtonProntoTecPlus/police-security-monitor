import { describe, expect, it } from "vitest";
import { resolveExistingActiveChildAction, resolveIncidentOwnershipAction } from "./incidentOwnershipPolicy";

describe("propriedade de atendimento multioperador", () => {
  it("reivindica somente incidente pendente", () => {
    expect(resolveIncidentOwnershipAction({ status: "waiting", assignedOperatorId: null, actingOperatorId: 12 })).toBe("claim");
    expect(resolveIncidentOwnershipAction({ status: "waiting", assignedOperatorId: 12, actingOperatorId: 13 })).toBeNull();
  });

  it("permite retomar observação própria e cria assunção separada para outro operador", () => {
    expect(resolveIncidentOwnershipAction({ status: "observing", assignedOperatorId: 12, actingOperatorId: 12 })).toBe("resume");
    expect(resolveIncidentOwnershipAction({ status: "observing", assignedOperatorId: 12, actingOperatorId: 13 })).toBe("assume_child");
  });

  it("reivindica observação automática ou escalada sem operador sem criar filho", () => {
    expect(resolveIncidentOwnershipAction({ status: "observing", assignedOperatorId: null, actingOperatorId: 12 })).toBe("claim");
    expect(resolveIncidentOwnershipAction({ status: "attending", assignedOperatorId: null, actingOperatorId: 12 })).toBe("claim");
    expect(resolveIncidentOwnershipAction({ status: "dispatched", assignedOperatorId: null, actingOperatorId: 12 })).toBeNull();
  });

  it("bloqueia troca silenciosa de atendimento ativo e incidente fechado", () => {
    expect(resolveIncidentOwnershipAction({ status: "attending", assignedOperatorId: 12, actingOperatorId: 13 })).toBeNull();
    expect(resolveIncidentOwnershipAction({ status: "dispatched", assignedOperatorId: 12, actingOperatorId: 13 })).toBeNull();
    expect(resolveIncidentOwnershipAction({ status: "closed", assignedOperatorId: 12, actingOperatorId: 12 })).toBeNull();
  });

  it("reutiliza o atendimento filho do mesmo operador e bloqueia outro filho ativo", () => {
    expect(resolveExistingActiveChildAction({ activeChildOperatorId: 13, actingOperatorId: 13 })).toBe("reuse_existing");
    expect(resolveExistingActiveChildAction({ activeChildOperatorId: 13, actingOperatorId: 14 })).toBe("reject_other_operator");
  });
});
