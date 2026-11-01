export type ScheduleOverrideDuration = "hour" | "day" | "week";

const TIME_ZONE = "America/Sao_Paulo";

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsAt(instant: Date): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function localDateKey(parts: Pick<DateParts, "year" | "month" | "day">) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function localMidnightToInstant(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const zoned = partsAt(new Date(candidate));
    const represented = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
    const correction = target - represented;
    if (correction === 0) break;
    candidate += correction;
  }
  return new Date(candidate);
}

export function getScheduleOverrideWindow(input: {
  overrideDate: string;
  duration: ScheduleOverrideDuration;
  now?: Date;
}) {
  const now = input.now || new Date();
  if (input.duration === "hour") {
    if (localDateKey(partsAt(now)) !== input.overrideDate) {
      throw new Error("A pausa de uma hora deve começar hoje");
    }
    return { validFromAt: now, validUntilAt: new Date(now.getTime() + 60 * 60_000), endDate: input.overrideDate };
  }
  const validFromAt = localMidnightToInstant(input.overrideDate);
  const dayCount = input.duration === "week" ? 7 : 1;
  const endDate = addCalendarDays(input.overrideDate, dayCount);
  const validUntilAt = localMidnightToInstant(endDate);
  return { validFromAt, validUntilAt, endDate: addCalendarDays(endDate, -1) };
}

export function getOperationalDateKey(instant: Date): string {
  return localDateKey(partsAt(instant));
}
