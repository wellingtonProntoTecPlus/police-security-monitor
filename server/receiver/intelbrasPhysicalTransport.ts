import net from "node:net";
import {
  getAlarmRemoteCredentialForTransport,
  getAlarmSystem,
  getLatestArmDisarmStatusForSystem,
  getPendingIntelbrasPhysicalCommand,
  recordRemoteCommandConfirmation,
  updateAlarmRemoteCommandDelivery,
} from "../db";
import {
  getIntelbrasPhysicalFrameFromPayload,
  getIntelbrasPhysicalResponseDescription,
  isIntelbrasPhysicalStateConfirmed,
  parseIntelbrasIsecProgramResponse,
} from "./intelbrasIsecProgramTransport";

const INTELBRAS_RESPONSE_TIMEOUT_MS = 12_000;

type IntelbrasSession = {
  socket: net.Socket;
  alarmSystemId: number;
  account: string;
};

type PendingPhysicalCommand = {
  commandId: number;
  commandType: "arm" | "disarm";
};

const sessionsBySystemId = new Map<number, IntelbrasSession>();
const sessionBySocket = new WeakMap<object, IntelbrasSession>();
const pendingBySocket = new WeakMap<object, PendingPhysicalCommand>();
const timeoutBySocket = new WeakMap<object, ReturnType<typeof setTimeout>>();
const cleanupBoundSockets = new WeakSet<object>();

function clearCommandTimeout(socket: net.Socket) {
  const timer = timeoutBySocket.get(socket);
  if (timer) clearTimeout(timer);
  timeoutBySocket.delete(socket);
}

function failPendingCommand(socket: net.Socket, message: string) {
  const pending = pendingBySocket.get(socket);
  if (!pending) return;
  pendingBySocket.delete(socket);
  clearCommandTimeout(socket);
  void updateAlarmRemoteCommandDelivery(pending.commandId, {
    status: "failed",
    responsePayload: message,
    executedAt: new Date(),
  });
}

function bindSocketCleanup(socket: net.Socket) {
  if (cleanupBoundSockets.has(socket)) return;
  cleanupBoundSockets.add(socket);
  socket.once("close", () => {
    const session = sessionBySocket.get(socket);
    if (session && sessionsBySystemId.get(session.alarmSystemId)?.socket === socket) {
      sessionsBySystemId.delete(session.alarmSystemId);
    }
    failPendingCommand(socket, "Comando Intelbras interrompido: a conexão identificada da central foi encerrada antes da confirmação.");
  });
  socket.once("error", () => {
    failPendingCommand(socket, "Comando Intelbras interrompido: ocorreu erro na conexão identificada antes da confirmação.");
  });
}

export function rememberActiveIntelbrasSession(socket: net.Socket, system: { id: number; account: string; brand?: string | null }) {
  if (system.brand && system.brand.trim().toUpperCase() !== "INTELBRAS") return;
  const previous = sessionsBySystemId.get(system.id);
  if (previous && previous.socket !== socket && !previous.socket.destroyed) previous.socket.destroy();
  const session: IntelbrasSession = { socket, alarmSystemId: system.id, account: system.account };
  sessionsBySystemId.set(system.id, session);
  sessionBySocket.set(socket, session);
  bindSocketCleanup(socket);
}

export function clearIntelbrasSession(socket: net.Socket) {
  const session = sessionBySocket.get(socket);
  if (session && sessionsBySystemId.get(session.alarmSystemId)?.socket === socket) {
    sessionsBySystemId.delete(session.alarmSystemId);
  }
  failPendingCommand(socket, "Comando Intelbras interrompido: a sessão física foi encerrada antes da confirmação.");
}

export function isIntelbrasSessionActive(alarmSystemId: number) {
  const session = sessionsBySystemId.get(alarmSystemId);
  return Boolean(session && !session.socket.destroyed && session.socket.writable);
}

function currentStateAllowsCommand(commandType: "arm" | "disarm", qualifier?: string | null) {
  // No histórico do PoliceCentral, R = armado e E = desarmado.
  return commandType === "arm" ? qualifier === "E" : qualifier === "R";
}

