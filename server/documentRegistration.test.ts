import { describe, expect, it } from "vitest";
import { assertDocumentAvailable } from "./db";
import { validateOptionalBrazilianDocument } from "@shared/documentValidation";

function documentQueryDb(input: { registry?: unknown[]; clients?: unknown[]; partners?: unknown[] }) {
  let call = 0;
  return {
    select: () => ({
      from: () => {
        const response = call++ === 0 ? input.registry ?? [] : call === 2 ? input.clients ?? [] : input.partners ?? [];
        return { where: () => Array.isArray(response) ? Object.assign(response, { limit: async () => response }) : response };
      },
    }),
  };
}

describe("CPF e CNPJ opcionais e únicos", () => {
  it("aceita documento vazio e bloqueia CPF ou CNPJ inválidos", () => {
    expect(validateOptionalBrazilianDocument("", "cpf")).toMatchObject({ document: null, error: null });
    expect(validateOptionalBrazilianDocument("111.111.111-11", "cpf").error).toBe("CPF inválido");
    expect(validateOptionalBrazilianDocument("11.111.111/1111-11", "cnpj").error).toBe("CNPJ inválido");
  });

  it("bloqueia documento já reservado por outro cadastro", async () => {
    const db = documentQueryDb({ registry: [{ ownerType: "partner", ownerId: 2 }] });
    await expect(assertDocumentAvailable(db, "04252011000110", "client")).rejects.toThrow("CPF/CNPJ já cadastrado");
  });

  it("bloqueia duplicidade legada entre cliente e parceira", async () => {
    const db = documentQueryDb({ clients: [{ id: 7 }] });
    await expect(assertDocumentAvailable(db, "04252011000110", "partner")).rejects.toThrow("CPF/CNPJ já cadastrado");
  });
});
