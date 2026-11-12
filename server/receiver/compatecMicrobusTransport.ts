import type net from "net";
import { onAlarmSystemsRetired } from "../_core/alarmSystemRuntime";
import { buildCompatecPhysicalArmWithZonesFrames, buildCompatecPhysicalZoneFrames } from "../remoteCommandContract";

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

function getCompatecPhysicalZoneFrames(payload: string) {
  try {
    const parsed = JSON.parse(payload);
    if (parsed?.protocol !== "Compatec MicroBus" || parsed?.mode !== "physical") return null;
    if (parsed.commandType !== "isolate_zone" && parsed.commandType !== "restore_zone") return null;
    const expected = buildCompatecPhysicalZoneFrames({ commandType: parsed.commandType, zoneNumber: parsed.zoneNumber });
    if (!Array.isArray(parsed.frames) || JSON.stringify(parsed.frames) !== JSON.stringify(expected)) return null;
    return expected;
  } catch {
    return null;
  }
}

export function isCompatecPhysicalZoneCommand(payload: string) {
  return Boolean(getCompatecPhysicalZoneFrames(payload));
}

function getCompatecArmWithZonesFrames(payload: string) {
  try {
    const parsed = JSON.parse(payload);
    if (parsed?.protocol !== "Compatec MicroBus" || parsed.mode !== "physical_arm_with_zones" || parsed.commandType !== "arm" || !Array.isArray(parsed.zoneNumbers) || parsed.zoneNumbers.length === 0) return null;
    const expected = buildCompatecPhysicalArmWithZonesFrames(parsed.zoneNumbers);
    if (JSON.stringify(parsed.frames) !== JSON.stringify(expected)) return null;
    return expected;
  } catch { return null; }
}
export function isCompatecArmWithZonesCommand(payload: string) { return Boolean(getCompatecArmWithZonesFrames(payload)); }
export function isCompatecSessionActive(alarmSystemId: number) {
  const session = activeSessionBySystemId.get(alarmSystemId);
  return Boolean(session && !session.socket.destroyed && session.socket.writable);
}

type ActiveCompatecSession = {
  socket: net.Socket;
  systemId: number;
  account: string;
};

const activeSessionBySystemId = new Map<number, ActiveCompatecSession>();
const pendingStatusCommandBySocket = new WeakMap<object, { commandId: number; payload: string; stage?: "zone_ack" | "ready_arm" | "arm_ack" }>();
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

/** Mantém a sessão TCP iniciada pelo painel após validar identidade física única e porta cadastrada; não implica autenticação criptográfica. */
export function rememberActiveCompatecSession(socket: net.Socket, system: { id: number; account: string }) {
  const session = { socket, systemId: system.id, account: system.account };
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
export function sendCompatecMw1StatusQuery(input: { alarmSystemId: number; commandId: number }) {
  return sendCompatecMw1PhysicalCommand({ ...input, payload: COMPATEC_MW1_STATUS_QUERY });
}

/**
 * Entrega somente quadros MicroBus oficiais para a central Compatec identificada.
 * A VPS nunca abre uma conexão de saída: reutiliza a sessão aberta pelo painel e vinculada
 * a uma identidade física cadastrada e à porta compatível do receptor.
 */
export function sendCompatecMw1PhysicalCommand(input: { alarmSystemId: number; commandId: number; payload: string }) {
  // Arme/Desarme fixos e bypass construído pelo helper seguro chegam somente
  // pelas rotas Compatec autorizadas e pela sessão TCP vinculada ao painel identificado.
  const allowedPayloads = [COMPATEC_MW1_STATUS_QUERY, COMPATEC_MW1_SECTORS_QUERY, COMPATEC_MW1_ARM_ALL, COMPATEC_MW1_DISARM_ALL];
  const zoneFrames = getCompatecPhysicalZoneFrames(input.payload);
  const armWithZonesFrames = getCompatecArmWithZonesFrames(input.payload);
  if (!allowedPayloads.includes(input.payload) && !zoneFrames && !armWithZonesFrames) {
    return { sent: false as const, message: "Comando MicroBus Compatec não autorizado." };
  }
  const session = activeSessionBySystemId.get(input.alarmSystemId);
  if (!session || session.socket.destroyed || !session.socket.writable) {
    return { sent: false as const, message: "A central Compatec não possui conexão ativa com a VPS neste momento." };
  }
  pendingStatusCommandBySocket.set(session.socket, { commandId: input.commandId, payload: input.payload, ...(armWithZonesFrames ? { stage: "zone_ack" as const } : {}) });
  const writtenFrames = armWithZonesFrames ? armWithZonesFrames.slice(0, 2) : zoneFrames || [input.payload];
  for (const frame of writtenFrames) session.socket.write(frame);
  return { sent: true as const, payload: writtenFrames.join(""), account: session.account };
}

/** Continuação exige o mesmo socket e a resposta KA1; não permite reconexão/reenvio automático. */
export function sendCompatecMw1ArmAfterZones(input: { alarmSystemId: number; commandId: number }) {
  const session = activeSessionBySystemId.get(input.alarmSystemId);
  const pending = session && pendingStatusCommandBySocket.get(session.socket);
  if (!session || session.socket.destroyed || !session.socket.writable || pending?.commandId !== input.commandId || pending.stage !== "ready_arm") {
    return { sent: false as const, message: "Sequência interrompida antes do Arme; conferir a central. Não reenviar automaticamente." };
  }
  pendingStatusCommandBySocket.set(session.socket, { ...pending, stage: "arm_ack" });
  session.socket.write(COMPATEC_MW1_ARM_ALL);
  return { sent: true as const, payload: COMPATEC_MW1_ARM_ALL, account: session.account };
}

/** Compatibilidade com o nome histórico usado pelas consultas de bancada. */
export const sendCompatecMw1BenchQuery = sendCompatecMw1PhysicalCommand;

export function consumeCompatecMw1StatusResponse(socket: net.Socket, response: string) {
  const pending = pendingStatusCommandBySocket.get(socket);
  if (!pending) return undefined;
  if (pending.stage === "zone_ack" && /^MB=KA1(?:\[[^\r\n]*\])?\r?\n?$/.test(response)) {
    pendingStatusCommandBySocket.set(socket, { ...pending, stage: "ready_arm" });
    return { ...pending, response, intermediateZoneAck: true as const };
  }
  pendingStatusCommandBySocket.delete(socket);
  return { ...pending, response };
}

export function isCompatecArmDisarmConfirmation(payload: string, response: string) {
  if (payload === COMPATEC_MW1_ARM_ALL || isCompatecArmWithZonesCommand(payload)) return /^MB=KA4\[4\]\r?\n?$/.test(response);
  if (payload === COMPATEC_MW1_DISARM_ALL) return /^MB=KA4\[12\]\r?\n?$/.test(response);
  return false;
}

export function isCompatecPhysicalZoneConfirmation(payload: string, response: string) {
  return Boolean(getCompatecPhysicalZoneFrames(payload))
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
