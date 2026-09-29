import { describe, expect, it } from "vitest";
import { COMPANY_LOGO_MAX_BYTES, decodeCompanyLogo } from "./companyLogo";

function base64(bytes: number[]) {
  return Buffer.from(bytes).toString("base64");
}

describe("upload de logo corporativa", () => {
  it("aceita PNG com assinatura compatível", () => {
    const result = decodeCompanyLogo(base64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png");
    expect(result.extension).toBe("png");
  });

  it("rejeita conteúdo que não corresponde ao MIME informado", () => {
    expect(() => decodeCompanyLogo(base64([0xff, 0xd8, 0xff]), "image/png")).toThrow("não corresponde");
  });

  it("rejeita arquivo maior que o limite de performance", () => {
    const data = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(COMPANY_LOGO_MAX_BYTES)]).toString("base64");
    expect(() => decodeCompanyLogo(data, "image/png")).toThrow("no máximo 1 MB");
  });

  it("não aceita SVG ou formatos desconhecidos", () => {
    expect(() => decodeCompanyLogo("PHN2Zz48L3N2Zz4=", "image/svg+xml")).toThrow("Formato de logo não aceito");
  });
});
