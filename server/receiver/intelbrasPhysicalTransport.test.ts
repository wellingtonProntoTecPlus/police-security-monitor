import { EventEmitter } from "node:events";
import net from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildIntelbrasRemoteKeepAliveFrame } from "../intelbrasCommandSimulation";

const db = vi.hoisted(() => ({
  getAlarmRemoteCredentialForTransport: vi.fn(),
  getAlarmSystem: vi.fn(),
  getLatestArmDisarmStatusForSystem: vi.fn(),
  getPendingIntelbrasPhysicalCommand: vi.fn(),
  recordRemoteCommandConfirmation: vi.fn(),
  updateAlarmRemoteCommandDelivery: vi.fn(),
}));

vi.mock("../db", () => db);

import { buildIntelbrasPhysicalPayload } from "./intelbrasIsecProgramTransport";
import {
  clearIntelbrasTransportForTesting,
  consumeIntelbrasPhysicalResponse,
  rememberActiveIntelbrasSession,
  sendIntelbrasPhysicalCommand,
} from "./intelbrasPhysicalTransport";

class FakeSocket extends EventEmitter {
  destroyed = false;
  writable = true;
  writes: Buffer[] = [];

  write(data: Uint8Array) {
    this.writes.push(Buffer.from(data));
    return true;
  }

  destroy() {
    this.destroyed = true;
    this.writable = false;
    this.emit("close");
    return this;
  }
}

const system = {
  id: 49,
  account: "0098",
  brand: "INTELBRAS",
  model: "AMT-8000",
  macAddress: "1C17E4",
  isActive: true,
  remoteCommandLabEnabled: true,
};

function queuedCommand(commandType: "arm" | "disarm" = "arm") {
  return {
    id: 7001,
    commandType,
    partition: 0,
    commandPayload: buildIntelbrasPhysicalPayload({ commandType, partition: 0 }),
  };
}

function asSocket(socket: FakeSocket) {
  return socket as unknown as net.Socket;
}

describe("transporte físico Intelbras AMT-8000", () => {
  let socket: FakeSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    clearIntelbrasTransportForTesting();
    socket = new FakeSocket();
    db.getAlarmRemoteCredentialForTransport.mockResolvedValue("878787");
    db.getAlarmSystem.mockResolvedValue(system);
    db.getLatestArmDisarmStatusForSystem.mockResolvedValue({ qualifier: "E" });
    db.getPendingIntelbrasPhysicalCommand.mockResolvedValue(queuedCommand());
    db.updateAlarmRemoteCommandDelivery.mockResolvedValue(undefined);
    db.recordRemoteCommandConfirmation.mockResolvedValue({ recorded: true });
  });

  afterEach(() => {
    if (!socket.destroyed) socket.destroy();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("executa login 0x11, comando 0x16, lê 0x96 e finaliza com 0x15/0x95", async () => {
    vi.useFakeTimers();
    const physicalSocket = asSocket(socket);
    rememberActiveIntelbrasSession(physicalSocket, system);

    const sent = await sendIntelbrasPhysicalCommand({ alarmSystemId: system.id, commandId: 7001 });
    expect(sent.sent).toBe(true);
    expect(socket.writes.map((frame) => frame.toString("hex").toUpperCase())).toEqual([
      "09E705118787879968F182",
    ]);

    expect(await consumeIntelbrasPhysicalResponse(physicalSocket, Buffer.from("05E7015087E328", "hex"))).toBe(true);
    expect(socket.writes.map((frame) => frame.toString("hex").toUpperCase())).toEqual([
      "09E705118787879968F182",
      "06E7021600C291A6",
    ]);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(socket.writes.at(-1)).toEqual(buildIntelbrasRemoteKeepAliveFrame());

    expect(await consumeIntelbrasPhysicalResponse(physicalSocket, Buffer.from("06E7029603769448", "hex"))).toBe(true);
    expect(db.recordRemoteCommandConfirmation).toHaveBeenCalledWith(expect.objectContaining({ commandId: 7001 }));
    expect(socket.writes.map((frame) => frame.toString("hex").toUpperCase())).toEqual([
      "09E705118787879968F182",
      "06E7021600C291A6",
      buildIntelbrasRemoteKeepAliveFrame().toString("hex").toUpperCase(),
      "05E70115067E71",
    ]);

    expect(await consumeIntelbrasPhysicalResponse(physicalSocket, Buffer.from("05E70195857D71", "hex"))).toBe(true);
    expect(db.updateAlarmRemoteCommandDelivery).toHaveBeenLastCalledWith(7001, expect.objectContaining({ status: "responded" }));
  });

  it("não envia o Arme se a senha remota for recusada no login", async () => {
    const physicalSocket = asSocket(socket);
    rememberActiveIntelbrasSession(physicalSocket, system);
    await sendIntelbrasPhysicalCommand({ alarmSystemId: system.id, commandId: 7001 });

    expect(await consumeIntelbrasPhysicalResponse(physicalSocket, Buffer.from("05E7015387E921", "hex"))).toBe(true);
    expect(socket.writes).toHaveLength(1);
    expect(db.recordRemoteCommandConfirmation).not.toHaveBeenCalled();
    expect(db.updateAlarmRemoteCommandDelivery).toHaveBeenLastCalledWith(7001, expect.objectContaining({ status: "failed" }));
  });

  it("não considera Arme confirmado quando a central responde com zonas abertas", async () => {
    const physicalSocket = asSocket(socket);
    rememberActiveIntelbrasSession(physicalSocket, system);
    await sendIntelbrasPhysicalCommand({ alarmSystemId: system.id, commandId: 7001 });
    await consumeIntelbrasPhysicalResponse(physicalSocket, Buffer.from("05E7015087E328", "hex"));

    expect(await consumeIntelbrasPhysicalResponse(physicalSocket, Buffer.from("06E7029680F59D41", "hex"))).toBe(true);
    expect(db.recordRemoteCommandConfirmation).not.toHaveBeenCalled();
    expect(socket.writes.at(-1)?.toString("hex").toUpperCase()).toBe("05E70115067E71");
    await consumeIntelbrasPhysicalResponse(physicalSocket, Buffer.from("05E70195857D71", "hex"));
    expect(db.updateAlarmRemoteCommandDelivery).toHaveBeenLastCalledWith(7001, expect.objectContaining({ status: "failed" }));
  });

  it("não deixa comando Arm/Desarm em fila para ser executado em reconexão futura", async () => {
    const result = await sendIntelbrasPhysicalCommand({ alarmSystemId: system.id, commandId: 7001 });
    expect(result).toMatchObject({ sent: false });
    expect(result.message).toContain("não será enfileirado");
    expect(db.getPendingIntelbrasPhysicalCommand).not.toHaveBeenCalled();
    expect(socket.writes).toHaveLength(0);
  });

  it("não avança a sequência quando a resposta de autenticação tem checksum inválido", async () => {
    const physicalSocket = asSocket(socket);
    rememberActiveIntelbrasSession(physicalSocket, system);
    await sendIntelbrasPhysicalCommand({ alarmSystemId: system.id, commandId: 7001 });

    expect(await consumeIntelbrasPhysicalResponse(physicalSocket, Buffer.from("05E7015087E329", "hex"))).toBe(false);
    expect(socket.writes).toHaveLength(1);
    expect(db.recordRemoteCommandConfirmation).not.toHaveBeenCalled();
  });
});
