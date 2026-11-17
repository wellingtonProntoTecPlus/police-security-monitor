import type net from "net";
import { onAlarmSystemsRetired } from "../_core/alarmSystemRuntime";
import { compatecConnectionIdentityMatches, type CompatecConnectionIdentity, type CompatecIdentitySource } from "../../shared/compatecConnectionIdentity";
import { buildCompatecZoneConfigurationFrames } from "../../shared/compatecZoneConfiguration";

export const COMPATEC_MW1_STATUS_QUERY = "MB=AK0\r\n";
export const COMPATEC_MW1_SECTORS_QUERY = "MB=AK1\r\n";
/**
 * Comandos fixos oficiais informados pela Compatec para o módulo Wi-Fi MW1
 * em 29/10/2026. O PoliceCentral não usa o toggle AK4[0] para botões
 * operacionais, porque a ação depende do estado atual do painel.
 */
export const COMPATEC_MW1_ARM_ALL = "MB=AK4[4]\r\n";
export const COMPATEC_MW1_DISARM_ALL = "MB=AK4[12]\r\n";
export const COMPATEC_MW1_TOGGLE_ALL = "MB=AK4[0]\r\n";

function getCompatecZoneConfigurationFrames(payload: string) {
  try {
    const parsed = JSON.parse(payload);
    if (parsed?.protocol !== "Compatec MicroBus") return null;
    let expected: string[] | null = null;
    if (parsed?.mode === "physical_zone_configuration" && parsed.commandType === "configure_zones") {
      expected = buildCompatecZoneConfigurationFrames(parsed.zoneChanges);
    }
    if (!expected) return null;
    if (!Array.isArray(parsed.frames) || JSON.stringify(parsed.frames) !== JSON.stringify(expected)) return null;
    return expected;
  } catch {
    return null;
  }
}

export function isCompatecZoneConfigurationCommand(payload: string) {
  return Boolean(getCompatecZoneConfigurationFrames(payload));
}

export function isCompatecSessionActive(alarmSystemId: number) {
  const session = activeSessionBySystemId.get(alarmSystemId);
  return Boolean(session && !session.socket.destroyed && session.socket.writable);
}

type ActiveCompatecSession = {
  socket: net.Socket;
  systemId: number;
  account: string;
  capturedIdentity: CompatecConnectionIdentity;
};

const activeSessionBySystemId = new Map<number, ActiveCompatecSession>();
const pendingStatusCommandBySocket = new WeakMap<object, { commandId: number; payload: string }>();
const pendingStatusResponseFragmentBySocket = new WeakMap<object, Buffer>();

onAlarmSystemsRetired((systemIds) => {
  for (const systemId of systemIds) {
    const session = activeSessionBySystemId.get(systemId);
    if (!session) continue;
    activeSessionBySystemId.delete(systemId);
    pendingStatusCommandBySocket.delete(session.socket);
    pendingStatusResponseFragmentBySocket.delete(session.socket);
  }
});

/** Mantém a sessão identificada pelo frame real e sua porta; isso não implica autenticação criptográfica. */
export function rememberActiveCompatecSession(socket: net.Socket, system: {
  id: number;
  account: string;
  receiverPort?: number | null;
  capturedIdentifier?: { identifierType: string; identifier: string };
}) {
  const captured = system.capturedIdentifier;
  if (!captured || (captured.identifierType !== "mac_ascii" && captured.identifierType !== "imei_ascii")
    || !/^[A-F0-9]{6}$/.test(captured.identifier) || !Number.isInteger(system.receiverPort)
    || (system.receiverPort || 0) < 1 || (system.receiverPort || 0) > 65535) return;
  const capturedIdentity: CompatecConnectionIdentity = {
    identifierType: captured.identifierType,
    identifier: captured.identifier,
    receiverPort: system.receiverPort!,
  };
  const session = { socket, systemId: system.id, account: system.account, capturedIdentity };
  activeSessionBySystemId.set(system.id, session);
  const forgetSocketState = () => {
    if (activeSessionBySystemId.get(system.id)?.socket === socket) activeSessionBySystemId.delete(system.id);
    pendingStatusCommandBySocket.delete(socket);
    pendingStatusResponseFragmentBySocket.delete(socket);
  };
  socket.once("close", forgetSocketState);
  socket.once("error", forgetSocketState);
}

/**
 * Envia somente uma consulta de estado pela sessão da central identificada e vinculada
 * ao cadastro físico e à porta do receptor. Nenhuma conexão de saída é aberta pela VPS.
 */
export function sendCompatecMw1StatusQuery(input: { alarmSystemId: number; commandId: number; expectedIdentity: CompatecIdentitySource }) {
  return sendCompatecMw1PhysicalCommand({ ...input, payload: COMPATEC_MW1_STATUS_QUERY });
}

