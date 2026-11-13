import { describe, expect, it } from "vitest";
import { decryptDvrPassword, encryptDvrPassword } from "./dvrPasswordEncryption";

describe("DVR password encryption", () => {
  it("round-trips with authenticated AES-GCM and never stores the plaintext", () => {
    const encrypted = encryptDvrPassword("Senha DVR 123!", "teste-segredo");
    expect(encrypted).not.toContain("Senha DVR 123!");
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(decryptDvrPassword(encrypted, "teste-segredo")).toBe("Senha DVR 123!");
  });

  it("preserves whitespace and case of the actual credential", () => {
    const password = "  aDMin + P@ss  ";
    expect(decryptDvrPassword(encryptDvrPassword(password, "test-key"), "test-key")).toBe(password);
  });

  it("rejects a different key and malformed ciphertext", () => {
    const encrypted = encryptDvrPassword("senha", "segredo-a");
    expect(() => decryptDvrPassword(encrypted, "segredo-b")).toThrow();
    expect(() => decryptDvrPassword("texto-em-claro", "segredo-a")).toThrow();
  });

  it("rejects empty passwords", () => {
    expect(() => encryptDvrPassword("   ", "segredo-a")).toThrow("Informe a senha do DVR");
  });
});
