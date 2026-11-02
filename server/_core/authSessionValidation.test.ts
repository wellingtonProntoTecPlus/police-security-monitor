import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthSessionValidationTimeoutError,
  withAuthSessionValidationTimeout,
} from "./authSessionValidation";

describe("withAuthSessionValidationTimeout", () => {
  afterEach(() => vi.useRealTimers());

  it("mantém a validação quando o banco responde dentro do prazo", async () => {
    await expect(withAuthSessionValidationTimeout(Promise.resolve("sessão ativa"), 50))
      .resolves.toBe("sessão ativa");
  });

  it("interrompe a espera da validação quando o banco não responde no prazo", async () => {
    vi.useFakeTimers();
    const pending = withAuthSessionValidationTimeout(new Promise<never>(() => {}), 25);

    const expectation = expect(pending).rejects.toBeInstanceOf(AuthSessionValidationTimeoutError);
    await vi.advanceTimersByTimeAsync(25);
    await expectation;
  });
});