export async function deliverPendingIntelbrasPhysicalCommand(system: { id: number; account: string }, socket: net.Socket) {
  const session = sessionsBySystemId.get(system.id);
  if (!session || session.socket !== socket || socket.destroyed || !socket.writable) return { sent: false as const, message: "A sessão física Intelbras ainda não está disponível." };
  if (pendingBySocket.has(socket)) return { sent: false as const, message: "Já existe um comando Intelbras aguardando resposta nesta sessão." };

  const pending = await getPendingIntelbrasPhysicalCommand(system.id);
  if (!pending) return { sent: false as const, message: "Nenhum comando Intelbras pendente para esta central." };

  const credential = await getAlarmRemoteCredentialForTransport(system.id, "intelbras_master");
  if (!credential || !/^\d{4}(\d{2})?$/.test(credential)) {
    await updateAlarmRemoteCommandDelivery(pending.id, {
      status: "failed",
      responsePayload: "Comando físico Intelbras bloqueado: a Senha Master cadastrada é inválida ou não está disponível.",
      executedAt: new Date(),
    });
    return { sent: false as const, message: "Comando físico bloqueado: cadastre uma Senha Master Intelbras de 4 ou 6 dígitos." };
  }

  const currentState = await getLatestArmDisarmStatusForSystem(system.id);
  if (!currentState || !currentStateAllowsCommand(pending.commandType as "arm" | "disarm", currentState.qualifier)) {
    await updateAlarmRemoteCommandDelivery(pending.id, {
      status: "failed",
      responsePayload: "Comando físico Intelbras bloqueado: o último estado confirmado do painel não permite esta alternância segura.",
      executedAt: new Date(),
    });
    return { sent: false as const, message: "Comando bloqueado: aguarde um estado Armado/Desarmado confirmado antes de alternar a central." };
  }

  const currentSystem = await getAlarmSystem(system.id);
  if (!currentSystem || currentSystem.brand?.trim().toUpperCase() !== "INTELBRAS" || currentSystem.isActive === false) {
    await updateAlarmRemoteCommandDelivery(pending.id, {
      status: "failed",
      responsePayload: "Comando físico Intelbras bloqueado: cadastro inativo ou marca divergente.",
      executedAt: new Date(),
    });
    return { sent: false as const, message: "Comando bloqueado: a central Intelbras não está ativa no cadastro." };
  }

  const frame = getIntelbrasPhysicalFrameFromPayload(pending.commandPayload);
  if (!frame) {
    await updateAlarmRemoteCommandDelivery(pending.id, {
      status: "failed",
      responsePayload: "Comando físico Intelbras bloqueado: quadro E7 persistido inválido.",
      executedAt: new Date(),
    });
    return { sent: false as const, message: "Comando bloqueado: quadro físico inválido." };
  }

  pendingBySocket.set(socket, { commandId: pending.id, commandType: pending.commandType as "arm" | "disarm" });
  await updateAlarmRemoteCommandDelivery(pending.id, {
    status: "sent",
    responsePayload: "Quadro E7/0x16 enviado somente na sessão identificada pelo MAC; aguardando resposta E7/0x96.",
    executedAt: new Date(),
  });
  socket.write(frame);
  timeoutBySocket.set(socket, setTimeout(() => {
    failPendingCommand(socket, "Comando físico Intelbras sem resposta E7/0x96 em até 12 segundos; resultado indeterminado e auditado como falha.");
  }, INTELBRAS_RESPONSE_TIMEOUT_MS));
  console.log(`[ISEC] INTELBRAS E7/0x16 enviado | comando ${pending.id} | Conta ${system.account}`);
  return { sent: true as const, message: "Quadro E7 enviado; aguardando confirmação da central." };
}

export async function sendIntelbrasPhysicalCommand(input: { alarmSystemId: number; commandId: number }) {
  const session = sessionsBySystemId.get(input.alarmSystemId);
  if (!session || session.socket.destroyed || !session.socket.writable) {
    return { sent: false as const, message: "A central Intelbras está aguardando uma conexão identificada por MAC e conta." };
  }
  const pending = await getPendingIntelbrasPhysicalCommand(input.alarmSystemId);
  if (!pending || pending.id !== input.commandId) {
    return { sent: false as const, message: "O comando físico Intelbras não está mais disponível para entrega." };
  }
  return deliverPendingIntelbrasPhysicalCommand({ id: input.alarmSystemId, account: session.account }, session.socket);
}

export async function consumeIntelbrasPhysicalResponse(socket: net.Socket, frame: Buffer) {
  const pending = pendingBySocket.get(socket);
  if (!pending) return false;
  const response = parseIntelbrasIsecProgramResponse(frame);
  if (!response) return false;

  pendingBySocket.delete(socket);
  clearCommandTimeout(socket);
  const confirmed = response.accepted && isIntelbrasPhysicalStateConfirmed(pending.commandType, response.status);
  const responsePayload = confirmed
    ? `${getIntelbrasPhysicalResponseDescription(response)} Estado confirmado pela central.`
    : `${getIntelbrasPhysicalResponseDescription(response)} Estado não confirmado; nenhuma confirmação falsa foi registrada.`;
  if (confirmed) {
    await recordRemoteCommandConfirmation({ commandId: pending.commandId, responsePayload });
  } else {
    await updateAlarmRemoteCommandDelivery(pending.commandId, {
      status: "failed",
      responsePayload,
      panelConfirmedAt: null,
      executedAt: new Date(),
    });
  }
  console.log(`[ISEC] INTELBRAS E7/0x96 ${confirmed ? "confirmado" : "recusado"} | comando ${pending.commandId} | status 0x${response.status.toString(16).toUpperCase().padStart(2, "0")}`);
  return true;
}

export function clearIntelbrasTransportForTesting() {
  sessionsBySystemId.clear();
}
