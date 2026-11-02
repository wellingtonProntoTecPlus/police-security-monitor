import net from "node:net";
import {
  getAlarmRemoteCredentialForTransport,
  getAlarmSystem,
  getLatestArmDisarmStatusForSystem,
  getPendingIntelbrasPhysicalCommand,
  recordRemoteCommandConfirmation,
  updateAlarmRemoteCommandDelivery,
} from "../db";
import { isPhysicalIntelbrasSystem } from "../remoteCommandContract";
import { buildIntelbrasRemoteKeepAliveFrame } from "../intelbrasCommandSimulation";
import { INTELBRAS_PHYSICAL_COMMAND_DISABLED_MESSAGE, INTELBRAS_PHYSICAL_COMMAND_ENABLED } from "@shared/remoteCommandCredentialProfiles";
import {
  buildIntelbrasPhysicalLoginFrame,
  buildIntelbrasPhysicalSessionFinishFrame,
  getIntelbrasPhysicalFrameFromPayload,
  getIntelbrasPhysicalResponseDescription,
  isIntelbrasPhysicalStateConfirmed,
  parseIntelbrasIsecProgramResponse,
} from "./intelbrasIsecProgramTransport";

const INTELBRAS_RESPONSE_TIMEOUT_MS = 12_000;
const INTELBRAS_REFRESH_INTERVAL_MS = 10_000;
const INTELBRAS_ACTION_MAX_WAIT_MS = 30_000;

type IntelbrasSession = {
  socket: net.Socket;
  alarmSystemId: number;
  account: string;
};

type PendingPhysicalCommand = {
  commandId: number;
  commandType: "arm" | "disarm";
  stage: "login" | "action" | "finish";
  actionFrame: Buffer;
  actionStartedAt?: number;
  actionResponse?: string;
  confirmationRecorded: boolean;
  finalizationFailure?: string;
};

const sessionsBySystemId = new Map<number, IntelbrasSession>();
const sessionBySocket = new WeakMap<object, IntelbrasSession>();
const pendingBySocket = new WeakMap<object, PendingPhysicalCommand>();
const timeoutBySocket = new WeakMap<object, ReturnType<typeof setTimeout>>();
const keepAliveTimerBySocket = new WeakMap<object, ReturnType<typeof setTimeout>>();
const cleanupBoundSockets = new WeakSet<object>();

function clearCommandTimeout(socket: net.Socket) {
  const timer = timeoutBySocket.get(socket);
  if (timer) clearTimeout(timer);
  timeoutBySocket.delete(socket);
  const keepAliveTimer = keepAliveTimerBySocket.get(socket);
  if (keepAliveTimer) clearTimeout(keepAliveTimer);
  keepAliveTimerBySocket.delete(socket);
}

function scheduleCommandTimeout(socket: net.Socket) {
  clearCommandTimeout(socket);
  timeoutBySocket.set(socket, setTimeout(() => {
    failPendingCommand(socket, "A central Intelbras não concluiu a etapa ISECProgram dentro do limite de 12 segundos.", true);
  }, INTELBRAS_RESPONSE_TIMEOUT_MS));
}

function scheduleIntelbrasRefresh(socket: net.Socket) {
  const pending = pendingBySocket.get(socket);
  const previous = keepAliveTimerBySocket.get(socket);
  if (previous) clearTimeout(previous);
  if (!pending || pending.stage !== "action" || socket.destroyed || !socket.writable) {
    keepAliveTimerBySocket.delete(socket);
    return;
  }
  const timer = setTimeout(() => {
    const current = pendingBySocket.get(socket);
    if (!current || current.stage !== "action") return;
    if (Date.now() - (current.actionStartedAt || Date.now()) >= INTELBRAS_ACTION_MAX_WAIT_MS) {
      failPendingCommand(socket, "A AMT-8000 não respondeu ao comando 0x16 dentro do limite operacional de 30 segundos.", true);
      return;
    }
    socket.write(buildIntelbrasRemoteKeepAliveFrame());
    scheduleCommandTimeout(socket);
    scheduleIntelbrasRefresh(socket);
  }, INTELBRAS_REFRESH_INTERVAL_MS);
  keepAliveTimerBySocket.set(socket, timer);
}

