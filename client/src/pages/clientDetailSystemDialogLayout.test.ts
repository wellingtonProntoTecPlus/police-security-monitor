import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/ClientDetail.tsx"), "utf8");

describe("modal de cadastro de sistemas responsivo", () => {
  it("limita a altura e permite rolagem interna", () => {
    expect(source).toContain("max-h-[calc(100dvh-1.5rem)]");
    expect(source).toContain("overflow-y-auto px-5 py-4");
  });

  it("mantém as ações de salvar e cancelar fora da área rolável", () => {
    expect(source).toContain("setShowSystemForm(false)}>Cancelar");
    expect(source).toContain('"Salvar sistema"');
    expect(source).toContain("shrink-0 items-center justify-end");
  });
});
