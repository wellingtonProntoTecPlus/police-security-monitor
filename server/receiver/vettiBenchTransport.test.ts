import { describe, expect, it } from "vitest";
import { consumeVettiBenchStatusResponse, rememberActiveVettiBenchSession, sendVettiBenchStatusQuery, VETTI_BENCH_STATUS_QUERY } from "./vettiBenchTransport";

function fakeSocket() {
  const writes: Buffer[] = [];
  return {
    destroyed: false,
    writable: true,
    writes,
    once: () => undefined,
    write: (payload: Buffer) => writes.push(payload),
  } as unknown as import("net").Socket & { writes: Buffer[] };
}

describe("transporte VSec da bancada Vetti", () => {
  it("envia somente a consulta documentada 0x14 pela sessão autenticada", () => {
    const socket = fakeSocket();
    rememberActiveVettiBenchSession(socket, { id: 9336, account: "0336" });
    expect(sendVettiBenchStatusQuery({ alarmSystemId: 9336, commandId: 91 })).toEqual({ sent: true, payload: "0205AF14FFB1", account: "0336" });
    expect(socket.writes).toEqual([VETTI_BENCH_STATUS_QUERY]);
  });

  it("aceita apenas a resposta 0x94 da consulta pendente na mesma sessão", () => {
    const socket = fakeSocket();
    rememberActiveVettiBenchSession(socket, { id: 9337, account: "0336" });
    sendVettiBenchStatusQuery({ alarmSystemId: 9337, commandId: 92 });
    expect(consumeVettiBenchStatusResponse(socket, Buffer.from([0x02, 0x06, 0xAF, 0x94, 0x00, 0x80, 0x00]))).toEqual({ commandId: 92, payload: "0205AF14FFB1", response: "0206AF94008000" });
    expect(consumeVettiBenchStatusResponse(socket, Buffer.from([0x02, 0x06, 0xAF, 0x94, 0x00, 0x80, 0x00]))).toBeUndefined();
  });

  it("mantém a consulta aguardando quando não existe sessão autenticada", () => {
    expect(sendVettiBenchStatusQuery({ alarmSystemId: 9999, commandId: 93 })).toEqual({ sent: false, message: "A central Vetti de testes não possui conexão autenticada com a VPS neste momento." });
  });
});
