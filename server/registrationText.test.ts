import { describe, expect, it } from "vitest";
import { formatRegistrationFields, formatRegistrationText, normalizeRegistrationPayload } from "./registrationText";

describe("formatação de textos cadastrais", () => {
  it("padroniza nomes e endereços em iniciais maiúsculas", () => {
    expect(formatRegistrationText("BILHAR E CIA LTDA")).toBe("Bilhar e Cia LTDA");
    expect(formatRegistrationText("rua edson gonçalves, 998 - SEGISMUNDO PEREIRA")).toBe("Rua Edson Gonçalves, 998 - Segismundo Pereira");
  });

  it("preserva siglas e não modifica campos técnicos não selecionados", () => {
    const data = formatRegistrationFields({ name: "monitoramento central", macAddress: "C1BDCB" }, ["name"]);
    expect(data.name).toBe("Monitoramento Central");
    expect(data.macAddress).toBe("C1BDCB");
  });

  it("mantém campos livres e técnicos fora da lista de normalização", () => {
    const data = formatRegistrationFields({ description: "NÃO ALTERAR ESTE TEXTO", account: "0336" }, []);
    expect(data.description).toBe("NÃO ALTERAR ESTE TEXTO");
    expect(data.account).toBe("0336");
  });

  it("normaliza cada campo cadastral escolhido sem tocar em versão ou identificador", () => {
    const data = formatRegistrationFields(
      { title: "fechamento com o cliente", model: "AMT 2018", firmwareVersion: "V4.0", code: "E401" },
      ["title"],
    );
    expect(data.title).toBe("Fechamento com o Cliente");
    expect(data.model).toBe("AMT 2018");
    expect(data.firmwareVersion).toBe("V4.0");
    expect(data.code).toBe("E401");
  });

  it("cobre os payloads dos CRUDs restantes e preserva identificadores técnicos", () => {
    expect(normalizeRegistrationPayload("alarmSystem", { model: "central principal", account: "0336", macAddress: "C1BDCB", imeiGprs: "123456", isepId: "693E", firmwareVersion: "V4.0" }))
      .toEqual({ model: "Central Principal", account: "0336", macAddress: "C1BDCB", imeiGprs: "123456", isepId: "693E", firmwareVersion: "V4.0" });
    expect(normalizeRegistrationPayload("systemUser", { name: "JOÃO DA SILVA", email: "joao@example.com" }))
      .toEqual({ name: "João da Silva", email: "joao@example.com" });
    expect(normalizeRegistrationPayload("finalization", { title: "contato realizado com sucesso", description: "NÃO ALTERAR TEXTO OPERACIONAL" }))
      .toEqual({ title: "Contato Realizado com Sucesso", description: "NÃO ALTERAR TEXTO OPERACIONAL" });
    expect(normalizeRegistrationPayload("procedure", { title: "ligar para o responsável", description: "MANTER A DESCRIÇÃO ORIGINAL" }))
      .toEqual({ title: "Ligar para o Responsável", description: "MANTER A DESCRIÇÃO ORIGINAL" });
  });
});
