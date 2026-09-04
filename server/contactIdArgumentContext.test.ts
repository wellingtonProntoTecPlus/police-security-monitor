import { describe, expect, it } from "vitest";
import { getContactIdArgumentContext } from "@shared/contactIdArgumentContext";

describe("interpretação do argumento Contact ID", () => {
  it("classifica E361 e R361 como IP, não como zona", () => {
    expect(getContactIdArgumentContext({ eventCode: "361", qualifier: "E", value: "002" })).toMatchObject({
      label: "IP", value: "2", description: "Falha de Keep Alive IP 2",
    });
    expect(getContactIdArgumentContext({ eventCode: "361", qualifier: "R", value: "002" })).toMatchObject({
      label: "IP", value: "2", description: "Keep Alive restaurado IP 2",
    });
  });

  it("classifica o argumento de E401/R401 e E407/R407 como usuário", () => {
    expect(getContactIdArgumentContext({ eventCode: "401", qualifier: "R", value: "002" }).description).toBe("Armado por Usuário 2");
    expect(getContactIdArgumentContext({ eventCode: "401", qualifier: "E", value: "002" }).description).toBe("Desarmado por Usuário 2");
    expect(getContactIdArgumentContext({ eventCode: "407", qualifier: "E", value: "002" }).description).toBe("Desarmado por aplicativo Usuário 2");
    expect(getContactIdArgumentContext({ eventCode: "407", qualifier: "R", value: "002" }).description).toBe("Armado por aplicativo Usuário 2");
  });

  it("preserva Zona isolada e PGM como contextos próprios", () => {
    expect(getContactIdArgumentContext({ eventCode: "570", qualifier: "E", value: "002" })).toMatchObject({ label: "Zona isolada", description: "Zona isolada 2" });
    expect(getContactIdArgumentContext({ eventCode: "570", qualifier: "R", value: "002" }).description).toBe("Restaura Zona Isolada 2");
    expect(getContactIdArgumentContext({ eventCode: "708", qualifier: "E", value: "002" })).toMatchObject({ label: "PGM", description: "PGM acionado 2" });
    expect(getContactIdArgumentContext({ eventCode: "708", qualifier: "R", value: "002" }).description).toBe("PGM desacionado 2");
  });
});
