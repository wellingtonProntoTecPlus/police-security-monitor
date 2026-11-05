import { describe, expect, it } from "vitest";
import { assertDocumentAvailable } from "./db";
import { validateOptionalBrazilianDocument } from "@shared/documentValidation";

function documentQueryDb(input: { registry?: unknown[]; clients?: unknown[]; partners?: unknown[] }) {
  let call = 0;
  return {
    select: () => ({
      from: () => {
        const response = call++ === 0 ? input.registry ?? [] : call === 2 ? input.clients ?? [] : input.partners ?? [];
        return { where: () => Array.isArray(response) ? Object.assign(response, { limit: async () => response, for: async () => response }) : response };
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

  it("permite CNPJ da sede somente para cliente PJ empresa, na mesma parceira e com confirmação explícita", async () => {
    const samePartner = documentQueryDb({ registry: [{ ownerType: "partner", ownerId: 9 }], partners: [{ id: 9, cnpj: "04252011000110" }] });
    await expect(assertDocumentAvailable(samePartner, "04252011000110", "client", undefined, {
      partnerCompanyId: 9, type: "pj", propertyType: "company", confirmed: true,
    })).resolves.toBe(true);

    for (const input of [
      { partnerCompanyId: 9, type: "pj", propertyType: "company", confirmed: false },
      { partnerCompanyId: 10, type: "pj", propertyType: "company", confirmed: true },
      { partnerCompanyId: 9, type: "pf", propertyType: "company", confirmed: true },
      { partnerCompanyId: 9, type: "pj", propertyType: "condominium", confirmed: true },
    ]) await expect(assertDocumentAvailable(documentQueryDb({ registry: [{ ownerType: "partner", ownerId: 9 }], partners: [{ id: 9, cnpj: "04252011000110" }] }), "04252011000110", "client", undefined, input)).rejects.toThrow("CPF/CNPJ já cadastrado");
  });

  it("recusa reutilizar o CNPJ da parceira se já existir outro cliente com o mesmo número", async () => {
    const db = documentQueryDb({ registry: [{ ownerType: "partner", ownerId: 9 }], clients: [{ id: 3 }], partners: [{ id: 9, cnpj: "04252011000110" }] });
    await expect(assertDocumentAvailable(db, "04252011000110", "client", undefined, {
      partnerCompanyId: 9, type: "pj", propertyType: "company", confirmed: true,
    })).rejects.toThrow("CPF/CNPJ já cadastrado");
  });

  it("não transforma colisão de documento entre clientes em aviso de confirmação", async () => {
    const db = documentQueryDb({ registry: [{ ownerType: "client", ownerId: 7 }], clients: [{ id: 7 }] });
    await expect(assertDocumentAvailable(db, "04252011000110", "client", undefined, {
      partnerCompanyId: 9, type: "pj", propertyType: "company", confirmed: true,
    })).rejects.toThrow("CPF/CNPJ já cadastrado");
  });

  it("permite editar a parceira existente que já monitora sua própria sede, sem liberar o documento para outra parceira", async () => {
    const input = { registry: [{ ownerType: "partner", ownerId: 9 }, { ownerType: "client", ownerId: 3 }], clients: [{ id: 3, partnerCompanyId: 9, isPartnerHeadquarters: true, type: "pj", propertyType: "company" }], partners: [{ id: 9, cnpj: "04252011000110" }] };
    await expect(assertDocumentAvailable(documentQueryDb(input), "04252011000110", "partner", 9)).resolves.toBe(false);
    await expect(assertDocumentAvailable(documentQueryDb(input), "04252011000110", "partner", 10)).rejects.toThrow("CPF/CNPJ já cadastrado");
  });
});
