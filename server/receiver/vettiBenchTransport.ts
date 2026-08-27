import net from "net";

export const VETTI_BENCH_STATUS_QUERY = Buffer.from([0x02, 0x05, 0xAF, 0x14, 0xFF, 0xB1]);

type ActiveVettiSession = {
  socket: net.Socket;
  systemId: number;
  account: string;
};

const activeSessionBySystemId = new Map<number, ActiveVettiSession>();
const pendingStatusQueryBySocket = new WeakMap<object, { commandId: number }>();

/** Mantém somente o socket que a central Vetti de bancada abriu e autenticou na VPS. */
export function rememberActiveVettiBenchSession(socket: net.Socket, system: { id: number; account: string }) {
  activeSessionBySystemId.set(system.id, { socket, systemId: system.id, account: system.account });
  socket.once("close", () => {
    if (activeSessionBySystemId.get(system.id)?.socket === socket) activeSessionBySystemId.delete(system.id);
  });
}

/** Envia exclusivamente a consulta documentada VSec 0x14; nenhuma ação física é permitida aqui. */
export function sendVettiBenchStatusQuery(input: { alarmSystemId: number; commandId: number }) {
  const session = activeSessionBySystemId.get(input.alarmSystemId);
  if (!session || session.socket.destroyed || !session.socket.writable) {
    return { sent: false as const, message: "A central Vetti de testes não possui conexão autenticada com a VPS neste momento." };
  }
  pendingStatusQueryBySocket.set(session.socket, { commandId: input.commandId });
  session.socket.write(VETTI_BENCH_STATUS_QUERY);
  return { sent: true as const, payload: VETTI_BENCH_STATUS_QUERY.toString("hex").toUpperCase(), account: session.account };
}

/** Consome apenas a resposta VSec 0x94 da consulta 0x14 pendente na mesma sessão. */
export function consumeVettiBenchStatusResponse(socket: net.Socket, data: Buffer) {
  const pending = pendingStatusQueryBySocket.get(socket);
  if (!pending || data.length < 5 || data[0] !== 0x02 || data[2] !== 0xAF || data[3] !== 0x94) return undefined;
  pendingStatusQueryBySocket.delete(socket);
  return { commandId: pending.commandId, payload: VETTI_BENCH_STATUS_QUERY.toString("hex").toUpperCase(), response: data.toString("hex").toUpperCase() };
}
