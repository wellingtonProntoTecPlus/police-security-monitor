import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalSessionToken, verifyLocalSessionToken } from "./_core/localSession";

describe("sessão local", () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = "segredo-de-teste-police-central";
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it("assina e valida a identidade do usuário", () => {
    const token = createLocalSessionToken({ id: 42, openId: "operador-42" });

    expect(verifyLocalSessionToken(token)).toMatchObject({
      userId: 42,
      openId: "operador-42",
    });
  });

  it("rejeita token alterado", () => {
    const token = createLocalSessionToken({ id: 42, openId: "operador-42" });
    expect(verifyLocalSessionToken(`${token}alterado`)).toBeNull();
  });
});