/**
 * Entrega somente quadros MicroBus oficiais para a central Compatec identificada.
 * A VPS nunca abre uma conexão de saída: reutiliza a sessão aberta pelo painel e vinculada
 * a uma identidade física cadastrada e à porta compatível do receptor.
 */
export function sendCompatecMw1PhysicalCommand(input: {
  alarmSystemId: number;
  commandId: number;
  payload: string;
  expectedIdentity: CompatecIdentitySource;
}) {
  // Arme/Desarme totais fixos e configuração setorial construída pelo helper
  // seguro chegam pelas rotas autorizadas e sessão do painel identificado.
  const allowedPayloads = [COMPATEC_MW1_STATUS_QUERY, COMPATEC_MW1_SECTORS_QUERY, COMPATEC_MW1_ARM_ALL, COMPATEC_MW1_DISARM_ALL];
  const zoneFrames = getCompatecZoneConfigurationFrames(input.payload);
  if (!allowedPayloads.includes(input.payload) && !zoneFrames) {
    return { sent: false as const, message: "Comando MicroBus Compatec não autorizado." };
  }
  const session = activeSessionBySystemId.get(input.alarmSystemId);
  if (!session || session.socket.destroyed || !session.socket.writable) {
    return { sent: false as const, message: "A central Compatec não possui conexão ativa com a VPS neste momento." };
  }
  if (!compatecConnectionIdentityMatches(input.expectedIdentity, session.capturedIdentity)) {
    return { sent: false as const, message: "A identidade física e/ou porta cadastrada não corresponde à sessão Compatec ativa; nenhum quadro foi escrito." };
  }
  pendingStatusCommandBySocket.set(session.socket, { commandId: input.commandId, payload: input.payload });
  const writtenFrames = zoneFrames || [input.payload];
  for (const frame of writtenFrames) session.socket.write(frame);
  return { sent: true as const, payload: writtenFrames.join(""), account: session.account };
}

/** Compatibilidade com o nome histórico usado pelas consultas de bancada. */
export const sendCompatecMw1BenchQuery = sendCompatecMw1PhysicalCommand;

export function consumeCompatecMw1StatusResponse(socket: net.Socket, response: string) {
  const pending = pendingStatusCommandBySocket.get(socket);
  if (!pending) return undefined;
  pendingStatusCommandBySocket.delete(socket);
  return { ...pending, response };
}

export function isCompatecArmDisarmConfirmation(payload: string, response: string) {
  if (payload === COMPATEC_MW1_ARM_ALL) return /^MB=KA4(?:\[4\])?\r?\n?$/.test(response);
  if (payload === COMPATEC_MW1_DISARM_ALL) return /^MB=KA4(?:\[12\])?\r?\n?$/.test(response);
  return false;
}

export function isCompatecZoneConfigurationConfirmation(payload: string, response: string) {
  return Boolean(getCompatecZoneConfigurationFrames(payload))
    && /^MB=KA1(?:\[[^\r\n]*\])?\r?\n?$/.test(response);
}

export function getCompatecMw1StatusResponseLine(input: Buffer) {
  const text = input.toString("latin1");
  // O fornecedor documenta também o ACK curto MB=KA1. Se houver '[',
  // aguarda obrigatoriamente ']' em vez de aceitar o prefixo como resposta.
  const match = text.match(/MB=KA[014](?:\[[^\r\n]*\](?:\r\n|\r|\n)?|(?=\r|\n|$)(?:\r\n|\r|\n)?)/);
  return match?.[0];
}

export function getCompatecMw1StatusResponseLineForSocket(socket: object, input: Buffer) {
  const combined = Buffer.concat([pendingStatusResponseFragmentBySocket.get(socket) || Buffer.alloc(0), input]);
  const text = combined.toString("latin1");
  const response = getCompatecMw1StatusResponseLine(combined);
  if (response) {
    pendingStatusResponseFragmentBySocket.delete(socket);
    return response;
  }

  const start = text.lastIndexOf("MB=K");
  if (start < 0) {
    pendingStatusResponseFragmentBySocket.delete(socket);
    return undefined;
  }
  const suffix = text.slice(start);
  const possible = ["MB=KA0", "MB=KA1", "MB=KA4"].some((prefix) => prefix.startsWith(suffix))
    || /^MB=KA[014](?:\[[^\r\n]*)?$/.test(suffix);
  if (possible && suffix.length <= 512) {
    pendingStatusResponseFragmentBySocket.set(socket, Buffer.from(suffix, "latin1"));
  } else {
    pendingStatusResponseFragmentBySocket.delete(socket);
  }
  return undefined;
}
