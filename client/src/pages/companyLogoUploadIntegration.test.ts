import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const managingCompany = readFileSync(new URL("./ManagingCompany.tsx", import.meta.url), "utf8");
const partners = readFileSync(new URL("./Partners.tsx", import.meta.url), "utf8");

describe("upload de logo nos cadastros corporativos", () => {
  it("usa o componente de envio seguro na Gestora e persiste pelo uploadLogo", () => {
    expect(managingCompany).toContain("LogoUploadField");
    expect(managingCompany).toContain("trpc.managingCompany.uploadLogo.useMutation");
    expect(managingCompany).toContain("Logo da Empresa");
    expect(managingCompany).toContain("void refetch()");
  });

  it("usa o componente de envio seguro na Parceira e persiste pelo uploadLogo", () => {
    expect(partners).toContain("LogoUploadField");
    expect(partners).toContain("trpc.partnerCompany.uploadLogo.useMutation");
    expect(partners).toContain("Logo da Parceira");
    expect(partners).toContain("void refetch()");
  });
});
