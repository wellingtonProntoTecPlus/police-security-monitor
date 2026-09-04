import { describe, expect, it } from "vitest";
import { formatContactIdArgument, getContactIdArgumentContext } from "./contactIdArgumentContext";

describe("contexto do argumento Contact ID", () => {
  it("não trata o argumento de keep alive como zona", () => {
    expect(getContactIdArgumentContext({ eventCode: "361", qualifier: "E", value: "002" })).toMatchObject({
      label: "IP", value: "2", description: "Falha de Keep Alive IP 2",
    });
    expect(getContactIdArgumentContext({ eventCode: "361", qualifier: "R", value: "002" }).description).toBe("Keep Alive restaurado IP 2");
  });

  it("distingue usuário, zona isolada e PGM por código e qualificador", () => {
    expect(getContactIdArgumentContext({ eventCode: "401", qualifier: "R", value: "002" }).description).toBe("Armado por Usuário 2");
    expect(getContactIdArgumentContext({ eventCode: "401", qualifier: "E", value: "002" }).description).toBe("Desarmado por Usuário 2");
    expect(getContactIdArgumentContext({ eventCode: "570", qualifier: "E", value: "002" })).toMatchObject({ label: "Zona isolada", description: "Zona isolada 2" });
    expect(getContactIdArgumentContext({ eventCode: "708", qualifier: "R", value: "002" })).toMatchObject({ label: "PGM", description: "PGM desacionado 2" });
    expect(getContactIdArgumentContext({ eventCode: "407", qualifier: "E", value: "002" })).toMatchObject({ label: "Usuário", description: "Desarmado por aplicativo Usuário 2" });
  });

  it("mantém argumento genérico quando não há regra específica", () => {
    expect(formatContactIdArgument({ eventCode: "130", qualifier: "E", value: "005" })).toBe("Argumento 5");
  });
});
