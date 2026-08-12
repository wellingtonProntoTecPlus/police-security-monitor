import { describe, expect, it } from "vitest";
import { hasPersistedOpenIncident } from "./persistenceContract";

describe("contrato de persistência da fila operacional", () => {
  it("permite exibir somente o evento que já possui incidente persistido", () => {
    expect(hasPersistedOpenIncident(100, 200)).toBe(true);
  });

  it("bloqueia cards temporários quando o incidente não foi gravado", () => {
    expect(hasPersistedOpenIncident(100, null)).toBe(false);
    expect(hasPersistedOpenIncident(null, 200)).toBe(false);
    expect(hasPersistedOpenIncident(0, 0)).toBe(false);
  });
});
