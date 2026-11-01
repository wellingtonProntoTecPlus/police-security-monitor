import { describe, expect, it } from "vitest";
import { createAuthSessionToken, hashAuthSessionToken } from "./_core/localSession";

describe("sessão operacional por usuário", () => {
  it("gera tokens imprevisíveis e distintos", () => {
    const first = createAuthSessionToken();
    const second = createAuthSessionToken();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("produz hash SHA-256 determinístico sem retornar o token bruto", () => {
    const token = createAuthSessionToken();
    const hash = hashAuthSessionToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(token);
    expect(hashAuthSessionToken(token)).toBe(hash);
  });
});
