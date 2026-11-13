import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

function context(role: "admin" | "supervisor" | "operator"): TrpcContext {
  return {
    user: { id: 1, openId: `dvr-${role}`, email: "test@example.invalid", name: role, role, partnerId: null,
      loginMethod: "test", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), password: null },
    req: { protocol: "https", headers: {} }, res: { clearCookie: () => undefined },
    authSessionId: null, authSessionTokenHash: null, authSessionInvalid: false,
  } as unknown as TrpcContext;
}
function fixture() {
  vi.spyOn(db, "getClient").mockResolvedValue({ id: 101, partnerCompanyId: 99 } as any);
  vi.spyOn(db, "getClientDvr").mockResolvedValue({ id: 601, clientId: 101 } as any);
}
afterEach(() => vi.restoreAllMocks());

describe("DVR administrative credentials and port validation", () => {
  it("allows the Administrator to read and replace the saved credential", async () => {
    fixture();
    const list = vi.spyOn(db, "listClientDvrs").mockResolvedValue([{ id: 601, clientId: 101, password: "admin-secret" }] as any);
    const update = vi.spyOn(db, "updateClientDvr").mockResolvedValue(undefined);
    const admin = appRouter.createCaller(context("admin"));
    expect((await admin.dvr.list({ clientId: 101 }))[0]).toMatchObject({ password: "admin-secret" });
    expect(list).toHaveBeenCalledWith(101, true);
    await admin.dvr.update({ id: 601, password: "new-admin-secret" });
    expect(update).toHaveBeenCalledWith(601, { password: "new-admin-secret" });
  });

  it("does not permit operational users to read or alter a DVR credential", async () => {
    fixture();
    const list = vi.spyOn(db, "listClientDvrs").mockResolvedValue([{ id: 601, clientId: 101 }] as any);
    const update = vi.spyOn(db, "updateClientDvr").mockResolvedValue(undefined);
    for (const role of ["supervisor", "operator"] as const) {
      const caller = appRouter.createCaller(context(role));
      expect((await caller.dvr.list({ clientId: 101 }))[0]).not.toHaveProperty("password");
      expect(list).toHaveBeenLastCalledWith(101, false);
      await expect(caller.dvr.update({ id: 601, password: "forbidden" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(update).not.toHaveBeenCalled();
  });

  it("validates every port and rejects invalid client IDs before persisting any DVR", async () => {
    fixture();
    const create = vi.spyOn(db, "createClientDvr").mockResolvedValue({ id: 601 });
    const caller = appRouter.createCaller(context("admin"));
    for (const field of ["tcpPort", "udpPort", "httpPort", "rtspPort", "httpsPort", "serverPort"]) {
      for (const value of [0, -1, 65536, 2.5]) {
        await expect(caller.dvr.create({ clientId: 101, brand: "Intelbras", [field]: value })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }
    }
    await expect(caller.dvr.create({ clientId: 0, brand: "Intelbras" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.dvr.create({ clientId: 101, brand: " " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(create).not.toHaveBeenCalled();
    await caller.dvr.create({ clientId: 101, brand: "Intelbras", tcpPort: 1, udpPort: 65535, httpPort: null });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ tcpPort: 1, udpPort: 65535, httpPort: null }));
  });

  it("does not report successful registration for a nonexistent customer or DVR", async () => {
    vi.spyOn(db, "getClient").mockResolvedValue(undefined);
    vi.spyOn(db, "getClientDvr").mockResolvedValue(undefined);
    const create = vi.spyOn(db, "createClientDvr").mockResolvedValue({ id: 601 });
    const update = vi.spyOn(db, "updateClientDvr").mockResolvedValue(undefined);
    const caller = appRouter.createCaller(context("admin"));
    await expect(caller.dvr.create({ clientId: 101, brand: "Intelbras" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.dvr.update({ id: 601, model: "model" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
