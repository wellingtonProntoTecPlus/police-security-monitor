import { describe, expect, it } from "vitest";
import { deriveVettiCommandUser, getRemoteCommandCredentialProfiles } from "@shared/remoteCommandCredentialProfiles";

describe("perfis de credencial técnica por fabricante", () => {
  it("separa as credenciais JFL, Intelbras e Vetti", () => {
    expect(getRemoteCommandCredentialProfiles("JFL").map((item) => item.kind)).toEqual(["jfl_master", "jfl_installer"]);
    expect(getRemoteCommandCredentialProfiles("INTELBRAS").map((item) => item.kind)).toEqual(["intelbras_master", "intelbras_installer", "intelbras_remote_configuration"]);
    expect(getRemoteCommandCredentialProfiles("VETTI").map((item) => item.kind)).toEqual(["vetti_installer", "vetti_command_user"]);
  });

  it("deriva o usuário Vetti a partir dos dois primeiros dígitos da senha de comando", () => {
    expect(deriveVettiCommandUser("034567")).toBe("303");
    expect(deriveVettiCommandUser("999987")).toBe("399");
    expect(deriveVettiCommandUser("0345")).toBe("303");
    expect(() => deriveVettiCommandUser("123")).toThrow("4 ou 6 dígitos");
  });
});
