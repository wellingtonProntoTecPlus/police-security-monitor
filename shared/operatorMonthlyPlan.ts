import { addCalendarDays, calendarDayDistance, getShiftWindowFor, resolveOperatorShift, type OperatorShiftSchedule, type OperatorShiftCode } from "./operatorShift";

export function buildOperatorMonthlyPlan(input: {
  fromDate: string; toDate: string;
  people: Array<{ id: number; name: string | null }>;
  assignments: Array<OperatorShiftSchedule & { id: number; userId: number; isActive: boolean }>;
  exceptions: Array<{ id: number; userId: number; workDate: string; kind: "work" | "off"; shiftCode: OperatorShiftCode | null; isActive: boolean; reason: string }>;
}) {
  const length = calendarDayDistance(input.fromDate, input.toDate);
  if (length < 0 || length > 92) throw new Error("Consulte até 93 dias de escala por vez");
  const assignments = [...input.assignments].filter((row) => row.isActive).sort((a, b) => b.effectiveFromDate.localeCompare(a.effectiveFromDate) || b.id - a.id);
  const exceptions = [...input.exceptions].filter((row) => row.isActive).sort((a, b) => b.id - a.id);
  const rows: Array<{ userId: number; operatorName: string; workDate: string; shiftCode: OperatorShiftCode; startAt: Date; endAt: Date; isException: boolean; reason: string | null }> = [];
  for (let day = 0; day <= length; day += 1) {
    const workDate = addCalendarDays(input.fromDate, day);
    for (const person of input.people) {
      const assignment = assignments.find((row) => row.userId === person.id && row.effectiveFromDate <= workDate && (!row.effectiveUntilDate || row.effectiveUntilDate >= workDate));
      const exception = exceptions.find((row) => row.userId === person.id && row.workDate === workDate);
      const shiftCode = resolveOperatorShift({ workDate, schedule: assignment, exception });
      if (!shiftCode) continue;
      const window = getShiftWindowFor(workDate, shiftCode);
      rows.push({ userId: person.id, operatorName: person.name || `Operador ${person.id}`, ...window, isException: Boolean(exception), reason: exception?.reason || null });
    }
  }
  return rows;
}
