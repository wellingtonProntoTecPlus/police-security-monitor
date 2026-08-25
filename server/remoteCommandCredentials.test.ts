import { describe, expect, it } from "vitest";
import { decryptRemoteCommandCredential, encryptRemoteCommandCredential } from "./remoteCommandCredentials";

describe("credencial técnica de comando remoto", () => {
  it("cifra a credencial sem preservá-la em texto e permite uso somente no servidor", () => {
    const encrypted = encryptRemoteCommandCredential("1234", "segredo-de-teste");
    expect(encrypted).not.toContain("1234");
    expect(decryptRemoteCommandCredential(encrypted, "segredo-de-teste")).toBe("1234");
  });

  it("recusa a leitura com uma chave diferente", () => {
    const encrypted = encryptRemoteCommandCredential("senha-painel", "segredo-a");
    expect(() => decryptRemoteCommandCredential(encrypted, "segredo-b")).toThrow();
  });
});
