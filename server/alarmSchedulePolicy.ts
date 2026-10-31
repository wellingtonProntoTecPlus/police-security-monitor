const TIME_ZONE = "America/Sao_Paulo";
const DEFAULT_TOLERANCE_MINUTES = 10;

export type AlarmExpectedState = "armed" | "disarmed" | "unknown";
export type AlarmIsolationState = "isolated" | "restored";
export type AlarmEventKind = "arm" | "disarm" | "isolation" | "unknown";

export type ContactIdCatalogRecord = {
  code?: string | number | null;
  qualifier?: string | null;
  fabricante?: string | null;
  brand?: string | null;
  tipo?: string | null;
  type?: string | null;
  description?: string | null;
  category?: string | null;
  [key: string]: unknown;
};

export type ContactIdOperationalEvent = ContactIdCatalogRecord & {
  eventCode?: string | number | null;
  qualifier?: string | null;
  brand?: string | null;
  description?: string | null;
  tipo?: string | null;
  receivedAt?: Date | string | null;
  occurredAt?: Date | string | null;
  timestamp?: Date | string | null;
  catalog?: ContactIdCatalogRecord | ContactIdCatalogRecord[] | null;
  codeInfo?: ContactIdCatalogRecord | ContactIdCatalogRecord[] | null;
  catalogRecord?: ContactIdCatalogRecord | null;
  contactIdCode?: ContactIdCatalogRecord | null;
};

export type OperationalEventClassification = {
  kind: AlarmEventKind;
  state: AlarmExpectedState | AlarmIsolationState;
  mode?: "stay";
};

export type AlarmDayRule = {
  armAt?: string | number | null;
  disarmAt?: string | number | null;
  arm?: string | number | null;
  disarm?: string | number | null;
  [key: string]: unknown;
};

export type AlarmHolidayRule = AlarmDayRule & {
  date?: string | Date | null;
  holidayArm?: string | number | null;
  holidayDisarm?: string | number | null;
};

export type AlarmDateException = {
  date?: string | Date | null;
  suspended?: boolean | null;
  override?: AlarmDayRule | null;
  armAt?: string | number | null;
  disarmAt?: string | number | null;
  [key: string]: unknown;
};

export type AlarmSchedule = {
  weekly?: Record<string, AlarmDayRule> | null;
  weeklySchedule?: Record<string, AlarmDayRule> | null;
  days?: Record<string, AlarmDayRule> | null;
  holidays?: AlarmHolidayRule[] | Record<string, AlarmHolidayRule> | null;
  holidayRules?: AlarmHolidayRule[] | Record<string, AlarmHolidayRule> | null;
  holidayDates?: Record<string, AlarmHolidayRule> | null;
  holiday?: AlarmHolidayRule | null;
  exceptions?: AlarmDateException[] | Record<string, AlarmDateException> | null;
  dateExceptions?: AlarmDateException[] | Record<string, AlarmDateException> | null;
  [key: string]: unknown;
};

export type ScheduleTransition = {
  kind: "arm" | "disarm";
  state: "armed" | "disarmed";
  at: Date;
  isOverdue: boolean;
  minutesFromNow: number;
};

export type ScheduleStatus =
  | "within_schedule"
  | "unexpected_disarm"
  | "missed_arm"
  | "report_only";

export type ScheduleEvaluationInput = {
  at?: Date | string | number | null;
  now?: Date | string | number | null;
  schedule?: AlarmSchedule | null;
  weekly?: Record<string, AlarmDayRule> | null;
  weeklySchedule?: Record<string, AlarmDayRule> | null;
  holidays?: AlarmHolidayRule[] | Record<string, AlarmHolidayRule> | null;
  holidayRules?: AlarmHolidayRule[] | Record<string, AlarmHolidayRule> | null;
  holidayDates?: Record<string, AlarmHolidayRule> | null;
  exceptions?: AlarmDateException[] | Record<string, AlarmDateException> | null;
  dateExceptions?: AlarmDateException[] | Record<string, AlarmDateException> | null;
  actualState?: AlarmExpectedState | "arm" | "disarm" | null;
  observedState?: AlarmExpectedState | "arm" | "disarm" | null;
  currentState?: AlarmExpectedState | "arm" | "disarm" | null;
  event?: ContactIdOperationalEvent | OperationalEventClassification | null;
  observedEvent?: ContactIdOperationalEvent | OperationalEventClassification | null;
  lastEvent?: ContactIdOperationalEvent | OperationalEventClassification | null;
  [key: string]: unknown;
};

