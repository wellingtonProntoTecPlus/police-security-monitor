import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

function createAuthenticatedContext(): TrpcContext {
  return {
    user: {
      id: 77,
      openId: "audio-operator",
      email: "operador@example.com",
      name: "Operador de Teste",
      loginMethod: "local",
      role: "operator",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "http", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("auth.verifyPassword", () => {
  afterEach(() => vi.restoreAllMocks());

  it("confirma a senha do próprio usuário autenticado", async () => {
    const password = "SenhaSegura123";
    vi.spyOn(db, "getUserById").mockResolvedValue({
      ...createAuthenticatedContext().user!,
      password: await bcrypt.hash(password, 4),
    } as any);

    const caller = appRouter.createCaller(createAuthenticatedContext());

    await expect(caller.auth.verifyPassword({ password })).resolves.toEqual({ success: true });
    expect(db.getUserById).toHaveBeenCalledWith(77);
  });

  it("rejeita uma senha diferente sem desativar o controle de segurança", async () => {
    vi.spyOn(db, "getUserById").mockResolvedValue({
      ...createAuthenticatedContext().user!,
      password: await bcrypt.hash("SenhaCorreta123", 4),
    } as any);

    const caller = appRouter.createCaller(createAuthenticatedContext());

    await expect(caller.auth.verifyPassword({ password: "SenhaIncorreta" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Senha inválida",
    });
  });
});
