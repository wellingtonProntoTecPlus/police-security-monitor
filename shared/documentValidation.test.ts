import { describe, expect, it } from "vitest";
import { validateOptionalBrazilianDocument } from "./documentValidation";

describe("documentos brasileiros opcionais", () => {
  it("aceita documento em branco", () => {
    expect(validateOptionalBrazilianDocument("", "cpf")).toMatchObject({ document: null, error: null });
  });

  it("normaliza e aceita CPF e CNPJ válidos", () => {
    expect(validateOptionalBrazilianDocument("529.982.247-25", "cpf")).toMatchObject({ document: "52998224725", kind: "cpf", error: null });
    expect(validateOptionalBrazilianDocument("04.252.011/0001-10", "cnpj")).toMatchObject({ document: "04252011000110", kind: "cnpj", error: null });
  });

  it("rejeita documento inválido ou de tipo diferente", () => {
    expect(validateOptionalBrazilianDocument("111.111.111-11", "cpf").error).toBe("CPF inválido");
    expect(validateOptionalBrazilianDocument("529.982.247-25", "cnpj").error).toBe("Informe um CNPJ válido");
  });
});