export type ScheduleDecision = {
  expectedState: AlarmExpectedState;
  transition: ScheduleTransition | null;
  status: ScheduleStatus;
  toleranceMinutes: number;
  nextTransition?: ScheduleTransition | null;
  overdueTransition?: ScheduleTransition | null;
};

export type AlarmScheduleEventAction = "queue" | "report_only" | "use_catalog";

export function getAlarmScheduleEventAction(input: {
  classification: OperationalEventClassification;
  hasActiveSchedule: boolean;
  decision?: ScheduleDecision | null;
}): AlarmScheduleEventAction {
  const { classification, hasActiveSchedule, decision } = input;
  if (classification.kind === "isolation") return "report_only";
  if (classification.kind !== "arm" && classification.kind !== "disarm") return "use_catalog";
  if (!hasActiveSchedule || classification.mode === "stay") return "report_only";
  if (decision?.status === "unexpected_disarm") return "queue";
  return "report_only";
}

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };
type ResolvedDayRule = { armAt?: string | number | null; disarmAt?: string | number | null };
type InternalTransition = {
  kind: "arm" | "disarm";
  state: "armed" | "disarmed";
  at: Date;
};
type RecordValue = Record<string, unknown>;

const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
const WEEKDAY_ALIASES: Record<string, (typeof WEEKDAY_NAMES)[number]> = {
  sun: "sunday",
  sunday: "sunday",
  domingo: "sunday",
  dom: "sunday",
  mon: "monday",
  monday: "monday",
  segunda: "monday",
  "segunda-feira": "monday",
  tue: "tuesday",
  tuesday: "tuesday",
  terca: "tuesday",
  terça: "tuesday",
  "terça-feira": "tuesday",
  wed: "wednesday",
  wednesday: "wednesday",
  quarta: "wednesday",
  "quarta-feira": "wednesday",
  thu: "thursday",
  thursday: "thursday",
  quinta: "thursday",
  "quinta-feira": "thursday",
  fri: "friday",
  friday: "friday",
  sexta: "friday",
  "sexta-feira": "friday",
  sat: "saturday",
  saturday: "saturday",
  sabado: "saturday",
  sábado: "saturday",
  "sábado-feira": "saturday",
};
const DAY_NUMBER_NAMES: Record<string, (typeof WEEKDAY_NAMES)[number]> = {
  "0": "sunday",
  "1": "monday",
  "2": "tuesday",
  "3": "wednesday",
  "4": "thursday",
  "5": "friday",
  "6": "saturday",
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeCode(value: unknown): string {
  return String(value ?? "").trim().replace(/\D/g, "");
}

function normalizeBrand(value: unknown): string {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function normalizeQualifier(value: unknown): "E" | "R" | "" {
  const qualifier = String(value ?? "").trim().toUpperCase();
  if (qualifier === "E" || qualifier === "1") return "E";
  if (qualifier === "R") return "R";
  return "";
}

function own(record: RecordValue, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function firstValue(record: RecordValue, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (own(record, key)) return record[key];
  }
  return undefined;
}

function asRecordArray(value: unknown): RecordValue[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  return isRecord(value) ? [value] : [];
}

function getCatalogRecords(event: ContactIdOperationalEvent): RecordValue[] {
  const records: RecordValue[] = [];
  const topLevel = event as RecordValue;
  if (own(topLevel, "tipo") || own(topLevel, "type") || own(topLevel, "description")) records.push(topLevel);
  for (const key of ["catalog", "codeInfo", "catalogRecord", "contactIdCode", "record"]) {
    records.push(...asRecordArray(topLevel[key]));
  }
  return records;
}

function isExactCatalogRecord(record: RecordValue, event: ContactIdOperationalEvent): boolean {
  const code = firstValue(record, ["eventCode", "code"]);
  if (code !== undefined && normalizeCode(code) !== normalizeCode(event.eventCode ?? (event as RecordValue).code)) return false;
  const recordQualifier = firstValue(record, ["qualifier"]);
  const eventQualifier = normalizeQualifier(event.qualifier);
  if (recordQualifier !== undefined && normalizeQualifier(recordQualifier) !== eventQualifier) return false;
  const recordBrand = firstValue(record, ["brand", "fabricante", "manufacturer"]);
  const eventBrand = normalizeBrand(event.brand ?? (event as RecordValue).fabricante);
  if (recordBrand !== undefined && eventBrand && normalizeBrand(recordBrand) !== eventBrand && normalizeBrand(recordBrand) !== "universal") return false;
  return true;
}

type CatalogState = "arm" | "disarm" | "ambiguous" | undefined;

function stateFromCatalogWord(value: unknown): CatalogState {
  const text = normalizeText(value);
  if (!text) return undefined;
  const saysDisarm = /desarm|desarme|desarmado|desarmada|deslig/.test(text);
  const saysArm = /autoarm|\barme\b|\barmado\b|\barmada\b|\barmar\b|\barmed\b|\bstay\b/.test(text);
  if (saysDisarm && saysArm) return "ambiguous";
  if (saysDisarm) return "disarm";
  if (saysArm) return "arm";
  return undefined;
}

function stateFromExactCatalog(event: ContactIdOperationalEvent): CatalogState {
  const records = getCatalogRecords(event).filter(record => isExactCatalogRecord(record, event));
  for (const record of records) {
    const typeValue = firstValue(record, ["tipo", "type"]);
    const descriptionValue = firstValue(record, ["description", "descricao", "descrição"]);
    const typeState = stateFromCatalogWord(typeValue);
    const descriptionState = stateFromCatalogWord(descriptionValue);
    if (typeState === "ambiguous" || descriptionState === "ambiguous") return "ambiguous";
    if (typeState && descriptionState && typeState !== descriptionState) return "ambiguous";
    if (typeState || descriptionState) return typeState || descriptionState;
  }
  return undefined;
}

function makeClassification(kind: AlarmEventKind, state: OperationalEventClassification["state"], mode?: "stay"): OperationalEventClassification {
  const result: OperationalEventClassification = mode ? { kind, state, mode } : { kind, state };
  Object.defineProperties(result, {
    eventType: { value: kind, enumerable: false },
    operationalState: { value: state, enumerable: false },
    isolationState: { value: kind === "isolation" ? state : undefined, enumerable: false },
  });
  return result;
}

function classifyKnownIsolation(code: string, qualifier: "E" | "R" | ""): OperationalEventClassification | null {
  if (!qualifier) return null;
  const isolatedCodes = new Set(["570", "573", "1530", "1570"]);
  const restoredCodes = new Set(["3530", "3570"]);
  if (isolatedCodes.has(code) && qualifier === "E") return makeClassification("isolation", "isolated");
  if (code === "570" && qualifier === "R") return makeClassification("isolation", "restored");
  if (restoredCodes.has(code) && qualifier === "R") return makeClassification("isolation", "restored");
  return null;
}

function classifyTextIsolation(description: unknown, qualifier: "E" | "R" | ""): OperationalEventClassification | null {
  const text = normalizeText(description);
  if (!text || !/(zona|zonas|setor|setores)/.test(text) || !/(isol|anul|bypass|inib)/.test(text) || !qualifier) return null;
  const restoration = /(restaur|reativ|desinib|normaliz)/.test(text);
  if (qualifier === "E" && restoration) return makeClassification("unknown", "unknown");
  if (qualifier === "R" && !restoration && /\b(restaur|reativ|desinib)\b/.test(text)) return makeClassification("unknown", "unknown");
  return makeClassification("isolation", qualifier === "E" ? "isolated" : "restored");
}

/** Classifica somente estados operacionais confirmados; eventos desconhecidos não alteram estado. */
export function classifyContactIdOperationalEvent(event: ContactIdOperationalEvent): OperationalEventClassification {
  const code = normalizeCode(event.eventCode ?? (event as RecordValue).code);
  const qualifier = normalizeQualifier(event.qualifier);
  const brand = normalizeBrand(event.brand ?? (event as RecordValue).fabricante);

  if (code === "403") {
    const catalogState = stateFromExactCatalog(event);
    if (catalogState === "arm") return makeClassification("arm", "armed");
    if (catalogState === "disarm") return makeClassification("disarm", "disarmed");
    return makeClassification("unknown", "unknown");
  }

  const catalogState = stateFromExactCatalog(event);
  if (catalogState === "arm") {
    const catalogText = getCatalogRecords(event)
      .filter(record => isExactCatalogRecord(record, event))
      .map(record => `${String(firstValue(record, ["tipo", "type"]) ?? "")} ${String(firstValue(record, ["description", "descricao", "descrição"]) ?? "")}`)
      .join(" ");
    return makeClassification("arm", "armed", /\bstay\b|parcial/i.test(normalizeText(catalogText)) ? "stay" : undefined);
  }
  if (catalogState === "disarm") return makeClassification("disarm", "disarmed");

  const knownIsolation = classifyKnownIsolation(code, qualifier);
  if (knownIsolation) return knownIsolation;

  const descriptions = [
    event.description,
    ...(getCatalogRecords(event).map(record => firstValue(record, ["description", "descricao", "descrição"]))),
  ];
  for (const description of descriptions) {
    const textClassification = classifyTextIsolation(description, qualifier);
    if (textClassification) return textClassification;
  }

  if (!qualifier) return makeClassification("unknown", "unknown");
  if (["401", "407", "409"].includes(code)) {
    return qualifier === "R" ? makeClassification("arm", "armed") : makeClassification("disarm", "disarmed");
  }
  if (code === "408" || code === "441") {
    return qualifier === "R" ? makeClassification("arm", "armed") : makeClassification("unknown", "unknown");
  }
  if (code === "701" && brand === "compatec") {
    return qualifier === "R" ? makeClassification("arm", "armed") : makeClassification("disarm", "disarmed");
  }
  if (brand === "vetti" && ["3401", "3403", "3407", "3441"].includes(code) && qualifier === "E") {
    return makeClassification("arm", "armed", code === "3441" ? "stay" : undefined);
  }
  if (brand === "radioenge" && code === "456") {
    return qualifier === "R" ? makeClassification("arm", "armed", "stay") : makeClassification("disarm", "disarmed");
  }
  return makeClassification("unknown", "unknown");
}

export const classifyOperationalAlarmEvent = classifyContactIdOperationalEvent;
export const classifyAlarmEvent = classifyContactIdOperationalEvent;
export const classifyAlarmScheduleEvent = classifyContactIdOperationalEvent;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKeyFromParts(parts: Pick<DateParts, "year" | "month" | "day">): string {
  return `${String(parts.year).padStart(4, "0")}-${pad(parts.month)}-${pad(parts.day)}`;
}

function zonedParts(date: Date): DateParts | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const values = Object.fromEntries(DATE_TIME_FORMATTER.formatToParts(date).map(part => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const second = Number(values.second);
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;
  return { year, month, day, hour, minute, second };
}

function instantFromWallTime(dateKey: string, hour: number, minute: number): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const desiredWall = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = zonedParts(new Date(guess));
    if (!parts) return null;
    const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
    const offset = representedAsUtc - guess;
    const adjusted = desiredWall - offset;
    if (adjusted === guess) break;
    guess = adjusted;
  }
  return new Date(guess);
}

function parseInstant(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const input = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (dateOnly) return instantFromWallTime(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, 0, 0);
  const localDateTime = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(input);
  if (localDateTime) {
    return instantFromWallTime(
      `${localDateTime[1]}-${localDateTime[2]}-${localDateTime[3]}`,
      Number(localDateTime[4]),
      Number(localDateTime[5]),
    );
  }
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateKey(value: unknown): string | null {
  if (typeof value === "string") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value.trim());
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  }
  const date = parseInstant(value);
  const parts = date ? zonedParts(date) : null;
  return parts ? dateKeyFromParts(parts) : null;
}