function failPendingCommand(socket: net.Socket, message: string, tryReleaseKeyboard = false) {
  const pending = pendingBySocket.get(socket);
  if (!pending) return;
  if (tryReleaseKeyboard && pending.stage === "action" && !socket.destroyed && socket.writable) {
    closeRemoteSession(socket, pending, `${message} Enviando 0x15 para tentar liberar o teclado da central.`);
    return;
  }
  pendingBySocket.delete(socket);
  clearCommandTimeout(socket);
  const finalizationFailed = pending.stage === "finish" && pending.confirmationRecorded;
  void updateAlarmRemoteCommandDelivery(pending.commandId, {
    status: finalizationFailed ? "finalization_failed" : "failed",
    responsePayload: `${message}${pending.actionResponse ? ` ${pending.actionResponse}` : ""}`,
    ...(!pending.confirmationRecorded ? { panelConfirmedAt: null } : {}),
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
    failPendingCommand(socket, "Comando Intelbras interrompido: a conexão identificada da central foi encerrada antes da resposta final.");
  });
  socket.once("error", () => {
    failPendingCommand(socket, "Comando Intelbras interrompido: ocorreu erro na conexão identificada antes da resposta final.");
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
  failPendingCommand(socket, "Comando Intelbras interrompido: a sessão física foi encerrada antes da resposta final.");
}

export function isIntelbrasSessionActive(alarmSystemId: number) {
  const session = sessionsBySystemId.get(alarmSystemId);
  return Boolean(session && !session.socket.destroyed && session.socket.writable);
}

function currentStateAllowsCommand(commandType: "arm" | "disarm", qualifier?: string | null) {
  // No histórico do PoliceCentral, R = armado e E = desarmado.
  return commandType === "arm" ? qualifier === "E" : qualifier === "R";
}

function closeRemoteSession(socket: net.Socket, pending: PendingPhysicalCommand, reason?: string) {
  pending.stage = "finish";
  pending.finalizationFailure = reason;
  socket.write(buildIntelbrasPhysicalSessionFinishFrame());
  scheduleCommandTimeout(socket);
}

export async function deliverPendingIntelbrasPhysicalCommand(system: { id: number; account: string }, socket: net.Socket) {
  const session = sessionsBySystemId.get(system.id);
  if (!session || session.socket !== socket || socket.destroyed || !socket.writable) {
    return { sent: false as const, message: "A sessão física Intelbras identificada por MAC e conta não está ativa." };
  }
  if (pendingBySocket.has(socket)) {
    return { sent: false as const, message: "Já existe um comando Intelbras aguardando resposta nesta sessão." };
  }

  const pending = await getPendingIntelbrasPhysicalCommand(system.id);
  if (!pending) return { sent: false as const, message: "Nenhum comando Intelbras disponível para transmissão imediata." };

  const currentSystem = await getAlarmSystem(system.id);
  if (!currentSystem || !isPhysicalIntelbrasSystem(currentSystem) || !currentSystem.remoteCommandLabEnabled) {
    await updateAlarmRemoteCommandDelivery(pending.id, {
      status: "failed",
      responsePayload: "Comando físico Intelbras bloqueado: central inativa, identidade incompleta ou modo de bancada desligado.",
      executedAt: new Date(),
    });
    return { sent: false as const, message: "Comando bloqueado: confirme a identidade da AMT-8000 e ative o modo de bancada para essa central." };
  }

  const remotePassword = await getAlarmRemoteCredentialForTransport(system.id, "intelbras_remote_configuration");
  if (!remotePassword || !/^\d{6}$/.test(remotePassword)) {
    await updateAlarmRemoteCommandDelivery(pending.id, {
      status: "failed",
      responsePayload: "Comando físico Intelbras bloqueado: senha de acesso remoto AMT-8000 inválida ou não cadastrada.",
      executedAt: new Date(),
    });
    return { sent: false as const, message: "Comando bloqueado: cadastre a Senha de Acesso Remoto AMT-8000 de 6 dígitos no cadastro da central." };
  }

  const currentState = await getLatestArmDisarmStatusForSystem(system.id);
  if (!currentState || !currentStateAllowsCommand(pending.commandType as "arm" | "disarm", currentState.qualifier)) {
    await updateAlarmRemoteCommandDelivery(pending.id, {
      status: "failed",
      responsePayload: "Comando físico Intelbras bloqueado: o último estado confirmado do painel não permite esta alternância.",
      executedAt: new Date(),
    });
    return { sent: false as const, message: "Comando bloqueado: aguarde estado Armado/Desarmado confirmado que corresponda à ação desejada." };
  }

  const actionFrame = getIntelbrasPhysicalFrameFromPayload(pending.commandPayload);
  if (!actionFrame) {
    await updateAlarmRemoteCommandDelivery(pending.id, {
      status: "failed",
      responsePayload: "Comando físico Intelbras bloqueado: quadro E7/0x16 persistido inválido.",
      executedAt: new Date(),
    });
    return { sent: false as const, message: "Comando bloqueado: quadro físico inválido." };
  }

  let loginFrame: Buffer;
  try {
    loginFrame = buildIntelbrasPhysicalLoginFrame(remotePassword);
  } catch {
    await updateAlarmRemoteCommandDelivery(pending.id, {
      status: "failed",
      responsePayload: "Comando físico Intelbras bloqueado: senha de acesso remoto AMT-8000 inválida.",
      executedAt: new Date(),
    });
    return { sent: false as const, message: "Comando bloqueado: a senha de acesso remoto AMT-8000 deve ter 6 dígitos." };
  }

  pendingBySocket.set(socket, {
    commandId: pending.id,
    commandType: pending.commandType as "arm" | "disarm",
    stage: "login",
    actionFrame,
    confirmationRecorded: false,
  });
  await updateAlarmRemoteCommandDelivery(pending.id, {
    status: "sent",
    responsePayload: "Login remoto ISECProgram 0x11 enviado; aguardando autenticação da AMT-8000. A senha não é armazenada no quadro/histórico.",
    executedAt: new Date(),
  });
  socket.write(loginFrame);
  scheduleCommandTimeout(socket);
  console.log(`[ISEC] INTELBRAS E7/0x11 enviado | comando ${pending.id} | Conta ${system.account}`);
  return { sent: true as const, message: "Login remoto enviado; aguardando a confirmação da central antes do Arme/Desarme." };
}

export async function sendIntelbrasPhysicalCommand(input: { alarmSystemId: number; commandId: number }) {
  if (!INTELBRAS_PHYSICAL_COMMAND_ENABLED) {
    return { sent: false as const, message: INTELBRAS_PHYSICAL_COMMAND_DISABLED_MESSAGE };
  }
  const session = sessionsBySystemId.get(input.alarmSystemId);
  if (!session || session.socket.destroyed || !session.socket.writable) {
    return { sent: false as const, message: "A central Intelbras está desconectada. Para evitar uma alternância tardia, o comando não será enfileirado." };
  }
  const pending = await getPendingIntelbrasPhysicalCommand(input.alarmSystemId);
  if (!pending || pending.id !== input.commandId) {
    return { sent: false as const, message: "O comando físico Intelbras não está mais disponível para entrega imediata." };
  }
  return deliverPendingIntelbrasPhysicalCommand({ id: input.alarmSystemId, account: session.account }, session.socket);
}

export async function consumeIntelbrasPhysicalResponse(socket: net.Socket, frame: Buffer) {
  const pending = pendingBySocket.get(socket);
  if (!pending) return false;
  const response = parseIntelbrasIsecProgramResponse(frame);
  if (!response) return false;
  const description = getIntelbrasPhysicalResponseDescription(response);

  if (pending.stage === "login") {
    if (response.command === 0x53) {
      pendingBySocket.delete(socket);
      clearCommandTimeout(socket);
      await updateAlarmRemoteCommandDelivery(pending.commandId, {
        status: "failed",
        responsePayload: `${description}; senha de acesso remoto recusada pela AMT-8000.`,
        executedAt: new Date(),
      });
      console.warn(`[ISEC] INTELBRAS login remoto recusado | comando ${pending.commandId}`);
      return true;
    }
    if (response.command !== 0x50 || response.data.length !== 0) return false;

    clearCommandTimeout(socket);
    const session = sessionBySocket.get(socket);
    const currentSystem = session ? await getAlarmSystem(session.alarmSystemId) : undefined;
    const currentState = session ? await getLatestArmDisarmStatusForSystem(session.alarmSystemId) : undefined;
    if (
      !session
      || !currentSystem
      || !isPhysicalIntelbrasSystem(currentSystem)
      || !currentSystem.remoteCommandLabEnabled
      || !currentState
      || !currentStateAllowsCommand(pending.commandType, currentState.qualifier)
    ) {
      closeRemoteSession(socket, pending, "O estado ou a autorização da central mudou durante o login; o comando 0x16 foi bloqueado.");
      await updateAlarmRemoteCommandDelivery(pending.commandId, {
        status: "sent",
        responsePayload: `${description}; login aceito, mas o comando 0x16 foi bloqueado porque o estado/autorização mudou. Enviando finalização 0x15.`,
      });
      return true;
    }

    pending.stage = "action";
    pending.actionStartedAt = Date.now();
    socket.write(pending.actionFrame);
    await updateAlarmRemoteCommandDelivery(pending.commandId, {
      status: "sent",
      responsePayload: `${description}; login ISECProgram 0x11 aceito; comando 0x16 enviado. Aguardando resposta 0x96.`,
    });
    scheduleCommandTimeout(socket);
    scheduleIntelbrasRefresh(socket);
    console.log(`[ISEC] INTELBRAS login 0x11 confirmado; E7/0x16 enviado | comando ${pending.commandId}`);
    return true;
  }

  if (pending.stage === "action") {
    if (response.command === 0x90 && response.data.length === 0) {
      scheduleCommandTimeout(socket);
      scheduleIntelbrasRefresh(socket);
      return true;
    }
    if (response.command !== 0x96 || response.data.length !== 1) return false;
    clearCommandTimeout(socket);
    const status = response.data[0]!;
    const stateConfirmed = isIntelbrasPhysicalStateConfirmed(pending.commandType, status);
    pending.actionResponse = `${description}; ${stateConfirmed ? "estado desejado confirmado" : "estado desejado não confirmado"}.`;
    if (stateConfirmed) {
      const recorded = await recordRemoteCommandConfirmation({
        commandId: pending.commandId,
        responsePayload: pending.actionResponse,
      });
      pending.confirmationRecorded = recorded.recorded;
    }
    closeRemoteSession(socket, pending, stateConfirmed ? undefined : "A central respondeu ao 0x16 sem confirmar o estado solicitado.");
    await updateAlarmRemoteCommandDelivery(pending.commandId, {
      status: pending.confirmationRecorded ? "responded" : "sent",
      responsePayload: `${pending.actionResponse} Enviando 0x15 para liberar o teclado; aguardando resposta 0x95.`,
    });
    console.log(`[ISEC] INTELBRAS E7/0x96 recebido | comando ${pending.commandId} | status 0x${status.toString(16).toUpperCase().padStart(2, "0")}`);
    return true;
  }

  if (pending.stage === "finish") {
    if (response.command !== 0x95 || response.data.length !== 0) return false;
    pendingBySocket.delete(socket);
    clearCommandTimeout(socket);
    const responsePayload = pending.finalizationFailure
      ? `${pending.finalizationFailure} ${pending.actionResponse || description} Liberação 0x15 confirmada pela central.`
      : `${pending.actionResponse || "Estado 0x96 recebido."} Liberação 0x15 confirmada pela central.`;
    if (pending.confirmationRecorded) {
      await updateAlarmRemoteCommandDelivery(pending.commandId, {
        status: "responded",
        responsePayload,
        executedAt: new Date(),
      });
    } else {
      await updateAlarmRemoteCommandDelivery(pending.commandId, {
        status: "failed",
        responsePayload,
        panelConfirmedAt: null,
        executedAt: new Date(),
      });
    }
    console.log(`[ISEC] INTELBRAS E7/0x15 confirmado | comando ${pending.commandId} | ação ${pending.confirmationRecorded ? "confirmada" : "não confirmada"}`);
    return true;
  }

  return false;
}

export function clearIntelbrasTransportForTesting() {
  sessionsBySystemId.clear();
}
