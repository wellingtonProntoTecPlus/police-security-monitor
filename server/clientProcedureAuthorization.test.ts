import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

function context(role: "admin" | "supervisor" | "operator" | "partner", partnerId?: number): TrpcContext {
  return {
    user: {
      id: role === "admin" ? 1 : role === "operator" ? 2 : role === "supervisor" ? 3 : 4,
      openId: `${role}-user`, email: `${role}@test.invalid`, name: role, loginMethod: "test", role,
      ...(partnerId === undefined ? {} : { partnerId }),
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), password: "hash-secret",
    } as any,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
    authSessionId: null, authSessionTokenHash: null, authSessionInvalid: false,
  };
}

const ownClient = { id: 101, partnerCompanyId: 99 } as any;
const ownProcedure = {
  id: 401, clientId: 101, procedureType: "alarm", title: "Verificar sensor",
  description: "Ligar para o responsável.", priority: 2, isActive: true,
} as any;
const createInput = {
  clientId: 101, procedureType: "alarm" as const, title: "  Verificar sensor  ",
  description: "  Ligar para o responsável.  ", priority: 2,
};

afterEach(() => vi.restoreAllMocks());

describe("clientProcedure authorization and tenant scope", () => {
  it("allows a partner to list and create, update, and deactivate procedures for its own client", async () => {
    vi.spyOn(db, "getClient").mockResolvedValue(ownClient);
    vi.spyOn(db, "listClientProcedures").mockResolvedValue([ownProcedure]);
    const create = vi.spyOn(db, "createClientProcedure").mockResolvedValue({ id: 402 });
    vi.spyOn(db, "getClientProcedure").mockResolvedValue(ownProcedure);
    const update = vi.spyOn(db, "updateClientProcedure").mockResolvedValue({ success: true });
    const caller = appRouter.createCaller(context("partner", 99));

    await expect(caller.clientProcedure.list({ clientId: 101 })).resolves.toEqual([ownProcedure]);
    await caller.clientProcedure.create(createInput);
    // clientId is intentionally not an update field; an extra clientId is stripped by the input schema.
    await caller.clientProcedure.update({ id: 401, title: "  Sensor revisado  ", clientId: 202 } as any);
    await caller.clientProcedure.deactivate({ id: 401 });

    expect(db.listClientProcedures).toHaveBeenCalledWith(101);
    expect(create).toHaveBeenCalledWith({
      clientId: 101, procedureType: "alarm", title: "Verificar sensor",
      description: "Ligar para o responsável.", priority: 2,
    });
    expect(update).toHaveBeenNthCalledWith(1, 401, 101, { title: "Sensor revisado" });
    expect(update).toHaveBeenNthCalledWith(2, 401, 101, { isActive: false });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("rejects another partner's client on list, create, update, and deactivate before database writes", async () => {
    vi.spyOn(db, "getClient").mockImplementation(async id => ({
      id, partnerCompanyId: id === 101 ? 99 : 200,
    } as any));
    const list = vi.spyOn(db, "listClientProcedures").mockResolvedValue([]);
    const create = vi.spyOn(db, "createClientProcedure").mockResolvedValue({ id: 402 });
    vi.spyOn(db, "getClientProcedure").mockResolvedValue({ ...ownProcedure, clientId: 202 } as any);
    const update = vi.spyOn(db, "updateClientProcedure").mockResolvedValue({ success: true });
    const caller = appRouter.createCaller(context("partner", 99));

    await expect(caller.clientProcedure.list({ clientId: 202 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.clientProcedure.create({ ...createInput, clientId: 202 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.clientProcedure.update({ id: 401, title: "Tentativa" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.clientProcedure.deactivate({ id: 401 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(list).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("forbids a partner without partnerId", async () => {
    const list = vi.spyOn(db, "listClientProcedures").mockResolvedValue([]);
    const caller = appRouter.createCaller(context("partner"));

    await expect(caller.clientProcedure.list({ clientId: 101 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.clientProcedure.create(createInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(list).not.toHaveBeenCalled();
  });

  it("allows operators to read but forbids operator create, update, and deactivate", async () => {
    vi.spyOn(db, "listClientProcedures").mockResolvedValue([ownProcedure]);
    const create = vi.spyOn(db, "createClientProcedure").mockResolvedValue({ id: 402 });
    const get = vi.spyOn(db, "getClientProcedure").mockResolvedValue(ownProcedure);
    const update = vi.spyOn(db, "updateClientProcedure").mockResolvedValue({ success: true });
    const caller = appRouter.createCaller(context("operator"));

    await expect(caller.clientProcedure.list({ clientId: 101 })).resolves.toEqual([ownProcedure]);
    await expect(caller.clientProcedure.create(createInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.clientProcedure.update({ id: 401, title: "Tentativa" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.clientProcedure.deactivate({ id: 401 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(create).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("allows a supervisor to manage procedures", async () => {
    vi.spyOn(db, "getClient").mockResolvedValue(ownClient);
    const create = vi.spyOn(db, "createClientProcedure").mockResolvedValue({ id: 402 });

    await appRouter.createCaller(context("supervisor")).clientProcedure.create(createInput);
    expect(create).toHaveBeenCalledWith({
      clientId: 101, procedureType: "alarm", title: "Verificar sensor",
      description: "Ligar para o responsável.", priority: 2,
    });
  });

  it("allows an admin to query event treatment and delegates both IDs unchanged", async () => {
    const result = { clientId: 101, eventId: 9001, eventType: "alarm", procedures: [ownProcedure], hasSpecificProcedure: true };
    const treatment = vi.spyOn(db, "getClientProcedureTreatment").mockResolvedValue(result as any);

    await expect(appRouter.createCaller(context("admin")).clientProcedure.treatment({ clientId: 101, eventId: 9001 })).resolves.toEqual(result);
    expect(treatment).toHaveBeenCalledOnce();
    expect(treatment).toHaveBeenCalledWith(101, 9001);
  });

  it("allows an operator to read an event treatment", async () => {
    const result = { clientId: 101, eventId: 9001, eventType: "alarm", procedures: [ownProcedure], hasSpecificProcedure: true };
    const treatment = vi.spyOn(db, "getClientProcedureTreatment").mockResolvedValue(result as any);

    await expect(appRouter.createCaller(context("operator")).clientProcedure.treatment({ clientId: 101, eventId: 9001 })).resolves.toEqual(result);
    expect(treatment).toHaveBeenCalledWith(101, 9001);
  });

  it("forbids a partner from querying event treatment", async () => {
    const treatment = vi.spyOn(db, "getClientProcedureTreatment").mockResolvedValue({} as any);

    await expect(appRouter.createCaller(context("partner", 99)).clientProcedure.treatment({ clientId: 101, eventId: 9001 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(treatment).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when updating or deactivating a missing procedure", async () => {
    vi.spyOn(db, "getClientProcedure").mockResolvedValue(undefined);
    const update = vi.spyOn(db, "updateClientProcedure").mockResolvedValue({ success: true });
    const caller = appRouter.createCaller(context("admin"));

    await expect(caller.clientProcedure.update({ id: 999, title: "Não existe" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.clientProcedure.deactivate({ id: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(update).not.toHaveBeenCalled();
  });

  it("validates non-empty text, procedure type, and priority on create and update", async () => {
    const create = vi.spyOn(db, "createClientProcedure").mockResolvedValue({ id: 402 });
    const update = vi.spyOn(db, "updateClientProcedure").mockResolvedValue({ success: true });
    const caller = appRouter.createCaller(context("admin"));

    const invalidCreates = [
      { ...createInput, title: "   " },
      { ...createInput, description: "   " },
      { ...createInput, procedureType: "invalid" },
      { ...createInput, priority: 0 },
      { ...createInput, priority: 1001 },
    ];
    for (const input of invalidCreates) {
      await expect(caller.clientProcedure.create(input as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }

    const invalidUpdates = [
      { id: 401, title: "   " },
      { id: 401, description: "   " },
      { id: 401, procedureType: "invalid" },
      { id: 401, priority: 0 },
      { id: 401, priority: 1001 },
    ];
    for (const input of invalidUpdates) {
      await expect(caller.clientProcedure.update(input as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