function matchesHolidayDate(value: unknown, dateKey: string): boolean {
  if (typeof value === "string") {
    const recurring = /^(\d{2})\/(\d{2})$/.exec(value.trim());
    if (recurring) {
      const [, day, month] = recurring;
      return dateKey.endsWith(`-${month}-${day}`);
    }
  }
  return parseDateKey(value) === dateKey;
}

function addDays(dateKey: string, amount: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function weekdayName(dateKey: string): (typeof WEEKDAY_NAMES)[number] {
  const [year, month, day] = dateKey.split("-").map(Number);
  return WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function normalizeWeekday(value: unknown): (typeof WEEKDAY_NAMES)[number] | null {
  const text = normalizeText(value).replace(/\s+/g, " ");
  return WEEKDAY_ALIASES[text] || DAY_NUMBER_NAMES[text] || null;
}

function getDayObject(source: unknown, day: (typeof WEEKDAY_NAMES)[number]): RecordValue | null {
  if (!isRecord(source)) return null;
  for (const [key, value] of Object.entries(source)) {
    if (normalizeWeekday(key) === day && isRecord(value)) return value;
  }
  return null;
}

function getDayRule(schedule: AlarmSchedule, day: (typeof WEEKDAY_NAMES)[number]): ResolvedDayRule {
  const scheduleRecord = schedule as RecordValue;
  const containers = [scheduleRecord.weekly, scheduleRecord.weeklySchedule, scheduleRecord.days, scheduleRecord];
  const dayObject = containers.map(container => getDayObject(container, day)).find(Boolean) || null;
  const dayCapitalized = `${day.charAt(0).toUpperCase()}${day.slice(1)}`;
  const directArmKeys = [`${day}Arm`, `${dayCapitalized}Arm`, `${day}_arm`, `${day}arm`];
  const directDisarmKeys = [`${day}Disarm`, `${dayCapitalized}Disarm`, `${day}_disarm`, `${day}disarm`];
  const armAt = dayObject ? firstValue(dayObject, ["armAt", "arm", "armTime"]) : firstValue(scheduleRecord, directArmKeys);
  const disarmAt = dayObject ? firstValue(dayObject, ["disarmAt", "disarm", "disarmTime"]) : firstValue(scheduleRecord, directDisarmKeys);
  return { armAt: armAt as ResolvedDayRule["armAt"], disarmAt: disarmAt as ResolvedDayRule["disarmAt"] };
}

function parseTimeMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 0 && value < 24 * 60 ? Math.floor(value) : null;
  }
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60 ? hour * 60 + minute : null;
}

