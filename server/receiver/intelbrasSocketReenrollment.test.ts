import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type net from "node:net";
import { receiverIdentityTestHooks } from "./index";
import { recordSafeCaptureFrame } from "./safeCapture";
import { notifyAlarmSystemsRetired } from "../_core/alarmSystemRuntime";
import { getAlarmSystemByPanelIdentifier, getOperationalAlarmSystem } from "../db";

vi.mock("../db", async (original) => ({
  ...await original<typeof import("../db")>(),
  getAlarmSystemByPanelIdentifier: vi.fn(),
  getOperationalAlarmSystem: vi.fn(),
}));

function fakeSocket() {
  const socket = Object.assign(new EventEmitter(), {
    remoteAddress: "192.0.2.10", writable: true, destroyed: false,
    write: vi.fn(), destroy: vi.fn(),
  });
  return socket as unknown as net.Socket;
}
const oldSystem = { id: 77, clientId: 1, account: "0021", brand: "INTELBRAS", macAddress: "37C6B0", receiverPort: 9271, isActive: true };
const newSystem = { ...oldSystem, id: 80, clientId: 76 };
const sockets: net.Socket[] = [];
function identifiedSocket() {
  const socket = fakeSocket(); sockets.push(socket);
  // Vetor sintético derivado do formato 0x94 já testado no protocolo oficial.
  // Não é enviado a painel: serve apenas à captura em memória do socket fictício.
  const frame = Buffer.from([0x07, 0x94, 0x45, 0x00, 0x21, 0x37, 0xc6, 0xb0, 0]);
  const checksum = Array.from(frame.subarray(0, -1)).reduce((sum, byte) => sum ^ byte, 0);
  frame[frame.length - 1] = 0xff ^ checksum;
  recordSafeCaptureFrame(socket, { brand: "INTELBRAS", receiverPort: 9271, remoteIp: "192.0.2.10", payload: frame });
  return socket;
}

beforeEach(() => vi.resetAllMocks());
afterEach(() => { for (const socket of sockets.splice(0)) { receiverIdentityTestHooks.forgetSocket(socket); socket.emit("close"); } });

describe("reinscrição Intelbras · identidade presa ao socket atual", () => {
  it("não herda MAC de outro socket com mesmo IP, porta e conta", async () => {
    const first = identifiedSocket();
    await receiverIdentityTestHooks.rememberIntelbras(first, oldSystem, 9271);
    const second = fakeSocket(); sockets.push(second);
    vi.mocked(getOperationalAlarmSystem).mockResolvedValue(oldSystem as any);
    expect(await receiverIdentityTestHooks.refreshIntelbras(second, 9271, "0021")).toBeUndefined();
    expect(getAlarmSystemByPanelIdentifier).not.toHaveBeenCalled();
    expect(second.write).not.toHaveBeenCalled();
  });

  it("invalida imediatamente o ID aposentado e reassocia o MAC capturado ao novo cliente", async () => {
    const socket = identifiedSocket();
    await receiverIdentityTestHooks.rememberIntelbras(socket, oldSystem, 9271);
    notifyAlarmSystemsRetired([77]);
    expect(receiverIdentityTestHooks.getKnownSystem(socket)).toBeUndefined();
    vi.mocked(getAlarmSystemByPanelIdentifier).mockResolvedValue(newSystem as any);
    const result = await receiverIdentityTestHooks.refreshIntelbras(socket, 9271, "0021");
    expect(result).toMatchObject({ id: 80, account: "0021", brand: "INTELBRAS" });
    expect(getAlarmSystemByPanelIdentifier).toHaveBeenCalledWith("37C6B0", "mac", "INTELBRAS", 9271);
    expect(socket.write).not.toHaveBeenCalled();
    expect(socket.destroy).not.toHaveBeenCalled();
  });

  it("não mantém cache se a central mudou de porta e não aceita identidade capturada em outra porta", async () => {
    const socket = identifiedSocket();
    await receiverIdentityTestHooks.rememberIntelbras(socket, oldSystem, 9271);
    vi.mocked(getOperationalAlarmSystem).mockResolvedValue({ ...oldSystem, receiverPort: 9071 } as any);
    vi.mocked(getAlarmSystemByPanelIdentifier).mockResolvedValue(undefined);
    expect(await receiverIdentityTestHooks.refreshIntelbras(socket, 9271, "0021")).toBeUndefined();
    expect(receiverIdentityTestHooks.getKnownSystem(socket)).toBeUndefined();
    expect(await receiverIdentityTestHooks.refreshIntelbras(socket, 9071, "0021")).toBeUndefined();
  });
});
