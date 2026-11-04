import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as shiftDb from "./operatorShiftDb";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

function context(role = "operator") {
  const clearCookie = vi.fn();
  const ctx = {
    user: { id: 1, name: "Amanda", role, openId: "test-only", email: "test@example.invalid" },
    authSessionId: 101, authSessionTokenHash: "test-token-not-a-credential", authSessionInvalid: false,
    authSessionValidationTimedOut: false,
    req: { protocol: "https", headers: {} }, res: { clearCookie },
  } as unknown as TrpcContext;
  return { ctx, clearCookie };
}

describe("rotas de escala e saída segura", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("mantém cookie e sessão quando o banco recusa logoff por pendência", async () => {
    const end = vi.spyOn(shiftDb, "endOperatorSessionWithHandoff").mockRejectedValue(new Error("Anotação obrigatória"));
    const revoke = vi.spyOn(db, "revokeAuthSessionByTokenHash").mockResolvedValue([]);
    const { ctx, clearCookie } = context();
    await expect(appRouter.createCaller(ctx).auth.logout()).rejects.toThrow("Anotação obrigatória");
    expect(end).toHaveBeenCalledWith(expect.objectContaining({ userId: 1, authSessionId: 101, handoffs: [] }));
    expect(revoke).not.toHaveBeenCalled();
    expect(clearCookie).not.toHaveBeenCalled();
  });

  it("timeout de autenticação falha antes de gravar ou limpar cookie", async () => {
    const end = vi.spyOn(shiftDb, "endOperatorSessionWithHandoff");
    const { ctx, clearCookie } = context(); ctx.authSessionValidationTimedOut = true;
    await expect(appRouter.createCaller(ctx).auth.logout()).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(end).not.toHaveBeenCalled(); expect(clearCookie).not.toHaveBeenCalled();
  });

  it("sessão operacional sem id não contorna a passagem pela revogação simples", async () => {
    const revoke = vi.spyOn(db, "revokeAuthSessionByTokenHash");
    const { ctx, clearCookie } = context(); ctx.authSessionId = undefined;
    await expect(appRouter.createCaller(ctx).auth.logout()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(revoke).not.toHaveBeenCalled(); expect(clearCookie).not.toHaveBeenCalled();
  });

  it("só limpa cookie após transação aprovada e não aceita operador remetente arbitrário", async () => {
    const end = vi.spyOn(shiftDb, "endOperatorSessionWithHandoff").mockResolvedValue({ success: true, revokedSessionIds: [101], messages: [] });
    const { ctx, clearCookie } = context();
    const handoff = { incidentId: 401, toUserId: 2, message: "Cliente aguarda restabelecimento da energia", observationUntil: new Date("2027-01-01T12:00:00Z") };
    expect(await appRouter.createCaller(ctx).auth.logout({ handoffs: [handoff] })).toEqual({ success: true });
    expect(end).toHaveBeenCalledWith(expect.objectContaining({ userId: 1, operatorName: "Amanda", handoffs: [handoff] }));
    expect(clearCookie).toHaveBeenCalledOnce();
  });

  it("parceiro não consulta dados de escala/presença nem envia recados internos", async () => {
    const { ctx } = context("partner");
    const caller = appRouter.createCaller(ctx);
    await expect(caller.operatorShift.report({ fromDate: "2026-11-01", toDate: "2026-11-30" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.operatorShift.sendMessage({ toUserId: 2, message: "Não pode acessar recado operacional" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
