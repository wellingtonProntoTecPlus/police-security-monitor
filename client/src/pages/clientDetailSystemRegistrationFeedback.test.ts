import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/ClientDetail.tsx"), "utf8");

describe("retorno do cadastro de sistema", () => {
  it("explica que Online depende da primeira comunicação da central", () => {
    expect(source).toContain("O status Online só aparece quando a central fizer a primeira comunicação.");
    expect(source).toContain("Aguardando comunicação");
  });

  it("limpa o formulário e seleciona o sistema recém-criado", () => {
    expect(source).toContain("setOperationalSystemId(createdSystem.id)");
    expect(source).toContain("setSystemForm({ ...INITIAL_SYSTEM_FORM })");
  });
});
