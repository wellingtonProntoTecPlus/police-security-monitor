import { describe, expect, it } from "vitest";
import { matchesOperationalStatusSearch } from "./operationalStatusSearch";

describe("busca dos indicadores operacionais", () => {
  const system = {
    account: "0334",
    clientName: "Wellington de Sousa Portes",
    clientFantasyName: "Police Electronics",
    partnerName: "Segurança São José",
    brand: "COMPATEC",
    model: "AW3 Pro",
  };

  it("localiza por conta, parte do nome, sobrenome, fantasia, parceira e nome da marca", () => {
    for (const term of ["0334", "wellington", "portes", "police", "compatec", "seguranca", "sao jose"]) {
      expect(matchesOperationalStatusSearch(system, term)).toBe(true);
    }
  });

  it("ignora acentos e retorna falso para termos sem correspondência", () => {
    expect(matchesOperationalStatusSearch({ name: "Condomínio Matheus Barbosa" }, "condominio")).toBe(true);
    expect(matchesOperationalStatusSearch(system, "inexistente")).toBe(false);
  });
});
