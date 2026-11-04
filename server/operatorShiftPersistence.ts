import { and, eq, gte, lte, or, isNull } from "drizzle-orm";
import { operatorShiftAssignments, operatorAttendanceRecords, users } from "../drizzle/schema";
import { addCalendarDays, localDateKey, type OperatorShiftCode } from "@shared/operatorShift";
import { getUserShiftAttendanceWindow, OPERATIONAL_ROLES } from "./operatorShiftSchedule";

export type ShiftAssignmentInput = {
  userId: number;
  shiftCode: OperatorShiftCode;
  effectiveFromDate: string;
  cycleAnchorDate: string;
  changeReason: string;
  changedBy: number;
};

export function validateShiftAssignmentInput(input: Omit<ShiftAssignmentInput, "userId" | "changedBy">) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.cycleAnchorDate)) throw new Error("Informe datas válidas para início da escala e ciclo");
  addCalendarDays(input.effectiveFromDate, 0);
  addCalendarDays(input.cycleAnchorDate, 0);
  if (input.changeReason.trim().length < 5) throw new Error("Informe o motivo da alteração permanente da escala");
}

export async function saveOperatorShiftAssignmentWithTransaction(tx: any, input: ShiftAssignmentInput) {
  validateShiftAssignmentInput(input);
  const [person] = await tx.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.id, input.userId)).for("update").limit(1);
  if (!person || !OPERATIONAL_ROLES.includes(person.role)) throw new Error("Usuário não encontrado ou não possui perfil operacional");
  const previous = await tx.select({ id: operatorShiftAssignments.id }).from(operatorShiftAssignments).where(eq(operatorShiftAssignments.userId, input.userId)).limit(1);
  if (previous.length && input.effectiveFromDate < localDateKey(new Date())) throw new Error("Não é possível reescrever escala retroativa. Preserve o histórico e use uma nova data de início.");
  const effectiveUntil = addCalendarDays(input.effectiveFromDate, -1);
  await tx.update(operatorShiftAssignments).set({ isActive: false, effectiveUntilDate: effectiveUntil }).where(and(
    eq(operatorShiftAssignments.userId, input.userId), eq(operatorShiftAssignments.isActive, true),
    gte(operatorShiftAssignments.effectiveFromDate, input.effectiveFromDate),
  ));
  await tx.update(operatorShiftAssignments).set({ effectiveUntilDate: effectiveUntil }).where(and(
    eq(operatorShiftAssignments.userId, input.userId), eq(operatorShiftAssignments.isActive, true),
    lte(operatorShiftAssignments.effectiveFromDate, effectiveUntil),
    or(isNull(operatorShiftAssignments.effectiveUntilDate), gte(operatorShiftAssignments.effectiveUntilDate, input.effectiveFromDate)),
  ));
  const inserted = await tx.insert(operatorShiftAssignments).values({
    userId: input.userId, operatorName: (person.name || `Operador ${input.userId}`).slice(0, 255),
    shiftCode: input.shiftCode, cycleAnchorDate: input.cycleAnchorDate, effectiveFromDate: input.effectiveFromDate,
    effectiveUntilDate: null, isActive: true, changeReason: input.changeReason.trim().slice(0, 500), changedBy: input.changedBy,
  });
  const now = new Date();
  const window = await getUserShiftAttendanceWindow(tx, input.userId, now);
  if (window) await tx.update(operatorAttendanceRecords).set({
    shiftCode: window.shiftCode, workDate: window.workDate, scheduledStartAt: window.startAt, scheduledEndAt: window.endAt,
  }).where(and(eq(operatorAttendanceRecords.userId, input.userId), isNull(operatorAttendanceRecords.logoutAt)));
  return { success: true, id: Number(inserted[0].insertId), operatorName: person.name };
}
