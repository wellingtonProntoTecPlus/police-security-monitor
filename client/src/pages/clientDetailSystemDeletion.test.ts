import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/ClientDetail.tsx"), "utf8");

describe("confirmação visual de exclusão de sistema", () => {
  it("mostra conta, marca, modelo e identificadores antes de excluir", () => {
    expect(source).toContain("Confirmar exclusão do sistema");
    expect(source).toContain("<strong>Conta:</strong>");
    expect(source).toContain("<strong>Central:</strong>");
    expect(source).toContain("<strong>Serial:</strong>");
    expect(source).toContain("<strong>MAC:</strong>");
  });

  it("requer a frase de confirmação antes de habilitar a exclusão", () => {
    expect(source).toContain("buildAlarmSystemDeletionConfirmation(systemPendingDeletion)");
    expect(source).toContain("confirmation: systemDeletionConfirmation");
  });
});
