export const OPERATOR_SHIFT_CODES = ["first", "second", "third"] as const;
export type OperatorShiftCode = typeof OPERATOR_SHIFT_CODES[number];
export type OperatorShiftException = { kind: "work" | "off"; shiftCode: OperatorShiftCode | null };
export type OperatorShiftSchedule = {
  shiftCode: OperatorShiftCode;
  cycleAnchorDate: string;
  effectiveFromDate: string;
  effectiveUntilDate?: string | null;
};

export const OPERATOR_SHIFT_LABELS: Record<OperatorShiftCode, string> = {
  first: "1º turno · 07:00 às 13:00",
  second: "2º turno · 13:00 às 19:00",
  third: "3º turno · 19:00 às 07:00",
};

const SHIFT_HOURS: Record<OperatorShiftCode, { start: number; end: number }> = {
  first: { start: 7, end: 13 },
  second: { start: 13, end: 19 },
  third: { start: 19, end: 7 },
};

function validDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addCalendarDays(dateKey: string, amount: number): string {
  if (!validDateKey(dateKey) || !Number.isInteger(amount)) throw new Error("Data operacional inválida");
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function calendarDayDistance(fromDate: string, toDate: string): number {
  if (!validDateKey(fromDate) || !validDateKey(toDate)) throw new Error("Data operacional inválida");
  return Math.round((Date.parse(`${toDate}T00:00:00.000Z`) - Date.parse(`${fromDate}T00:00:00.000Z`)) / 86_400_000);
}

export function isScheduledShiftDate(schedule: OperatorShiftSchedule | null | undefined, workDate: string): boolean {
  if (!schedule || !validDateKey(workDate) || !validDateKey(schedule.cycleAnchorDate) || !validDateKey(schedule.effectiveFromDate)) return false;
  if (workDate < schedule.effectiveFromDate) return false;
  if (schedule.effectiveUntilDate && workDate > schedule.effectiveUntilDate) return false;
  return Math.abs(calendarDayDistance(schedule.cycleAnchorDate, workDate)) % 2 === 0;
}

export function resolveOperatorShift(input: {
  workDate: string;
  schedule?: OperatorShiftSchedule | null;
  exception?: OperatorShiftException | null;
}): OperatorShiftCode | null {
  if (input.exception) {
    if (input.exception.kind === "off") return null;
    return input.exception.shiftCode;
  }
  return isScheduledShiftDate(input.schedule, input.workDate) ? input.schedule!.shiftCode : null;
}

function datePartsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || "00";
  return { year: Number(part("year")), month: Number(part("month")), day: Number(part("day")), hour: Number(part("hour")), minute: Number(part("minute")), second: Number(part("second")) };
}

export function localDateKey(date: Date, timeZone = "America/Sao_Paulo"): string {
  const p = datePartsInZone(date, timeZone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Converte hora civil local para UTC; itera o offset IANA em vez de depender do fuso do servidor. */
export function zonedLocalDateTimeToUtc(dateKey: string, hour: number, minute: number, timeZone = "America/Sao_Paulo"): Date {
  if (!validDateKey(dateKey) || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error("Horário de turno inválido");
  const [year, month, day] = dateKey.split("-").map(Number);
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = desiredAsUtc;
  for (let i = 0; i < 4; i += 1) {
    const p = datePartsInZone(new Date(candidate), timeZone);
    const observedAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
    const correction = desiredAsUtc - observedAsUtc;
    candidate += correction;
    if (correction === 0) break;
  }
  return new Date(candidate);
}

export function getShiftWindowFor(dateKey: string, shiftCode: OperatorShiftCode, timeZone = "America/Sao_Paulo") {
  if (!validDateKey(dateKey)) throw new Error("Data de turno inválida");
  const shift = SHIFT_HOURS[shiftCode];
  const endDate = shiftCode === "third" ? addCalendarDays(dateKey, 1) : dateKey;
  return {
    shiftCode,
    workDate: dateKey,
    startAt: zonedLocalDateTimeToUtc(dateKey, shift.start, 0, timeZone),
    endAt: zonedLocalDateTimeToUtc(endDate, shift.end, 0, timeZone),
  };
}

export function getCurrentShiftWindow(now: Date, timeZone = "America/Sao_Paulo") {
  const p = datePartsInZone(now, timeZone);
  const currentTime = p.hour * 60 + p.minute;
  const today = `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  if (currentTime < 7 * 60) return getShiftWindowFor(addCalendarDays(today, -1), "third", timeZone);
  if (currentTime < 13 * 60) return getShiftWindowFor(today, "first", timeZone);
  if (currentTime < 19 * 60) return getShiftWindowFor(today, "second", timeZone);
  return getShiftWindowFor(today, "third", timeZone);
}

export function getNextShiftWindow(now: Date, timeZone = "America/Sao_Paulo") {
  const current = getCurrentShiftWindow(now, timeZone);
  const nextCode: OperatorShiftCode = current.shiftCode === "first" ? "second" : current.shiftCode === "second" ? "third" : "first";
  const nextWorkDate = current.shiftCode === "third" ? addCalendarDays(current.workDate, 1) : current.workDate;
  return getShiftWindowFor(nextWorkDate, nextCode, timeZone);
}

export function getShiftAfter(workDate: string, shiftCode: OperatorShiftCode, timeZone = "America/Sao_Paulo") {
  const nextCode: OperatorShiftCode = shiftCode === "first" ? "second" : shiftCode === "second" ? "third" : "first";
  const nextWorkDate = shiftCode === "third" ? addCalendarDays(workDate, 1) : workDate;
  return getShiftWindowFor(nextWorkDate, nextCode, timeZone);
}

/** A execução por minuto usa os intervalos fechados para não perder alertas em segundos diferentes. */
export function getShiftReminderDueMinutes(now: Date, shiftEnd: Date): 40 | 20 | null {
  const remaining = shiftEnd.getTime() - now.getTime();
  if (remaining <= 0) return null;
  const minuteCeiling = Math.ceil(remaining / 60_000);
  return minuteCeiling === 40 || minuteCeiling === 20 ? minuteCeiling : null;
}