function hasAny(source: RecordValue, keys: readonly string[]): boolean {
  return keys.some(key => own(source, key));
}

function holidayCandidates(schedule: AlarmSchedule, input: ScheduleEvaluationInput): unknown[] {
  const scheduleRecord = schedule as RecordValue;
  const inputRecord = input as RecordValue;
  return [
    inputRecord.holidays,
    inputRecord.holidayRules,
    inputRecord.holidayDates,
    scheduleRecord.holidays,
    scheduleRecord.holidayRules,
    scheduleRecord.holidayDates,
    scheduleRecord.holiday,
  ].filter(value => value !== undefined && value !== null);
}

function findHolidayRule(dateKey: string, schedule: AlarmSchedule, input: ScheduleEvaluationInput): { found: boolean; rule: ResolvedDayRule } {
  for (const candidate of holidayCandidates(schedule, input)) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (!isRecord(item) || !matchesHolidayDate(item.date, dateKey)) continue;
        const arm = firstValue(item, ["holidayArm", "armAt", "arm", "holiday_arm"]);
        const disarm = firstValue(item, ["holidayDisarm", "disarmAt", "disarm", "holiday_disarm"]);
        return { found: true, rule: { armAt: arm as ResolvedDayRule["armAt"], disarmAt: disarm as ResolvedDayRule["disarmAt"] } };
      }
    } else if (isRecord(candidate)) {
      if (matchesHolidayDate(candidate.date, dateKey)) {
        const arm = firstValue(candidate, ["holidayArm", "armAt", "arm", "holiday_arm"]);
        const disarm = firstValue(candidate, ["holidayDisarm", "disarmAt", "disarm", "holiday_disarm"]);
        return { found: true, rule: { armAt: arm as ResolvedDayRule["armAt"], disarmAt: disarm as ResolvedDayRule["disarmAt"] } };
      }
      const mapped = candidate[dateKey];
      if (isRecord(mapped)) {
        const arm = firstValue(mapped, ["holidayArm", "armAt", "arm", "holiday_arm"]);
        const disarm = firstValue(mapped, ["holidayDisarm", "disarmAt", "disarm", "holiday_disarm"]);
        return { found: true, rule: { armAt: arm as ResolvedDayRule["armAt"], disarmAt: disarm as ResolvedDayRule["disarmAt"] } };
      }
    }
  }
  return { found: false, rule: {} };
}

