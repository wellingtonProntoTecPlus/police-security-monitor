import { calculateVettiCrc } from "../vettiCommandSimulation";
import { describe, expect, it } from "vitest";
import { buildVettiBenchDisarmFrame, buildVettiBenchRemoteLoginFrame, consumeVettiBenchDisarmResponse, consumeVettiBenchRemoteLoginResponse, consumeVettiBenchStatusResponse, doesVettiPostStatusConfirmDisarm, extractVettiFrames, parseVerifiedVettiStatusResponse, rememberActiveVettiBenchSession, sendVettiBenchDisarm, sendVettiBenchRemoteLogin, sendVettiBenchStatusQuery, VETTI_BENCH_STATUS_QUERY } from "./vettiBenchTransport";

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

function vettiResponse(body: number[]) {
  return Buffer.from([0x02, ...body, calculateVettiCrc(body)]);
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
      commandId: 91, flow: "status", accepted: true, errorCode: 0x80, response: "0206AF9180FFE1",
    });
    expect(sendVettiBenchStatusQuery({ alarmSystemId: 9336, commandId: 91 })).toEqual({ sent: true, payload: "0205AF14FFB1", account: "0336" });
    expect(socket.writes.at(-1)).toEqual(VETTI_BENCH_STATUS_QUERY);
  });

  it("preserva o erro 0x85 do login como falha e não aceita a sessão", () => {
    const socket = fakeSocket();
    rememberActiveVettiBenchSession(socket, { id: 9337, account: "0336" });
    sendVettiBenchRemoteLogin({ alarmSystemId: 9337, commandId: 92, externalAccessPassword: "1234" });
    const response = vettiResponse([0x06, 0xAF, 0x91, 0x85, 0xFF]);
    expect(consumeVettiBenchRemoteLoginResponse(socket, response)).toEqual({
      commandId: 92, flow: "status", accepted: false, errorCode: 0x85, response: response.toString("hex").toUpperCase(),
    });
  });

  it("aceita apenas a resposta 0x94 da consulta pendente na mesma sessão", () => {
    const socket = fakeSocket();
    rememberActiveVettiBenchSession(socket, { id: 9338, account: "0336" });
    sendVettiBenchStatusQuery({ alarmSystemId: 9338, commandId: 93 });
    const response = vettiResponse([0x0C, 0xAF, 0x94, 0x80, 0x12, 0x01, 0x01, 0x00, 0x00, 0x01, 0xFF]);
    expect(response.toString("hex").toUpperCase()).toBe("020CAF9480120101000001FF57");
    expect(consumeVettiBenchStatusResponse(socket, response)).toMatchObject({
      commandId: 93, payload: "0205AF14FFB1", response: response.toString("hex").toUpperCase(), errorCode: 0x80,
    });
  });

  it("separa o fluxo VSec fragmentado ou agregado sem entregar quadro parcial", () => {
    const login = vettiResponse([0x06, 0xAF, 0x91, 0x80, 0xFF]);
    const status = vettiResponse([0x0C, 0xAF, 0x94, 0x80, 0x12, 0x01, 0x01, 0x00, 0x00, 0x01, 0xFF]);
    const first = extractVettiFrames(Buffer.concat([login, status.subarray(0, 5)]));
    expect(first.frames).toEqual([login]);
    expect(first.remainder).toEqual(status.subarray(0, 5));
    const second = extractVettiFrames(Buffer.concat([first.remainder, status.subarray(5), Buffer.from([0xF7])]));
    expect(second.frames).toEqual([status, Buffer.from([0xF7])]);
    expect(second.remainder).toEqual(Buffer.alloc(0));
  });

  it("mantém a consulta aguardando quando não existe sessão autenticada", () => {
    expect(sendVettiBenchStatusQuery({ alarmSystemId: 9999, commandId: 94 })).toEqual({ sent: false, message: "A central Vetti de testes não possui conexão autenticada com a VPS neste momento." });
  });

  it("monta e confirma somente o Desarme 0x43 após uma pré-checagem autenticada", () => {
    const socket = fakeSocket();
    rememberActiveVettiBenchSession(socket, { id: 9339, account: "0336" });
    const frame = buildVettiBenchDisarmFrame(0x01, "123456");
    expect(frame).toEqual(vettiResponse([0x09, 0xAF, 0x43, 0x01, 0x12, 0x34, 0x56, 0xFF]));
    expect(sendVettiBenchDisarm({ alarmSystemId: 9339, commandId: 95, partitionMask: 0x01, commandPassword: "123456", preStatusResponse: "020CAF9480120101000001FF57" })).toEqual({
      sent: true, payload: "02 09 AF 43 01 <SENHA_DE_COMANDO_CIFRADA_PREENCHIDA_COM_FF> <CRC>", account: "0336",
    });
    expect(socket.writes.at(-1)).toEqual(frame);
    const confirmation = consumeVettiBenchDisarmResponse(socket, vettiResponse([0x0A, 0xAF, 0xC3, 0x01, 0x80, 0x12, 0x34, 0x56, 0xFF]));
    expect(confirmation).toMatchObject({
      commandId: 95, accepted: true, errorCode: 0x80, partitionMask: 0x01, partitionMaskMatches: true, commandPasswordMatches: true, preStatusResponse: "020CAF9480120101000001FF57",
    });
    expect(confirmation?.response).toMatch(/^020AAFC30180<SENHA_DE_COMANDO_OCULTA>[0-9A-F]{2}$/);
    expect(confirmation?.response).not.toContain("123456");
  });

  it("recusa confirmação 0xC3 com máscara divergente e quadros com CRC inválido", () => {
    const socket = fakeSocket();
    rememberActiveVettiBenchSession(socket, { id: 9340, account: "0336" });
    sendVettiBenchDisarm({ alarmSystemId: 9340, commandId: 96, partitionMask: 0x01, commandPassword: "1234", preStatusResponse: "020CAF9480120101000001FF57" });
    const malformed = Buffer.from(vettiResponse([0x0A, 0xAF, 0xC3, 0x01, 0x80, 0x12, 0x34, 0xFF, 0xFF]));
    malformed[malformed.length - 1] ^= 0xFF;
    expect(consumeVettiBenchDisarmResponse(socket, malformed)).toBeUndefined();
    expect(consumeVettiBenchDisarmResponse(socket, vettiResponse([0x0A, 0xAF, 0xC3, 0x02, 0x80, 0x12, 0x34, 0xFF, 0xFF]))).toMatchObject({
      commandId: 96, accepted: true, partitionMask: 0x02, partitionMaskMatches: false, commandPasswordMatches: true,
    });
  });

  it("só confirma o Desarme se o status posterior íntegro não mantiver central nem partições armadas", () => {
    const preStatus = vettiResponse([0x0C, 0xAF, 0x94, 0x80, 0x12, 0x01, 0x05, 0x00, 0x00, 0x05, 0xFF]);
    const postDisarmed = vettiResponse([0x0C, 0xAF, 0x94, 0x80, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF]);
    const postStillArmed = vettiResponse([0x0C, 0xAF, 0x94, 0x80, 0x12, 0x01, 0x01, 0x00, 0x00, 0x01, 0xFF]);
    expect(parseVerifiedVettiStatusResponse(preStatus)).toEqual({ centralStatus: 0x01, partitionMask: 0x05 });
    expect(doesVettiPostStatusConfirmDisarm(preStatus.toString("hex"), postDisarmed.toString("hex"))).toBe(true);
    expect(doesVettiPostStatusConfirmDisarm(preStatus.toString("hex"), postStillArmed.toString("hex"))).toBe(false);
    const corrupted = Buffer.from(postDisarmed);
    corrupted[corrupted.length - 1] ^= 0xFF;
    expect(parseVerifiedVettiStatusResponse(corrupted)).toBeUndefined();
  });
});
