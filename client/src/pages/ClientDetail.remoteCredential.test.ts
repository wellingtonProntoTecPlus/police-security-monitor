import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ClientDetail — persistência de credencial técnica", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/ClientDetail.tsx"), "utf8");

  it("mantém a janela aberta durante o salvamento e informa a falha ao operador", () => {
    expect(source).toContain("Não foi possível atualizar a credencial técnica:");
    expect(source).toContain("Aguarde a confirmação da atualização da credencial antes de fechar esta janela.");
    expect(source).toContain('disabled={setRemoteCredential.isPending}');
    expect(source).toContain('setRemoteCredential.isPending ? "Salvando credencial..." : "Concluir"');
  });

  it("usa status por cliente no perfil parceiro sem liberar credenciais ou regras de Keep Alive", () => {
    expect(source).toContain("trpc.alarmSystem.clientConnectionStatus.useQuery({ clientId }");
    expect(source).toContain("refetchInterval: 15000");
    expect(source).toContain("!isPartner && <Button variant=\"ghost\" size=\"sm\" className=\"h-7 w-7 p-0 text-amber-300\"");
    expect(source).toContain("if (!isPartner) Object.assign(payload");
  });
});