function exceptionCandidates(schedule: AlarmSchedule, input: ScheduleEvaluationInput): unknown[] {
  const scheduleRecord = schedule as RecordValue;
  const inputRecord = input as RecordValue;
  return [inputRecord.exceptions, inputRecord.dateExceptions, scheduleRecord.exceptions, scheduleRecord.dateExceptions]
    .filter(value => value !== undefined && value !== null);
}

function findException(dateKey: string, schedule: AlarmSchedule, input: ScheduleEvaluationInput): AlarmDateException | null {
  for (const candidate of exceptionCandidates(schedule, input)) {
    if (Array.isArray(candidate)) {
      const found = candidate.find(item => isRecord(item) && parseDateKey(item.date) === dateKey);
      if (found) return found as AlarmDateException;
    } else if (isRecord(candidate)) {
      const mapped = candidate[dateKey];
      if (isRecord(mapped)) return mapped as AlarmDateException;
      if (parseDateKey(candidate.date) === dateKey) return candidate as AlarmDateException;
    }
  }
  return null;
}

function resolveDayRule(dateKey: string, schedule: AlarmSchedule, input: ScheduleEvaluationInput): ResolvedDayRule | null {
  const holiday = findHolidayRule(dateKey, schedule, input);
  let rule = holiday.found ? holiday.rule : getDayRule(schedule, weekdayName(dateKey));
  const exception = findException(dateKey, schedule, input);
  if (exception?.suspended === true) return null;
  const exceptionRecord = exception as RecordValue | null;
  if (exceptionRecord) {
    const override = isRecord(exceptionRecord.override) ? exceptionRecord.override : exceptionRecord;
    const armKeys = ["armAt", "arm", "armTime"];
    const disarmKeys = ["disarmAt", "disarm", "disarmTime"];
    if (hasAny(override, armKeys)) rule = { ...rule, armAt: firstValue(override, armKeys) as ResolvedDayRule["armAt"] };
    if (hasAny(override, disarmKeys)) rule = { ...rule, disarmAt: firstValue(override, disarmKeys) as ResolvedDayRule["disarmAt"] };
  }
  return rule;
}

