import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectFile = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("visibilidade dos cadastros operacionais", () => {
  it("destaca as credenciais de segurança no formulário de contato", () => {
    const source = projectFile("client/src/pages/ClientDetail.tsx");

    expect(source).toContain("Contatos e Credenciais");
    expect(source).toContain("Credenciais de Segurança");
    expect(source).toContain("Contra senha");
    expect(source).toContain("Senha de coação");
  });

  it("orienta a seleção da parceira antes do cadastro de Tático Móvel", () => {
    const source = projectFile("client/src/pages/Partners.tsx");

    expect(source).toContain("Configuração da Parceira");
    expect(source).toContain("Selecionar esta parceira para cadastrar Tático Móvel e feriados");
    expect(source).toContain("Tático Móvel");
  });

  it("explica o cadastro de vários sistemas independentes no cliente", () => {
    const source = projectFile("client/src/pages/ClientDetail.tsx");

    expect(source).toContain("Cada sistema é independente");
    expect(source).toContain("Adicionar outro sistema");
    expect(source).toContain("Sistema {index + 1} · Conta:");
  });
});
