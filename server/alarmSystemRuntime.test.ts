import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyAlarmSystemsRetired, onAlarmSystemsRetired } from "./_core/alarmSystemRuntime";
import {
  clearConfirmedIntelbrasEndpointsForTesting,
  getConfirmedIntelbrasEndpoint,
  rememberConfirmedIntelbrasEndpoint,
} from "./receiver/intelbrasIsecnetContinuation";
import {
  clearConfirmedJflEndpointsForTesting,
  getConfirmedJflEndpoint,
  rememberConfirmedJflEndpoint,
} from "./receiver/jflKeepAliveContinuation";
import {
  COMPATEC_MW1_STATUS_QUERY,
  consumeCompatecMw1StatusResponse,
  rememberActiveCompatecSession,
  sendCompatecMw1StatusQuery,
} from "./receiver/compatecMicrobusTransport";
import {
  consumeVettiBenchStatusResponse,
  rememberActiveVettiBenchSession,
  sendVettiBenchStatusQuery,
} from "./receiver/vettiBenchTransport";
import {
  clearIntelbrasTransportForTesting,
  isIntelbrasSessionActive,
  rememberActiveIntelbrasSession,
} from "./receiver/intelbrasPhysicalTransport";

function fakeTextSocket() {
  const writes: string[] = [];
  return {
    destroyed: false,
    writable: true,
    writes,
    once: () => undefined,
    write: (payload: string) => {
      writes.push(payload);
      return true;
    },
  } as any;
}

function fakeBufferSocket() {
  const writes: Buffer[] = [];
  return {
    destroyed: false,
    writable: true,
    writes,
    once: () => undefined,
    write: (payload: Buffer) => {
      writes.push(payload);
      return true;
    },
  } as any;
}

afterEach(() => {
  clearConfirmedIntelbrasEndpointsForTesting();
  clearConfirmedJflEndpointsForTesting();
  clearIntelbrasTransportForTesting();
});

describe("runtime de centrais aposentadas", () => {
  it("notifica listeners, isola exceções e permite cleanup idempotente", () => {
    const received: number[][] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cleanup = onAlarmSystemsRetired((systemIds) => {
      received.push(systemIds);
    });
    const failingCleanup = onAlarmSystemsRetired(() => {
      throw new Error("listener quebrado");
    });

    expect(() => notifyAlarmSystemsRetired([101, 102])).not.toThrow();
    cleanup();
    cleanup();
    failingCleanup();
    notifyAlarmSystemsRetired([103]);

    expect(received).toEqual([[101, 102]]);
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it("não chama listeners para uma notificação vazia", () => {
    const listener = vi.fn();
    const cleanup = onAlarmSystemsRetired(listener);

    notifyAlarmSystemsRetired([]);

    expect(listener).not.toHaveBeenCalled();
    cleanup();
  });
});

describe("invalidação de caches por systemId", () => {
  it("remove sessão e pendência Compatec sem fechar o socket", () => {
    const socket = fakeTextSocket();
    rememberActiveCompatecSession(socket, { id: 1101, account: "1101" });
    expect(sendCompatecMw1StatusQuery({ alarmSystemId: 1101, commandId: 1 })).toMatchObject({ sent: true });

    notifyAlarmSystemsRetired([1101]);

    expect(sendCompatecMw1StatusQuery({ alarmSystemId: 1101, commandId: 2 })).toMatchObject({ sent: false });
    expect(consumeCompatecMw1StatusResponse(socket, "MB=KA0[03FF]\r\n")).toBeUndefined();
    expect(socket.destroyed).toBe(false);
    expect(socket.writes).toEqual([COMPATEC_MW1_STATUS_QUERY]);
  });

  it("remove sessão e pendência Vetti sem fechar o socket", () => {
    const socket = fakeBufferSocket();
    rememberActiveVettiBenchSession(socket, { id: 1102, account: "1102" });
    expect(sendVettiBenchStatusQuery({ alarmSystemId: 1102, commandId: 2 })).toMatchObject({ sent: true });

    notifyAlarmSystemsRetired([1102]);

    expect(sendVettiBenchStatusQuery({ alarmSystemId: 1102, commandId: 3 })).toMatchObject({ sent: false });
    expect(consumeVettiBenchStatusResponse(socket, Buffer.alloc(0))).toBeUndefined();
    expect(socket.destroyed).toBe(false);
    expect(socket.writes).toHaveLength(1);
  });

  it("limpa somente a sessão Intelbras via clearIntelbrasSession, sem escrever quadro", () => {
    const socket = fakeBufferSocket();
    rememberActiveIntelbrasSession(socket, { id: 1103, account: "1103", brand: "INTELBRAS" });
    expect(isIntelbrasSessionActive(1103)).toBe(true);

    notifyAlarmSystemsRetired([1103]);

    expect(isIntelbrasSessionActive(1103)).toBe(false);
    expect(socket.destroyed).toBe(false);
    expect(socket.writes).toHaveLength(0);
  });

  it("remove a continuação JFL em todos os endpoints e preserva outros IDs", () => {
    rememberConfirmedJflEndpoint("10.0.0.1", 9061, { id: 1201, account: "1201", brand: "JFL" });
    rememberConfirmedJflEndpoint("10.0.0.2", 9061, { id: 1201, account: "1201", brand: "JFL" });
    rememberConfirmedJflEndpoint("10.0.0.3", 9061, { id: 1202, account: "1202", brand: "JFL" });

    notifyAlarmSystemsRetired([1201]);

    expect(getConfirmedJflEndpoint("10.0.0.1", 9061)).toBeUndefined();
    expect(getConfirmedJflEndpoint("10.0.0.2", 9061)).toBeUndefined();
    expect(getConfirmedJflEndpoint("10.0.0.3", 9061)).toMatchObject({ id: 1202 });
  });

  it("remove a continuação Intelbras em todos os endpoints, preserva outros IDs e mantém ambiguidade fail closed", () => {
    rememberConfirmedIntelbrasEndpoint("10.0.1.1", 9271, { id: 1301, account: "1301", brand: "INTELBRAS" });
    rememberConfirmedIntelbrasEndpoint("10.0.1.2", 9271, { id: 1301, account: "1301", brand: "INTELBRAS" });
    rememberConfirmedIntelbrasEndpoint("10.0.1.3", 9271, { id: 1302, account: "1302", brand: "INTELBRAS" });
    rememberConfirmedIntelbrasEndpoint("10.0.1.4", 9271, { id: 1304, account: "1304", brand: "INTELBRAS" });
    rememberConfirmedIntelbrasEndpoint("10.0.1.5", 9271, { id: 1303, account: "1305", brand: "INTELBRAS" });
    rememberConfirmedIntelbrasEndpoint("10.0.1.5", 9271, { id: 1304, account: "1305", brand: "INTELBRAS" });

    notifyAlarmSystemsRetired([1301]);

    expect(getConfirmedIntelbrasEndpoint("10.0.1.1", 9271, "1301")).toBeUndefined();
    expect(getConfirmedIntelbrasEndpoint("10.0.1.2", 9271, "1301")).toBeUndefined();
    expect(getConfirmedIntelbrasEndpoint("10.0.1.3", 9271, "1302")).toMatchObject({ id: 1302 });
    expect(getConfirmedIntelbrasEndpoint("10.0.1.4", 9271, "1304")).toMatchObject({ id: 1304 });
    expect(getConfirmedIntelbrasEndpoint("10.0.1.5", 9271, "1305")).toBeUndefined();
  });
});