function buildTransitionsForDate(dateKey: string, schedule: AlarmSchedule, input: ScheduleEvaluationInput): InternalTransition[] {
  const rule = resolveDayRule(dateKey, schedule, input);
  if (!rule) return [];
  const transitions: InternalTransition[] = [];
  const armMinutes = parseTimeMinutes(rule.armAt);
  const disarmMinutes = parseTimeMinutes(rule.disarmAt);
  if (armMinutes !== null) {
    const at = instantFromWallTime(dateKey, Math.floor(armMinutes / 60), armMinutes % 60);
    if (at) transitions.push({ kind: "arm", state: "armed", at });
  }
  if (disarmMinutes !== null) {
    const at = instantFromWallTime(dateKey, Math.floor(disarmMinutes / 60), disarmMinutes % 60);
    if (at) transitions.push({ kind: "disarm", state: "disarmed", at });
  }
  return transitions.sort((left, right) => left.at.getTime() - right.at.getTime());
}

function buildTimeline(dateKey: string, schedule: AlarmSchedule, input: ScheduleEvaluationInput): InternalTransition[] {
  const transitions: InternalTransition[] = [];
  for (let offset = -8; offset <= 8; offset += 1) transitions.push(...buildTransitionsForDate(addDays(dateKey, offset), schedule, input));
  return transitions.sort((left, right) => left.at.getTime() - right.at.getTime());
}

