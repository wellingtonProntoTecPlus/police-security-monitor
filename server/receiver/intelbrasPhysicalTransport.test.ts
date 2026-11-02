import { EventEmitter } from "node:events";
import net from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  getAlarmRemoteCredentialForTransport: vi.fn(),
  getAlarmSystem: vi.fn(),
  getLatestArmDisarmStatusForSystem: vi.fn(),
  getPendingIntelbrasPhysicalCommand: vi.fn(),
  recordRemoteCommandConfirmation: vi.fn(),
  updateAlarmRemoteCommandDelivery: vi.fn(),
}));

vi.mock("../db", () => db);

import {
  clearIntelbrasTransportForTesting,
  consumeIntelbrasPhysicalResponse,
  rememberActiveIntelbrasSession,
  sendIntelbrasPhysicalCommand,
} from "./intelbrasPhysicalTransport";
import { INTELBRAS_PHYSICAL_COMMAND_DISABLED_MESSAGE, INTELBRAS_PHYSICAL_COMMAND_ENABLED } from "@shared/remoteCommandCredentialProfiles";

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

function asSocket(socket: FakeSocket) {
  return socket as unknown as net.Socket;
}

describe("transporte físico Intelbras AMT-8000", () => {
  let socket: FakeSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    clearIntelbrasTransportForTesting();
    socket = new FakeSocket();
  });

  afterEach(() => {
    if (!socket.destroyed) socket.destroy();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("recusa envio antes de consultar fila, credenciais ou escrever no socket, mesmo com sessão ativa", async () => {
    expect(INTELBRAS_PHYSICAL_COMMAND_ENABLED).toBe(false);
    rememberActiveIntelbrasSession(asSocket(socket), system);

    const result = await sendIntelbrasPhysicalCommand({ alarmSystemId: system.id, commandId: 7001 });

    expect(result).toEqual({ sent: false, message: INTELBRAS_PHYSICAL_COMMAND_DISABLED_MESSAGE });
    expect(socket.writes).toHaveLength(0);
    expect(db.getPendingIntelbrasPhysicalCommand).not.toHaveBeenCalled();
    expect(db.getAlarmRemoteCredentialForTransport).not.toHaveBeenCalled();
    expect(db.updateAlarmRemoteCommandDelivery).not.toHaveBeenCalled();
    expect(db.recordRemoteCommandConfirmation).not.toHaveBeenCalled();
  });

  it("ignora respostas atrasadas do protocolo E7 antigo quando não há comando pendente nesta sessão", async () => {
    const physicalSocket = asSocket(socket);
    rememberActiveIntelbrasSession(physicalSocket, system);

    const consumed = await consumeIntelbrasPhysicalResponse(physicalSocket, Buffer.from("06E7029603769448", "hex"));

    expect(consumed).toBe(false);
    expect(socket.writes).toHaveLength(0);
    expect(db.recordRemoteCommandConfirmation).not.toHaveBeenCalled();
    expect(db.updateAlarmRemoteCommandDelivery).not.toHaveBeenCalled();
  });
});
