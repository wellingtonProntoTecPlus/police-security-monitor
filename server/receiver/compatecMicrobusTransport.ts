import type net from "net";

export const COMPATEC_MW1_STATUS_QUERY = "MB=AK0\r\n";
export const COMPATEC_MW1_SECTORS_QUERY = "MB=AK1\r\n";
/**
 * Quadro observado na central de bancada MW1 em 26/08/2026.
 * Apesar de exemplos externos divergentes, a central executou DESARME para este quadro.
 */
export const COMPATEC_MW1_DISARM_ALL = "MB=AK4[0,03FF]\r\n";

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
  return sendCompatecMw1BenchQuery({ ...input, payload: COMPATEC_MW1_STATUS_QUERY });
}

/**
 * Entrega somente quadros MicroBus explicitamente homologados para a central de bancada.
 * A VPS nunca abre uma conexão de saída: reutiliza exclusivamente a sessão autenticada
 * que a própria central Compatec abriu.
 */
export function sendCompatecMw1BenchQuery(input: { alarmSystemId: number; commandId: number; payload: string }) {
  const allowedPayloads = [COMPATEC_MW1_STATUS_QUERY, COMPATEC_MW1_SECTORS_QUERY, COMPATEC_MW1_DISARM_ALL];
  if (!allowedPayloads.includes(input.payload)) {
    return { sent: false as const, message: "Comando MicroBus de bancada não autorizado." };
  }
  const session = activeSessionBySystemId.get(input.alarmSystemId);
  if (!session || session.socket.destroyed || !session.socket.writable) {
    return { sent: false as const, message: "A central de bancada não possui conexão ativa com a VPS neste momento." };
  }
  pendingStatusCommandBySocket.set(session.socket, { commandId: input.commandId, payload: input.payload });
  session.socket.write(input.payload);
  return { sent: true as const, payload: input.payload, account: session.account };
}

export function consumeCompatecMw1StatusResponse(socket: net.Socket, response: string) {
  const pending = pendingStatusCommandBySocket.get(socket);
  if (!pending) return undefined;
  pendingStatusCommandBySocket.delete(socket);
  return { ...pending, response };
}

export function getCompatecMw1StatusResponseLine(input: Buffer) {
  const text = input.toString("latin1");
  const match = text.match(/MB=KA[014](?:\[[^\r\n]*\])?\r?\n?/);
  return match?.[0];
}
