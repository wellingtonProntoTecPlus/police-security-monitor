import net from "net";
import { calculateVettiCrc } from "../vettiCommandSimulation";

export const VETTI_BENCH_STATUS_QUERY = Buffer.from([0x02, 0x05, 0xAF, 0x14, 0xFF, 0xB1]);

type ActiveVettiSession = {
  socket: net.Socket;
  systemId: number;
  account: string;
};

type VettiBenchFlow = "status" | "disarm";
type VettiStatusStage = "standalone" | "pre_disarm" | "post_disarm";

const activeSessionBySystemId = new Map<number, ActiveVettiSession>();
const pendingStatusQueryBySocket = new WeakMap<object, {
  commandId: number;
  flow: VettiBenchFlow;
  stage: VettiStatusStage;
  preStatusResponse?: string;
  disarmResponse?: string;
}>();
const pendingRemoteLoginBySocket = new WeakMap<object, { commandId: number; flow: VettiBenchFlow }>();
const pendingDisarmBySocket = new WeakMap<object, { commandId: number; partitionMask: number; commandPasswordBytes: number[]; preStatusResponse: string }>();

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

function encodeVettiCommandPassword(commandPassword: string) {
  const password = commandPassword.trim();
  if (!/^\d{4,8}$/.test(password) || password.length % 2 !== 0) {
    throw new Error("A senha de comando Vetti deve ter 4, 6 ou 8 dígitos para o Desarme físico de bancada");
  }
  const encodedPassword = Array.from(
    { length: password.length / 2 },
    (_, index) => Number.parseInt(password.slice(index * 2, index * 2 + 2), 16),
  );
  return [...encodedPassword, ...Array.from({ length: 4 - encodedPassword.length }, () => 0xFF)];
}

/** Monta o Desarme VSec 0x43 com máscara das partições armadas e senha decimal BCD. */
export function buildVettiBenchDisarmFrame(partitionMask: number, commandPassword: string) {
  if (!Number.isInteger(partitionMask) || partitionMask < 1 || partitionMask > 0x3F) {
    throw new Error("A máscara de partições Vetti deve conter ao menos uma partição armada");
  }
  // O 0x43 sempre reserva quatro bytes para a senha. Os exemplos oficiais
  // mostram 0xFF como preenchimento quando a senha tem menos de oito dígitos.
  const passwordBytes = encodeVettiCommandPassword(commandPassword);
  const body = [0x09, 0xAF, 0x43, partitionMask, ...passwordBytes];
  return Buffer.from([0x02, ...body, calculateVettiCrc(body)]);
}

function isExpectedVettiResponse(data: Buffer, command: number, minimumLength: number) {
  if (data.length < minimumLength || data[0] !== 0x02 || data[1] !== data.length - 1 || data[2] !== 0xAF || data[3] !== command) return false;
  return data[data.length - 1] === calculateVettiCrc(Array.from(data.subarray(1, -1)));
}

/**
 * Separa o fluxo TCP VSec sem interpretar o conteúdo dos frames. A Vetti pode
 * enviar mais de um quadro em uma leitura ou fragmentar um quadro entre duas
 * leituras; somente um frame completo é entregue ao receptor.
 */
export function extractVettiFrames(data: Buffer) {
  const frames: Buffer[] = [];
  let offset = 0;
  while (offset < data.length) {
    if (data[offset] === 0xF7) {
      frames.push(data.subarray(offset, offset + 1));
      offset += 1;
      continue;
    }
    if (data[offset] !== 0x02) {
      offset += 1;
      continue;
    }
    if (offset + 1 >= data.length) break;
    const numberOfBytes = data[offset + 1];
    const frameLength = numberOfBytes + 1;
    if (numberOfBytes < 4 || frameLength > 256) {
      offset += 1;
      continue;
    }
    if (offset + frameLength > data.length) break;
    frames.push(data.subarray(offset, offset + frameLength));
    offset += frameLength;
  }
  return { frames, remainder: Buffer.from(data.subarray(offset)) };
}

/** Mantém somente o socket que a central Vetti de bancada abriu e autenticou na VPS. */
export function rememberActiveVettiBenchSession(socket: net.Socket, system: { id: number; account: string }) {
  activeSessionBySystemId.set(system.id, { socket, systemId: system.id, account: system.account });
  socket.once("close", () => {
    if (activeSessionBySystemId.get(system.id)?.socket === socket) activeSessionBySystemId.delete(system.id);
  });
}

/** Envia exclusivamente o login VSec 0x11 que precede a consulta ou Desarme de bancada. */
export function sendVettiBenchRemoteLogin(input: {
  alarmSystemId: number;
  commandId: number;
  externalAccessPassword: string;
  flow?: VettiBenchFlow;
}) {
  const session = getActiveSession(input.alarmSystemId);
  if (!session) {
    return { sent: false as const, message: "A central Vetti de testes não possui conexão autenticada com a VPS neste momento." };
  }
  const frame = buildVettiBenchRemoteLoginFrame(input.externalAccessPassword);
  pendingRemoteLoginBySocket.set(session.socket, { commandId: input.commandId, flow: input.flow ?? "status" });
  session.socket.write(frame);
  return { sent: true as const, payload: "02 07 AF 11 <SENHA_DE_ACESSO_REMOTO_CIFRADA> FF <CRC>", account: session.account };
}

