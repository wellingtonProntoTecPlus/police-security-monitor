import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { operatorShiftAssignments, operatorShiftExceptions, users } from "../drizzle/schema";
import { getCurrentShiftWindow, getNextShiftWindow, getShiftWindowFor, localDateKey, resolveOperatorShift, type OperatorShiftCode } from "@shared/operatorShift";

export const OPERATIONAL_ROLES = ["admin", "supervisor", "operator"] as const;

export async function listRosterForWindow(db: any, workDate: string, shiftCode?: OperatorShiftCode, excludeUserId?: number) {
  const operatorRows = await db.select({ id: users.id, name: users.name, role: users.role }).from(users)
    .where(inArray(users.role, [...OPERATIONAL_ROLES]));
  const ids = operatorRows.map((row: any) => Number(row.id));
  if (ids.length === 0) return [];
  const assignments = await db.select().from(operatorShiftAssignments).where(and(
    inArray(operatorShiftAssignments.userId, ids),
    eq(operatorShiftAssignments.isActive, true),
    lte(operatorShiftAssignments.effectiveFromDate, workDate),
    or(isNull(operatorShiftAssignments.effectiveUntilDate), gte(operatorShiftAssignments.effectiveUntilDate, workDate)),
  )).orderBy(desc(operatorShiftAssignments.effectiveFromDate), desc(operatorShiftAssignments.id));
  const exceptions = await db.select().from(operatorShiftExceptions).where(and(
    inArray(operatorShiftExceptions.userId, ids), eq(operatorShiftExceptions.workDate, workDate), eq(operatorShiftExceptions.isActive, true),
  )).orderBy(desc(operatorShiftExceptions.id));
  const assignmentByUser = new Map<number, any>();
  for (const assignment of assignments) if (!assignmentByUser.has(Number(assignment.userId))) assignmentByUser.set(Number(assignment.userId), assignment);
  const exceptionByUser = new Map<number, any>();
  for (const exception of exceptions) if (!exceptionByUser.has(Number(exception.userId))) exceptionByUser.set(Number(exception.userId), exception);
  return operatorRows.flatMap((person: any) => {
    const userId = Number(person.id);
    const exception = exceptionByUser.get(userId);
    const assignment = assignmentByUser.get(userId);
    const resolved = resolveOperatorShift({
      workDate,
      schedule: assignment ? { shiftCode: assignment.shiftCode as OperatorShiftCode, cycleAnchorDate: assignment.cycleAnchorDate, effectiveFromDate: assignment.effectiveFromDate, effectiveUntilDate: assignment.effectiveUntilDate } : null,
      exception: exception ? { kind: exception.kind, shiftCode: exception.shiftCode } : null,
    });
    if (!resolved || (shiftCode && resolved !== shiftCode) || userId === excludeUserId) return [];
    return [{ userId, name: person.name || `Operador ${userId}`, role: person.role, shiftCode: resolved, isException: Boolean(exception), exceptionReason: exception?.reason || null }];
  });
}

export async function getUserShiftAttendanceWindow(db: any, userId: number, now: Date) {
  const candidates = [getCurrentShiftWindow(now), getNextShiftWindow(now), getShiftWindowFor(localDateKey(now), "commercial")];
  const unique = Array.from(new Map(candidates.map((window) => [`${window.workDate}:${window.shiftCode}`, window])).values());
  for (const candidate of unique) {
    const startsWithinWindow = now.getTime() >= candidate.startAt.getTime() - 6 * 60 * 60_000 && now < candidate.endAt;
    if (!startsWithinWindow) continue;
    const roster = await listRosterForWindow(db, candidate.workDate, candidate.shiftCode);
    const scheduled = roster.some((person: any) => person.userId === userId);
    if (scheduled) return candidate;
  }
  return null;
}

/** A janela de lembretes permite entrada antecipada; a auditoria do login não. */
export async function getUserLoginScheduleStatus(db: any, userId: number, loginAt: Date, reminderWindow: Awaited<ReturnType<typeof getUserShiftAttendanceWindow>>) {
  if (reminderWindow) return loginAt >= reminderWindow.startAt && loginAt < reminderWindow.endAt ? "scheduled" as const : "outside_window" as const;
  const [assignment] = await db.select({ id: operatorShiftAssignments.id }).from(operatorShiftAssignments).where(and(
    eq(operatorShiftAssignments.userId, userId), eq(operatorShiftAssignments.isActive, true),
    lte(operatorShiftAssignments.effectiveFromDate, localDateKey(loginAt)),
    or(isNull(operatorShiftAssignments.effectiveUntilDate), gte(operatorShiftAssignments.effectiveUntilDate, localDateKey(loginAt))),
  )).limit(1);
  // Sem escala vigente, não inventar falta nem obrigar uma justificativa falsa.
  return assignment ? "outside_window" as const : null;
}
