import { describe, expect, it } from "vitest";
import { matchesOperationalStatusSearch } from "./operationalStatusSearch";

describe("busca dos indicadores operacionais", () => {
  const system = {
    account: "0334",
    clientName: "Wellington de Sousa Portes",
    clientFantasyName: "Police Electronics",
    brand: "COMPATEC",
    model: "AW3 Pro",
  };

  it("localiza por conta, parte do nome, sobrenome e nome fantasia", () => {
    for (const term of ["0334", "wellington", "portes", "police", "compatec"]) {
      expect(matchesOperationalStatusSearch(system, term)).toBe(true);
    }
  });

  it("ignora acentos e retorna falso para termos sem correspondência", () => {
    expect(matchesOperationalStatusSearch({ name: "Condomínio Matheus Barbosa" }, "condominio")).toBe(true);
    expect(matchesOperationalStatusSearch(system, "inexistente")).toBe(false);
  });
});
