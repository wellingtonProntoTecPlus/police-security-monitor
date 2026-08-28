import { describe, expect, it } from "vitest";
import { buildVettiBenchRemoteLoginFrame, consumeVettiBenchRemoteLoginResponse, consumeVettiBenchStatusResponse, rememberActiveVettiBenchSession, sendVettiBenchRemoteLogin, sendVettiBenchStatusQuery, VETTI_BENCH_STATUS_QUERY } from "./vettiBenchTransport";

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
  it("monta o login remoto 0x11 com senha BCD e CRC oficial sem expor o segredo", () => {
    expect(buildVettiBenchRemoteLoginFrame("1234").toString("hex").toUpperCase()).toBe("0207AF111234FF47");
    expect(() => buildVettiBenchRemoteLoginFrame("123")).toThrow("quatro dígitos");
  });

  it("envia login e somente libera a consulta após a confirmação 0x91 com sucesso", () => {
    const socket = fakeSocket();
    rememberActiveVettiBenchSession(socket, { id: 9336, account: "0336" });
    expect(sendVettiBenchRemoteLogin({ alarmSystemId: 9336, commandId: 91, externalAccessPassword: "1234" })).toEqual({
      sent: true,
      payload: "02 07 AF 11 <SENHA_DE_ACESSO_REMOTO_CIFRADA> FF <CRC>",
      account: "0336",
    });
    expect(socket.writes[0].toString("hex").toUpperCase()).toBe("0207AF111234FF47");
    expect(consumeVettiBenchRemoteLoginResponse(socket, Buffer.from([0x02, 0x06, 0xAF, 0x91, 0x80, 0xFF, 0xE1]))).toEqual({
      commandId: 91, accepted: true, errorCode: 0x80, response: "0206AF9180FFE1",
    });
    expect(sendVettiBenchStatusQuery({ alarmSystemId: 9336, commandId: 91 })).toEqual({ sent: true, payload: "0205AF14FFB1", account: "0336" });
    expect(socket.writes.at(-1)).toEqual(VETTI_BENCH_STATUS_QUERY);
  });

  it("preserva o erro 0x85 do login como falha e não aceita a sessão", () => {
    const socket = fakeSocket();
    rememberActiveVettiBenchSession(socket, { id: 9337, account: "0336" });
    sendVettiBenchRemoteLogin({ alarmSystemId: 9337, commandId: 92, externalAccessPassword: "1234" });
    expect(consumeVettiBenchRemoteLoginResponse(socket, Buffer.from([0x02, 0x06, 0xAF, 0x91, 0x85, 0xFF, 0x00]))).toEqual({
      commandId: 92, accepted: false, errorCode: 0x85, response: "0206AF9185FF00",
    });
  });

  it("aceita apenas a resposta 0x94 da consulta pendente na mesma sessão", () => {
    const socket = fakeSocket();
    rememberActiveVettiBenchSession(socket, { id: 9338, account: "0336" });
    sendVettiBenchStatusQuery({ alarmSystemId: 9338, commandId: 93 });
    expect(consumeVettiBenchStatusResponse(socket, Buffer.from([0x02, 0x06, 0xAF, 0x94, 0x80, 0xFF, 0x00]))).toEqual({
      commandId: 93, payload: "0205AF14FFB1", response: "0206AF9480FF00", errorCode: 0x80,
    });
  });

  it("mantém a consulta aguardando quando não existe sessão autenticada", () => {
    expect(sendVettiBenchStatusQuery({ alarmSystemId: 9999, commandId: 94 })).toEqual({ sent: false, message: "A central Vetti de testes não possui conexão autenticada com a VPS neste momento." });
  });
});
