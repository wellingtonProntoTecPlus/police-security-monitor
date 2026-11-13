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

  it("exibe os dados da própria central e Keep Alive em leitura, sem liberar credenciais técnicas ou edição operacional", () => {
    expect(source).toContain("trpc.alarmSystem.clientConnectionStatus.useQuery({ clientId }");
    expect(source).toContain("refetchInterval: 15000");
    expect(source).toContain("Situação no monitoramento:");
    expect(source).toContain("Motivo registrado:");
    expect(source).toContain("Ver ficha completa da central");
    expect(source).toContain("<strong>Endereço IP:</strong>");
    expect(source).toContain("<strong>Última comunicação:</strong>");
    expect(source).toContain("<strong>Observação da manutenção:</strong>");
    expect(source).toContain("<strong>Frequência esperada:</strong>");
    expect(source).toContain("!isPartner && <Button variant=\"ghost\" size=\"sm\" className=\"h-7 w-7 p-0 text-amber-300\"");
    expect(source).toContain("if (!isPartner) Object.assign(payload");
  });
});
