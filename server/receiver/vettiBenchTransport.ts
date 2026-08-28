import net from "net";
import { calculateVettiCrc } from "../vettiCommandSimulation";

export const VETTI_BENCH_STATUS_QUERY = Buffer.from([0x02, 0x05, 0xAF, 0x14, 0xFF, 0xB1]);

type ActiveVettiSession = {
  socket: net.Socket;
  systemId: number;
  account: string;
};

const activeSessionBySystemId = new Map<number, ActiveVettiSession>();
const pendingStatusQueryBySocket = new WeakMap<object, { commandId: number }>();
const pendingRemoteLoginBySocket = new WeakMap<object, { commandId: number }>();

function getActiveSession(alarmSystemId: number) {
  const session = activeSessionBySystemId.get(alarmSystemId);
  if (!session || session.socket.destroyed || !session.socket.writable) return undefined;
  return session;
}

/** Monta o login VSec 0x11: senha externa de quatro dígitos BCD, jamais registrada em texto. */
export function buildVettiBenchRemoteLoginFrame(externalAccessPassword: string) {
  const password = externalAccessPassword.trim();
  if (!/^\d{4}$/.test(password)) {
    throw new Error("A senha de acesso remoto Vetti deve ter exatamente quatro dígitos para a consulta física de bancada");
  }
  const passwordHigh = Number.parseInt(password.slice(0, 2), 16);
  const passwordLow = Number.parseInt(password.slice(2, 4), 16);
  const body = [0x07, 0xAF, 0x11, passwordHigh, passwordLow, 0xFF];
  return Buffer.from([0x02, ...body, calculateVettiCrc(body)]);
}

/** Mantém somente o socket que a central Vetti de bancada abriu e autenticou na VPS. */
export function rememberActiveVettiBenchSession(socket: net.Socket, system: { id: number; account: string }) {
  activeSessionBySystemId.set(system.id, { socket, systemId: system.id, account: system.account });
  socket.once("close", () => {
    if (activeSessionBySystemId.get(system.id)?.socket === socket) activeSessionBySystemId.delete(system.id);
  });
}

/** Envia exclusivamente o login VSec 0x11 que precede a consulta 0x14. */
export function sendVettiBenchRemoteLogin(input: { alarmSystemId: number; commandId: number; externalAccessPassword: string }) {
  const session = getActiveSession(input.alarmSystemId);
  if (!session) {
    return { sent: false as const, message: "A central Vetti de testes não possui conexão autenticada com a VPS neste momento." };
  }
  const frame = buildVettiBenchRemoteLoginFrame(input.externalAccessPassword);
  pendingRemoteLoginBySocket.set(session.socket, { commandId: input.commandId });
  session.socket.write(frame);
  return { sent: true as const, payload: "02 07 AF 11 <SENHA_DE_ACESSO_REMOTO_CIFRADA> FF <CRC>", account: session.account };
}

/** Consome a confirmação VSec 0x91 do login remoto e jamais considera erro como sessão válida. */
export function consumeVettiBenchRemoteLoginResponse(socket: net.Socket, data: Buffer) {
  const pending = pendingRemoteLoginBySocket.get(socket);
  if (!pending || data.length < 6 || data[0] !== 0x02 || data[2] !== 0xAF || data[3] !== 0x91) return undefined;
  pendingRemoteLoginBySocket.delete(socket);
  const errorCode = data[4];
  return { commandId: pending.commandId, accepted: errorCode === 0x80, errorCode, response: data.toString("hex").toUpperCase() };
}

/** Envia exclusivamente a consulta documentada VSec 0x14 depois do login aceito; nenhuma ação física é permitida aqui. */
export function sendVettiBenchStatusQuery(input: { alarmSystemId: number; commandId: number }) {
  const session = getActiveSession(input.alarmSystemId);
  if (!session) {
    return { sent: false as const, message: "A central Vetti de testes não possui conexão autenticada com a VPS neste momento." };
  }
  pendingStatusQueryBySocket.set(session.socket, { commandId: input.commandId });
  session.socket.write(VETTI_BENCH_STATUS_QUERY);
  return { sent: true as const, payload: VETTI_BENCH_STATUS_QUERY.toString("hex").toUpperCase(), account: session.account };
}

/** Consome a resposta VSec 0x94 da consulta 0x14 pendente na mesma sessão. */
export function consumeVettiBenchStatusResponse(socket: net.Socket, data: Buffer) {
  const pending = pendingStatusQueryBySocket.get(socket);
  if (!pending || data.length < 5 || data[0] !== 0x02 || data[2] !== 0xAF || data[3] !== 0x94) return undefined;
  pendingStatusQueryBySocket.delete(socket);
  return {
    commandId: pending.commandId,
    payload: VETTI_BENCH_STATUS_QUERY.toString("hex").toUpperCase(),
    response: data.toString("hex").toUpperCase(),
    errorCode: data[4],
  };
}
