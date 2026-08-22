import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "../../../");
const readSource = (relativePath: string) => fs.readFileSync(path.join(projectRoot, relativePath), "utf8");

describe("campos de classificação e comunicação móvel", () => {
  it("oferece Residência, Empresa e Condomínio no cadastro de cliente", () => {
    const source = readSource("client/src/pages/Clients.tsx");
    expect(source).toContain('value="residence">Residência');
    expect(source).toContain('value="company">Empresa');
    expect(source).toContain('value="condominium">Condomínio');
  });

  it("mostra apartamento somente para condomínios nos usuários do painel", () => {
    const source = readSource("client/src/pages/ClientDetail.tsx");
    expect(source).toContain('client.propertyType === "condominium"');
    expect(source).toContain("Número do Apartamento");
    expect(source).toContain("apartmentNumber");
  });

  it("inclui SIM Card e número da linha quando existe comunicação GPRS", () => {
    const globalForm = readSource("client/src/pages/AlarmSystems.tsx");
    const detailForm = readSource("client/src/pages/ClientDetail.tsx");
    for (const source of [globalForm, detailForm]) {
      expect(source).toContain("simCardNumber");
      expect(source).toContain("simPhoneNumber");
      expect(source).toContain('communicationType === "gprs" ||');
    }
  });
});