/** Consome a confirmação VSec 0x91 do login remoto e jamais considera erro como sessão válida. */
export function consumeVettiBenchRemoteLoginResponse(socket: net.Socket, data: Buffer) {
  const pending = pendingRemoteLoginBySocket.get(socket);
  if (!pending || !isExpectedVettiResponse(data, 0x91, 7)) return undefined;
  pendingRemoteLoginBySocket.delete(socket);
  const errorCode = data[4];
  return { commandId: pending.commandId, flow: pending.flow, accepted: errorCode === 0x80, errorCode, response: data.toString("hex").toUpperCase() };
}

/** Envia somente a consulta VSec 0x14 após login aceito. */
export function sendVettiBenchStatusQuery(input: {
  alarmSystemId: number;
  commandId: number;
  flow?: VettiBenchFlow;
  stage?: VettiStatusStage;
  preStatusResponse?: string;
  disarmResponse?: string;
}) {
  const session = getActiveSession(input.alarmSystemId);
  if (!session) {
    return { sent: false as const, message: "A central Vetti de testes não possui conexão autenticada com a VPS neste momento." };
  }
  pendingStatusQueryBySocket.set(session.socket, {
    commandId: input.commandId,
    flow: input.flow ?? "status",
    stage: input.stage ?? "standalone",
    preStatusResponse: input.preStatusResponse,
    disarmResponse: input.disarmResponse,
  });
  session.socket.write(VETTI_BENCH_STATUS_QUERY);
  return { sent: true as const, payload: VETTI_BENCH_STATUS_QUERY.toString("hex").toUpperCase(), account: session.account };
}

/** Consome a resposta VSec 0x94 da consulta 0x14 pendente na mesma sessão. */
export function consumeVettiBenchStatusResponse(socket: net.Socket, data: Buffer) {
  const pending = pendingStatusQueryBySocket.get(socket);
  // Respostas de erro podem ser curtas (por exemplo, 0x94/0x85), mas a
  // confirmação de sucesso só é aceita pelo receptor quando o status tiver
  // todos os campos obrigatórios do quadro completo.
  if (!pending || !isExpectedVettiResponse(data, 0x94, 7)) return undefined;
  pendingStatusQueryBySocket.delete(socket);
  return {
    commandId: pending.commandId,
    payload: VETTI_BENCH_STATUS_QUERY.toString("hex").toUpperCase(),
    response: data.toString("hex").toUpperCase(),
    errorCode: data[4],
    flow: pending.flow,
    stage: pending.stage,
    preStatusResponse: pending.preStatusResponse,
    disarmResponse: pending.disarmResponse,
  };
}

/** Envia exclusivamente o Desarme VSec 0x43 após status que comprove partições armadas. */
export function sendVettiBenchDisarm(input: {
  alarmSystemId: number;
  commandId: number;
  partitionMask: number;
  commandPassword: string;
  preStatusResponse: string;
}) {
  const session = getActiveSession(input.alarmSystemId);
  if (!session) {
    return { sent: false as const, message: "A central Vetti de testes não possui conexão autenticada com a VPS neste momento." };
  }
  const frame = buildVettiBenchDisarmFrame(input.partitionMask, input.commandPassword);
  pendingDisarmBySocket.set(session.socket, {
    commandId: input.commandId,
    partitionMask: input.partitionMask,
    commandPasswordBytes: encodeVettiCommandPassword(input.commandPassword),
    preStatusResponse: input.preStatusResponse,
  });
  session.socket.write(frame);
  return {
    sent: true as const,
    payload: `02 09 AF 43 ${input.partitionMask.toString(16).toUpperCase().padStart(2, "0")} <SENHA_DE_COMANDO_CIFRADA_PREENCHIDA_COM_FF> <CRC>`,
    account: session.account,
  };
}

/** Consome somente a confirmação VSec 0xC3 do Desarme pendente. */
export function consumeVettiBenchDisarmResponse(socket: net.Socket, data: Buffer) {
  const pending = pendingDisarmBySocket.get(socket);
  if (!pending || !isExpectedVettiResponse(data, 0xC3, 11)) return undefined;
  pendingDisarmBySocket.delete(socket);
  const errorCode = data[5];
  return {
    commandId: pending.commandId,
    accepted: errorCode === 0x80,
    errorCode,
    partitionMask: data[4],
    partitionMaskMatches: data[4] === pending.partitionMask,
    commandPasswordMatches: data.subarray(6, 10).every((value, index) => value === pending.commandPasswordBytes[index]),
    response: data.toString("hex").toUpperCase(),
    preStatusResponse: pending.preStatusResponse,
  };
}

/** Descarta estados de uma sequência expirada, encerrada ou invalidada no receptor. */
export function clearPendingVettiBenchCommand(socket: net.Socket, commandId: number) {
  if (pendingRemoteLoginBySocket.get(socket)?.commandId === commandId) pendingRemoteLoginBySocket.delete(socket);
  if (pendingStatusQueryBySocket.get(socket)?.commandId === commandId) pendingStatusQueryBySocket.delete(socket);
  if (pendingDisarmBySocket.get(socket)?.commandId === commandId) pendingDisarmBySocket.delete(socket);
}
