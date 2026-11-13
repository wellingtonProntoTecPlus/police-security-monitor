export const STAFF_OPERATIONS_ROOM = "staff:operations";

const OPERATIONAL_ROLES = new Set(["admin", "supervisor", "operator"]);

export type SocketAudience = {
  role: string;
  partnerId: number | null;
  isOperational: boolean;
};

export function resolveSocketAudience(role: string, partnerId: number | null | undefined): SocketAudience | null {
  if (role === "partner" && (!Number.isSafeInteger(partnerId) || partnerId! <= 0)) {
    return null;
  }

  return {
    role,
    partnerId: partnerId ?? null,
    isOperational: OPERATIONAL_ROLES.has(role),
  };
}

export function getSocketRooms(audience: SocketAudience, authSessionId: number, userId: number): string[] {
  const rooms = [`auth-session:${authSessionId}`];
  if (audience.isOperational) {
    rooms.push(STAFF_OPERATIONS_ROOM, `operator-user:${userId}`);
  }
  return rooms;
}

type StaffRoomEmitter = {
  to(room: string): {
    emit(eventName: string, payload: any): unknown;
  };
};

export function emitToStaffOperations(io: StaffRoomEmitter, eventName: string, payload: unknown): void {
  io.to(STAFF_OPERATIONS_ROOM).emit(eventName, payload);
}
