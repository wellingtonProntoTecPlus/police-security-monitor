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

  it("salva evento e incidente, retornando o identificador persistido diretamente", async () => {
    vi.spyOn(db, "createAlarmEvent").mockResolvedValue({ id: 901 } as any);
    vi.spyOn(db, "createIncident").mockResolvedValue({ id: 456 } as any);

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

    expect(db.createAlarmEvent).toHaveBeenCalledWith(expect.objectContaining({
      account: "PS0001",
      qualifier: "E",
      eventCode: "MANUAL",
      receiverPort: 9112,
      remoteIp: "MANUAL",
    }));
    expect(db.createIncident).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 901,
      alarmSystemId: 12,
      clientId: 34,
      status: "waiting",
      priority: "high",
    }));
    expect(result).toMatchObject({ id: 901, incidentId: 456, incidentStatus: "waiting" });
  });
});