function transitionView(transition: InternalTransition | null, at: Date, toleranceMinutes: number): ScheduleTransition | null {
  if (!transition) return null;
  const difference = transition.at.getTime() - at.getTime();
  return {
    kind: transition.kind,
    state: transition.state,
    at: new Date(transition.at.getTime()),
    isOverdue: difference < 0,
    minutesFromNow: Math.round((difference / 60000) * 100) / 100,
  };
}

function stateFromInput(value: unknown): AlarmExpectedState | null {
  if (value === "armed" || value === "arm") return "armed";
  if (value === "disarmed" || value === "disarm") return "disarmed";
  return null;
}

function eventTimestamp(event: ContactIdOperationalEvent | OperationalEventClassification, fallback: Date): Date {
  if (isRecord(event)) {
    const eventRecord = event as RecordValue;
    for (const key of ["receivedAt", "occurredAt", "timestamp", "at"]) {
      const parsed = parseInstant(eventRecord[key]);
      if (parsed) return parsed;
    }
  }
  return fallback;
}

function nearestTransitionForState(transitions: InternalTransition[], state: "armed" | "disarmed", at: Date, toleranceMs: number): InternalTransition | null {
  const candidates = transitions.filter(transition => transition.state === state);
  let nearest: InternalTransition | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.at.getTime() - at.getTime());
    if (distance <= toleranceMs && distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function attachDecisionAliases(decision: ScheduleDecision, next: ScheduleTransition | null, overdue: ScheduleTransition | null): ScheduleDecision {
  Object.defineProperties(decision, {
    nextApplicableTransition: { value: decision.transition, enumerable: false },
    nextTransition: { value: next, enumerable: false, writable: false },
    overdueTransition: { value: overdue, enumerable: false, writable: false },
  });
  return decision;
}

function normalizeEvaluationArgs(
  inputOrSchedule: ScheduleEvaluationInput | AlarmSchedule,
  at?: Date | string | number,
  options?: Omit<ScheduleEvaluationInput, "schedule" | "at" | "now">,
): ScheduleEvaluationInput {
  const input = inputOrSchedule as RecordValue;
  if (at !== undefined) return { ...(options as RecordValue), schedule: inputOrSchedule as AlarmSchedule, at } as ScheduleEvaluationInput;
  if (own(input, "schedule") || own(input, "at") || own(input, "now") || own(input, "actualState") || own(input, "event")) return inputOrSchedule as ScheduleEvaluationInput;
  return { schedule: inputOrSchedule as AlarmSchedule, at: new Date() };
}

/**
 * Resolve o estado esperado pela agenda local. A função não cria eventos: sem
 * um estado/evento observado ela retorna report_only, mesmo quando há atraso.
 */
export function evaluateAlarmSchedule(
  inputOrSchedule: ScheduleEvaluationInput | AlarmSchedule,
  at?: Date | string | number,
  options?: Omit<ScheduleEvaluationInput, "schedule" | "at" | "now">,
): ScheduleDecision {
  const input = normalizeEvaluationArgs(inputOrSchedule, at, options);
  const schedule = (input.schedule || {
    weekly: input.weekly,
    weeklySchedule: input.weeklySchedule,
    holidays: input.holidays,
    holidayRules: input.holidayRules,
    holidayDates: input.holidayDates,
    exceptions: input.exceptions,
    dateExceptions: input.dateExceptions,
  }) as AlarmSchedule;
  const now = parseInstant(input.at ?? input.now);
  const toleranceMinutes = DEFAULT_TOLERANCE_MINUTES;
  if (!now) return { expectedState: "unknown", transition: null, status: "report_only", toleranceMinutes };
  const parts = zonedParts(now);
  if (!parts) return { expectedState: "unknown", transition: null, status: "report_only", toleranceMinutes };
  const dateKey = dateKeyFromParts(parts);
  const timeline = buildTimeline(dateKey, schedule, input);
  const currentDayRule = resolveDayRule(dateKey, schedule, input);
  const currentDaySuspended = currentDayRule === null;
  const atMillis = now.getTime();
  const past = timeline.filter(transition => transition.at.getTime() <= atMillis);
  const future = timeline.filter(transition => transition.at.getTime() > atMillis);
  const latest = past[past.length - 1] || null;
  const next = future[0] || null;
  const expectedState: AlarmExpectedState = currentDaySuspended ? "unknown" : latest?.state || "unknown";
  const toleranceMs = toleranceMinutes * 60000;

  const event = input.event || input.observedEvent || input.lastEvent || null;
  let observedState = stateFromInput(input.actualState) || stateFromInput(input.observedState) || stateFromInput(input.currentState);
  let status: ScheduleStatus = "report_only";
  let selected: InternalTransition | null = null;

  if (event) {
    const classification = "kind" in event && "state" in event
      ? event as OperationalEventClassification
      : classifyContactIdOperationalEvent(event as ContactIdOperationalEvent);
    if (classification.kind === "arm" || classification.kind === "disarm") {
      observedState = classification.state as AlarmExpectedState;
      const eventAt = eventTimestamp(event, now);
      if (classification.mode === "stay") {
        status = "report_only";
        selected = next || latest;
      } else {
      const eventDateParts = zonedParts(eventAt);
      const eventDateKey = eventDateParts ? dateKeyFromParts(eventDateParts) : dateKey;
      const eventTimeline = buildTimeline(eventDateKey, schedule, input);
      const targetState = classification.state as "armed" | "disarmed";
      selected = nearestTransitionForState(eventTimeline, targetState, eventAt, toleranceMs);
      if (selected) {
        status = "within_schedule";
      } else if (targetState === "disarmed" && expectedState === "armed") {
        status = "unexpected_disarm";
      } else if (targetState === "armed" && expectedState === "armed") {
        const arm = latest?.state === "armed" ? latest : null;
        status = arm && atMillis - arm.at.getTime() > toleranceMs ? "missed_arm" : "report_only";
      } else {
        status = "report_only";
      }
      }
    }
  }

  if (!event && observedState && !currentDaySuspended) {
    if ((expectedState as AlarmExpectedState) === "unknown") {
      status = "report_only";
    } else if (observedState === expectedState) {
      status = "within_schedule";
    } else if (observedState === "disarmed" && expectedState === "armed") {
      const arm = latest?.state === "armed" ? latest : null;
      if (arm && atMillis - arm.at.getTime() > toleranceMs) {
        status = "missed_arm";
        selected = arm;
      } else {
        status = "within_schedule";
      }
    } else {
      status = "report_only";
    }
  }

  if (currentDaySuspended) {
    selected = null;
    status = "report_only";
  } else if (!selected) {
    if (status === "missed_arm" && latest?.state === "armed") selected = latest;
    else if (status === "unexpected_disarm" && latest) selected = latest;
    else if (latest && atMillis - latest.at.getTime() <= toleranceMs) selected = latest;
    else selected = next || latest;
  }

  const transition = transitionView(selected, now, toleranceMinutes);
  const nextView = transitionView(next, now, toleranceMinutes);
  const overdueView = selected && selected.at.getTime() <= atMillis ? transitionView(selected, now, toleranceMinutes) : null;
  return attachDecisionAliases(
    { expectedState, transition, status, toleranceMinutes },
    nextView,
    overdueView,
  );
}

export const decideAlarmSchedule = evaluateAlarmSchedule;
export const decideExpectedAlarmState = evaluateAlarmSchedule;
export const getExpectedAlarmState = evaluateAlarmSchedule;

export { DEFAULT_TOLERANCE_MINUTES, TIME_ZONE };
