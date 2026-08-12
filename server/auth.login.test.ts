import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

describe("auth.login", () => {
  afterEach(() => vi.restoreAllMocks());

  it("aceita a mesma senha cadastrada do usuário e atualiza a sessão", async () => {
    const password = "SenhaConfirmada123";
    const cookieCalls: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
    vi.spyOn(db, "getUserByEmail").mockResolvedValue({
      id: 15,
      openId: "login-audio",
      email: "operador@example.com",
      name: "Operador",
      loginMethod: "local",
      role: "operator",
      password: await bcrypt.hash(password, 4),
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as any);
    vi.spyOn(db, "updateUserLastSignedIn").mockResolvedValue(undefined as any);

    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "http", headers: {} } as TrpcContext["req"],
      res: {
        cookie: (name: string, value: string, options: Record<string, unknown>) => cookieCalls.push({ name, value, options }),
      } as TrpcContext["res"],
    };

    const result = await appRouter.createCaller(ctx).auth.login({ email: "operador@example.com", password });

    expect(result).toMatchObject({ success: true, user: { id: 15, email: "operador@example.com" } });
    expect(cookieCalls).toHaveLength(1);
    expect(db.updateUserLastSignedIn).toHaveBeenCalledWith(15);
  });
});
