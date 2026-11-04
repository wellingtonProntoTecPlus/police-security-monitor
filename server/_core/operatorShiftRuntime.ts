export type OperatorShiftNotice =
  | { kind: "shift_reminder"; reminderId: number; authSessionId: number; userId: number; operatorName: string; shiftCode: "first" | "second" | "third" | "commercial"; minutesBefore: 20 | 40; shiftEndsAt: Date }
  | { kind: "shift_message"; messageId: number; userId: number; fromOperatorName: string; toOperatorName: string; incidentId: number | null; account: string | null };

type NoticeEmitter = (notice: OperatorShiftNotice) => void;
let emitNotice: NoticeEmitter | null = null;
const sessionSocketCounts = new Map<number, number>();

export function setOperatorShiftNoticeEmitter(emitter: NoticeEmitter | null) {
  emitNotice = emitter;
}

export function emitOperatorShiftNotice(notice: OperatorShiftNotice) {
  try { emitNotice?.(notice); } catch (error) { console.error("[Turno] Falha ao emitir aviso privado", error); }
}

export function registerOperatorSocket(authSessionId: number) {
  sessionSocketCounts.set(authSessionId, (sessionSocketCounts.get(authSessionId) || 0) + 1);
}

export function unregisterOperatorSocket(authSessionId: number) {
  const next = (sessionSocketCounts.get(authSessionId) || 0) - 1;
  if (next <= 0) sessionSocketCounts.delete(authSessionId);
  else sessionSocketCounts.set(authSessionId, next);
}

export function isOperatorSessionSocketConnected(authSessionId: number) {
  return (sessionSocketCounts.get(authSessionId) || 0) > 0;
}

export function getConnectedOperatorSessionIds() {
  return new Set(sessionSocketCounts.keys());
}
