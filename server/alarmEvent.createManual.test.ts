import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

function createOperatorContext(): TrpcContext {
  return {
    user: {
      id: 44,
      openId: "manual-event-operator",
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

describe("alarmEvent.createManual", () => {
  afterEach(() => vi.restoreAllMocks());

  it("resolve a conta cadastrada e salva evento e incidente em uma única operação", async () => {
    vi.spyOn(db, "getAlarmSystemByManualAccount").mockResolvedValue({
      id: 12, clientId: 34, account: "PS0001", brand: "Compatec", receiverPort: 9112,
    } as any);
    vi.spyOn(db, "getClient").mockResolvedValue({ id: 34, name: "Cliente de Teste", fantasyName: "Cliente Teste" } as any);
    vi.spyOn(db, "createAlarmEventWithOpenIncident").mockResolvedValue({ eventId: 901, incidentId: 456 });

    const caller = appRouter.createCaller(createOperatorContext());
    const result = await caller.alarmEvent.createManual({
      account: "PS0001",
      alarmSystemId: 12,
      clientId: 34,
      brand: "Compatec",
      description: "Ocorrência incluída pelo operador",
      priority: "high",
      receiverPort: 9112,
    });

    expect(db.createAlarmEventWithOpenIncident).toHaveBeenCalledWith(expect.objectContaining({
      event: expect.objectContaining({ account: "PS0001", qualifier: "E", eventCode: "MANUAL", receiverPort: 9112, remoteIp: "MANUAL" }),
      incident: expect.objectContaining({ alarmSystemId: 12, clientId: 34, status: "waiting", priority: "high" }),
    }));
    expect(result).toMatchObject({ id: 901, incidentId: 456, account: "PS0001", clientName: "Cliente Teste", incidentStatus: "waiting" });
  });
});
