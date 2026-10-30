import type net from "net";

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

type ActiveCompatecSession = {
  socket: net.Socket;
  systemId: number;
  account: string;
};

const activeSessionBySystemId = new Map<number, ActiveCompatecSession>();
const pendingStatusCommandBySocket = new WeakMap<object, { commandId: number; payload: string }>();

/** Mantém somente a sessão TCP ativa que a própria central abriu para a VPS. */
export function rememberActiveCompatecSession(socket: net.Socket, system: { id: number; account: string }) {
  const session = { socket, systemId: system.id, account: system.account };
  activeSessionBySystemId.set(system.id, session);
  socket.once("close", () => {
    if (activeSessionBySystemId.get(system.id)?.socket === socket) activeSessionBySystemId.delete(system.id);
  });
  socket.once("error", () => {
    if (activeSessionBySystemId.get(system.id)?.socket === socket) activeSessionBySystemId.delete(system.id);
  });
}

/**
 * Envia somente uma consulta de estado e somente por uma conexão já autenticada
 * pela própria central. Nenhuma nova conexão de saída é aberta pela VPS.
 */
export function sendCompatecMw1StatusQuery(input: { alarmSystemId: number; commandId: number }) {
  return sendCompatecMw1PhysicalCommand({ ...input, payload: COMPATEC_MW1_STATUS_QUERY });
}

/**
 * Entrega somente quadros MicroBus oficiais para a central Compatec identificada.
 * A VPS nunca abre uma conexão de saída: reutiliza exclusivamente a sessão autenticada
 * A VPS nunca abre uma conexão de saída: reutiliza exclusivamente a sessão autenticada
 * que a própria central Compatec abriu.
 */
export function sendCompatecMw1PhysicalCommand(input: { alarmSystemId: number; commandId: number; payload: string }) {
  // O Arme e o Desarme fixos chegam somente pela rota Compatec autorizada e
  // pela sessão TCP identificada da própria central. Toggle, partições,
  // setores e PGM continuam fora da entrega física.
  const allowedPayloads = [COMPATEC_MW1_STATUS_QUERY, COMPATEC_MW1_SECTORS_QUERY, COMPATEC_MW1_ARM_ALL, COMPATEC_MW1_DISARM_ALL];
  if (!allowedPayloads.includes(input.payload)) {
    return { sent: false as const, message: "Comando MicroBus Compatec não autorizado." };
  }
  const session = activeSessionBySystemId.get(input.alarmSystemId);
  if (!session || session.socket.destroyed || !session.socket.writable) {
    return { sent: false as const, message: "A central Compatec não possui conexão ativa com a VPS neste momento." };
  }
  pendingStatusCommandBySocket.set(session.socket, { commandId: input.commandId, payload: input.payload });
  session.socket.write(input.payload);
  return { sent: true as const, payload: input.payload, account: session.account };
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
  const isAction = payload === COMPATEC_MW1_ARM_ALL || payload === COMPATEC_MW1_DISARM_ALL;
  return isAction && /^MB=KA4\[[^\r\n]*\]\r?\n?$/.test(response);
}

export function getCompatecMw1StatusResponseLine(input: Buffer) {
  const text = input.toString("latin1");
  const match = text.match(/MB=KA[014](?:\[[^\r\n]*\])?\r?\n?/);
  return match?.[0];
}
