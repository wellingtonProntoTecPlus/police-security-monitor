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
const ownClientInput = { partnerCompanyId: 99, type: "pf" as const, name: "Cliente próprio" };
afterEach(() => vi.restoreAllMocks());

describe("partner tenant access", () => {
  it("partner reads complete status of its own clients, while create forces own partnerId and active status", async () => {
    const list = vi.spyOn(db, "listClients").mockResolvedValue([{
      id: 101,
      partnerCompanyId: 99,
      name: "Cliente próprio",
      isActive: false,
      monitoringStatus: "suspended",
      monitoringStatusReason: "motivo interno",
      monitoringStatusUntil: new Date(),
    } as any]);
    vi.spyOn(db, "getClient").mockResolvedValue({
      id: 101,
      partnerCompanyId: 99,
      name: "Cliente próprio",
      isActive: false,
      monitoringStatus: "blocked",
      monitoringStatusReason: "motivo interno",
      monitoringStatusUntil: null,
    } as any);
    const create = vi.spyOn(db, "createClient").mockResolvedValue({ id: 101 });
    const caller = appRouter.createCaller(context("partner", 99));
    const listed = await caller.monitoredClient.list({ partnerCompanyId: 200, monitoringStatus: "active" });
    const fetched = await caller.monitoredClient.get({ id: 101 });
    await caller.monitoredClient.create(ownClientInput);
    expect(list).toHaveBeenCalledWith(99, "active");
    expect(listed[0]).toMatchObject({ isActive: false, monitoringStatus: "suspended", monitoringStatusReason: "motivo interno" });
    expect(fetched).toMatchObject({ isActive: false, monitoringStatus: "blocked", monitoringStatusReason: "motivo interno" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ partnerCompanyId: 99, monitoringStatus: "active", monitoringStatusReason: null, monitoringStatusUntil: null, isActive: true }), { confirmPartnerDocumentReuse: undefined });
  });

  it("rejects forged partnerId, a partner without partnerId, cross-tenant update, and status changes", async () => {
    const create = vi.spyOn(db, "createClient").mockResolvedValue({ id: 102 });
    const update = vi.spyOn(db, "updateClient").mockResolvedValue(undefined);
    vi.spyOn(db, "getClient").mockResolvedValue({ id: 202, partnerCompanyId: 200 } as any);
    const caller = appRouter.createCaller(context("partner", 99));
    await expect(caller.monitoredClient.create({ ...ownClientInput, partnerCompanyId: 200 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context("partner")).monitoredClient.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.monitoredClient.update({ id: 202, name: "Intruso" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.monitoredClient.update({ id: 202, partnerCompanyId: 99 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(create).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it("rejects modifying a resource ID belonging to client B", async () => {
    vi.spyOn(db, "getCamera").mockResolvedValue({ id: 501, clientId: 202 } as any);
    vi.spyOn(db, "getClient").mockResolvedValue({ id: 202, partnerCompanyId: 200 } as any);
    const update = vi.spyOn(db, "updateCamera").mockResolvedValue(undefined);
    await expect(appRouter.createCaller(context("partner", 99)).camera.update({ id: 501, name: "Intrusa" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(update).not.toHaveBeenCalled();
  });

  it("allows the responsible partner to create, read, update and delete DVR records including its own DVR password", async () => {
    vi.spyOn(db, "getClient").mockResolvedValue({ id: 101, partnerCompanyId: 99 } as any);
    vi.spyOn(db, "getClientDvr").mockResolvedValue({ id: 601, clientId: 101 } as any);
    const list = vi.spyOn(db, "listClientDvrs").mockResolvedValue([{ id: 601, clientId: 101, brand: "Intelbras", password: "senha-do-dvr" }] as any);
    const create = vi.spyOn(db, "createClientDvr").mockResolvedValue({ id: 602 });
    const update = vi.spyOn(db, "updateClientDvr").mockResolvedValue(undefined);
    const remove = vi.spyOn(db, "deleteClientDvr").mockResolvedValue(undefined);
    const partner = appRouter.createCaller(context("partner", 99));

    const rows = await partner.dvr.list({ clientId: 101 });
    await partner.dvr.create({ clientId: 101, brand: "Intelbras", password: "nova-senha" });
    await partner.dvr.update({ id: 601, model: "MHDX", password: "senha-atualizada" });
    await partner.dvr.delete({ id: 601 });

    expect(list).toHaveBeenCalledWith(101, true);
    expect(rows[0]).toMatchObject({ brand: "Intelbras", password: "senha-do-dvr" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ clientId: 101, password: "nova-senha" }));
    expect(update).toHaveBeenCalledWith(601, expect.objectContaining({ model: "MHDX", password: "senha-atualizada" }));
    expect(remove).toHaveBeenCalledWith(601);
  });

  it("denies DVR records belonging to another partner and never returns DVR password to operational non-admin roles", async () => {
    const partnerList = vi.spyOn(db, "listClientDvrs").mockResolvedValue([]);
    vi.spyOn(db, "getClientDvr").mockResolvedValue({ id: 602, clientId: 202 } as any);
    vi.spyOn(db, "getClient").mockResolvedValue({ id: 202, partnerCompanyId: 200 } as any);
    const update = vi.spyOn(db, "updateClientDvr").mockResolvedValue(undefined);
    const remove = vi.spyOn(db, "deleteClientDvr").mockResolvedValue(undefined);
    const partner = appRouter.createCaller(context("partner", 99));
    await expect(partner.dvr.list({ clientId: 202 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner.dvr.update({ id: 602, password: "tentativa" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner.dvr.delete({ id: 602 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    vi.mocked(db.getClient).mockResolvedValue({ id: 101, partnerCompanyId: 99 } as any);
    partnerList.mockResolvedValueOnce([{ id: 603, clientId: 101, brand: "Intelbras" }] as any);
    const operatorRows = await appRouter.createCaller(context("operator")).dvr.list({ clientId: 101 });
    expect(partnerList).not.toHaveBeenCalledWith(202, true);
    expect(db.listClientDvrs).toHaveBeenLastCalledWith(101, false);
    expect(operatorRows[0]).not.toHaveProperty("password");
    await expect(appRouter.createCaller(context("operator")).dvr.create({ clientId: 101, brand: "Intelbras", password: "nao-permitida" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant contact, zone, panel user, camera, and holiday mutations by record ID", async () => {
    const partner = appRouter.createCaller(context("partner", 99));
    vi.spyOn(db, "getClientContact").mockResolvedValue({ id: 501, clientId: 202, alarmSystemId: 701 } as any);
    vi.spyOn(db, "getAlarmZone").mockResolvedValue({ id: 502, alarmSystemId: 701 } as any);
    vi.spyOn(db, "getAlarmUser").mockResolvedValue({ id: 503, alarmSystemId: 701 } as any);
    vi.spyOn(db, "getCamera").mockResolvedValue({ id: 504, clientId: 202 } as any);
    vi.spyOn(db, "getPartnerHoliday").mockResolvedValue({ id: 505, partnerCompanyId: 200 } as any);
    vi.spyOn(db, "getAlarmSystem").mockResolvedValue({ id: 701, clientId: 202 } as any);
    vi.spyOn(db, "getClient").mockResolvedValue({ id: 202, partnerCompanyId: 200 } as any);
    const removeContact = vi.spyOn(db, "deleteClientContact").mockResolvedValue(undefined);
    const removeZone = vi.spyOn(db, "deleteAlarmZone").mockResolvedValue(undefined);
    const removeUser = vi.spyOn(db, "deleteAlarmUser").mockResolvedValue(undefined);
    const removeCamera = vi.spyOn(db, "deleteCamera").mockResolvedValue(undefined);
    const removeHoliday = vi.spyOn(db, "deletePartnerHoliday").mockResolvedValue(undefined);

    await expect(partner.clientContact.delete({ id: 501 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner.alarmZone.delete({ id: 502 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner.alarmUser.delete({ id: 503 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner.camera.delete({ id: 504 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner.partnerHoliday.delete({ id: 505 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect([removeContact, removeZone, removeUser, removeCamera, removeHoliday].every((remove) => remove.mock.calls.length === 0)).toBe(true);
  });

  it("creates a partner system only for its client and strips Keep Alive policy from the request", async () => {
    vi.spyOn(db, "getClient").mockResolvedValue({ id: 301, partnerCompanyId: 99 } as any);
    const create = vi.spyOn(db, "createAlarmSystem").mockResolvedValue({ id: 401 });
    const caller = appRouter.createCaller(context("partner", 99));
    await caller.alarmSystem.create({
      clientId: 301,
      account: "0123",
      brand: "COMPATEC",
      macAddress: "C1BDCB",
      receiverPort: 9271,
      keepAliveMonitoringEnabled: false,
      keepAliveOfflineAfterMinutes: 123,
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ clientId: 301, account: "0123", brand: "COMPATEC" }));
    expect(create.mock.calls[0][0]).not.toHaveProperty("keepAliveMonitoringEnabled");
    expect(create.mock.calls[0][0]).not.toHaveProperty("keepAliveOfflineAfterMinutes");
  });

  it("returns complete system records in its own carteira and rejects changes to Keep Alive policy", async () => {
    vi.spyOn(db, "getClient").mockResolvedValue({ id: 301, partnerCompanyId: 99 } as any);
    const internalSystem = {
      id: 401,
      clientId: 301,
      account: "0123",
      brand: "COMPATEC",
      isActive: false,
      isOnline: true,
      lastCommunication: new Date(),
      keepAliveMonitoringEnabled: true,
      keepAliveExpectedIntervalSeconds: 60,
      maintenanceNotes: "nota interna",
      remoteCommandLabEnabled: true,
    } as any;
    vi.spyOn(db, "listAlarmSystems").mockResolvedValue([internalSystem]);
    vi.spyOn(db, "getAlarmSystem").mockResolvedValue(internalSystem);
    const update = vi.spyOn(db, "updateAlarmSystem").mockResolvedValue(undefined);
    const partner = appRouter.createCaller(context("partner", 99));

    const listed = await partner.alarmSystem.list({ clientId: 301 });
    const fetched = await partner.alarmSystem.get({ id: 401 });
    for (const system of [listed[0], fetched]) {
      expect(system).toMatchObject({
        id: 401,
        account: "0123",
        brand: "COMPATEC",
        isActive: false,
        isOnline: true,
        keepAliveExpectedIntervalSeconds: 60,
        maintenanceNotes: "nota interna",
        remoteCommandLabEnabled: true,
      });
    }
    await expect(partner.alarmSystem.update({ id: 401, keepAliveExpectedIntervalSeconds: 300 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(update).not.toHaveBeenCalled();
  });

  it("allows partner registration of related tabs only for its own client and alarm system", async () => {
    vi.spyOn(db, "getClient").mockResolvedValue({ id: 301, partnerCompanyId: 99 } as any);
    vi.spyOn(db, "getAlarmSystem").mockResolvedValue({ id: 401, clientId: 301 } as any);
    const zone = vi.spyOn(db, "createAlarmZone").mockResolvedValue({ id: 501 });
    const panelUser = vi.spyOn(db, "createAlarmUser").mockResolvedValue({ id: 502 });
    const contact = vi.spyOn(db, "createClientContact").mockResolvedValue({ id: 503 });
    const camera = vi.spyOn(db, "createCamera").mockResolvedValue({ id: 504 });
    const schedule = vi.spyOn(db, "upsertAlarmSchedule").mockResolvedValue({ id: 505 } as any);
    const holiday = vi.spyOn(db, "createPartnerHoliday").mockResolvedValue({ id: 506 });
    const caller = appRouter.createCaller(context("partner", 99));

    await caller.alarmZone.create({ alarmSystemId: 401, zoneNumber: 1, name: "Porta" });
    await caller.alarmUser.create({ alarmSystemId: 401, userNumber: 1, name: "Wellington" });
    await caller.clientContact.create({ clientId: 301, alarmSystemId: 401, name: "Contato" });
    await caller.camera.create({ clientId: 301, name: "Entrada", rtspUrl: "rtsp://camera.example.invalid/stream" });
    await caller.alarmSchedule.save({ alarmSystemId: 401, isActive: true });
    await caller.partnerHoliday.create({ partnerCompanyId: 99, name: "Feriado local", date: "2026-12-08" });

    expect(zone).toHaveBeenCalledTimes(1);
    expect(panelUser).toHaveBeenCalledTimes(1);
    expect(contact).toHaveBeenCalledTimes(1);
    expect(camera).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(holiday).toHaveBeenCalledWith(expect.objectContaining({ partnerCompanyId: 99, name: "Feriado local" }));
  });

  it("reveals full credentials and camera URLs only inside the partner's own carteira", async () => {
    vi.spyOn(db, "getClient").mockImplementation(async (id) => ({ id, partnerCompanyId: id === 301 ? 99 : 200 } as any));
    vi.spyOn(db, "getAlarmSystem").mockImplementation(async (id) => ({ id, clientId: id === 401 ? 301 : 302 } as any));
    vi.spyOn(db, "listClientContacts").mockResolvedValue([{ id: 501, password: "senha-contato", counterPassword: "contra", coercionPassword: "coacao" }] as any);
    vi.spyOn(db, "listAlarmUsers").mockResolvedValue([{ id: 502, password: "senha-painel", counterPassword: "contra-painel", coercionPassword: "coacao-painel" }] as any);
    vi.spyOn(db, "listCameras").mockResolvedValue([{ id: 503, rtspUrl: "rtsp://user:pass@camera.example.invalid/live" }] as any);
    const partner = appRouter.createCaller(context("partner", 99));

    const contacts = await partner.clientContact.list({ clientId: 301, alarmSystemId: 401 });
    const panelUsers = await partner.alarmUser.list({ alarmSystemId: 401 });
    const cameras = await partner.camera.list({ clientId: 301 });
    expect(contacts[0]).toMatchObject({ password: "senha-contato", counterPassword: "contra", coercionPassword: "coacao" });
    expect(panelUsers[0]).toMatchObject({ password: "senha-painel", counterPassword: "contra-painel", coercionPassword: "coacao-painel" });
    expect(cameras[0].rtspUrl).toBe("rtsp://user:pass@camera.example.invalid/live");

    await expect(partner.clientContact.list({ clientId: 302 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner.alarmUser.list({ alarmSystemId: 402 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner.camera.list({ clientId: 302 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects alarm schedule creation for a system belonging to partner B before the write", async () => {
    vi.spyOn(db, "getAlarmSystem").mockResolvedValue({ id: 701, clientId: 202 } as any);
    vi.spyOn(db, "getClient").mockResolvedValue({ id: 202, partnerCompanyId: 200 } as any);
    const create = vi.spyOn(db, "createAlarmSchedule").mockResolvedValue({ id: 801 });
    await expect(appRouter.createCaller(context("partner", 99)).alarmSchedule.create({ alarmSystemId: 701 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(create).not.toHaveBeenCalled();
  });

  it("queries minimal status only for the partner's own systems, including inactive records as unmonitored", async () => {
    vi.spyOn(db, "getClient")
      .mockResolvedValueOnce({ id: 301, partnerCompanyId: 99, isActive: true } as any)
      .mockResolvedValueOnce({ id: 302, partnerCompanyId: 200, isActive: true } as any);
    const result = [{ id: 401, connectionStatus: "online" }];
    const status = vi.spyOn(db, "listSystemsConnectionStatus").mockResolvedValue(result as any);
    const caller = appRouter.createCaller(context("partner", 99));
    await expect(caller.alarmSystem.clientConnectionStatus({ clientId: 301 })).resolves.toEqual(result);
    expect(status).toHaveBeenCalledWith(expect.any(Date), { clientId: 301, partnerCompanyId: 99, includeInactive: true });
    await expect(caller.alarmSystem.clientConnectionStatus({ clientId: 302 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(status).toHaveBeenCalledTimes(1);
  });

  it("blocks formal reports and global/physical commands for partner", async () => {
    const partner = appRouter.createCaller(context("partner", 99));
    await expect(partner.alarmEvent.report({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner.alarmEvent.connectionReport({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner.alarmSchedule.report({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner.occurrence.operatorNames()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner.occurrence.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner.occurrence.getById({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner.alarmSystem.getByAccount({ account: "0001" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner.dashboard.stats()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(partner.remoteCommand.list({ alarmSystemId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps admin, supervisor, and operator client creation semantics", async () => {
    const create = vi.spyOn(db, "createClient").mockResolvedValue({ id: 103 });
    await appRouter.createCaller(context("admin")).monitoredClient.create({ ...ownClientInput, partnerCompanyId: 200, monitoringStatus: "suspended" });
    await appRouter.createCaller(context("supervisor")).monitoredClient.create({ ...ownClientInput, partnerCompanyId: 201, monitoringStatus: "blocked" });
    await appRouter.createCaller(context("operator")).monitoredClient.create({ ...ownClientInput, partnerCompanyId: 202, monitoringStatus: "suspended" });
    expect(create).toHaveBeenNthCalledWith(1, { ...ownClientInput, partnerCompanyId: 200, monitoringStatus: "suspended" }, { confirmPartnerDocumentReuse: undefined });
    expect(create).toHaveBeenNthCalledWith(2, { ...ownClientInput, partnerCompanyId: 201, monitoringStatus: "blocked" }, { confirmPartnerDocumentReuse: undefined });
    expect(create).toHaveBeenNthCalledWith(3, { ...ownClientInput, partnerCompanyId: 202, monitoringStatus: "suspended" }, { confirmPartnerDocumentReuse: undefined });
  });

  it("omits password hashes from auth.me", async () => {
    const result = await appRouter.createCaller(context("partner", 99)).auth.me();
    expect(result).not.toHaveProperty("password");
    expect(result).toMatchObject({ role: "partner", partnerId: 99 });
  });
});
