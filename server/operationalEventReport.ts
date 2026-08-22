export type OperationalEvent = {
  eventCode: string;
  qualifier: string;
  brand?: string | null;
  [key: string]: unknown;
};

export type ContactIdCategory = {
  code: string;
  qualifier?: string | null;
  fabricante?: string | null;
  isUniversal?: boolean | number | null;
  category?: string | null;
};

export type EventReportGroup = "all" | "alarm" | "arm" | "disarm" | "test" | "system";

function normalize(value?: string | null) {
  return (value || "").trim().toUpperCase();
}

export function resolveOperationalEventCategory(event: OperationalEvent, codes: ContactIdCategory[]) {
  const eventBrand = normalize(event.brand);
  const exact = codes.find((code) =>
    code.code === event.eventCode
    && (code.qualifier === event.qualifier || code.qualifier === "both")
    && normalize(code.fabricante) === eventBrand,
  );
  const universal = codes.find((code) =>
    code.code === event.eventCode
    && (code.qualifier === event.qualifier || code.qualifier === "both")
    && Boolean(code.isUniversal),
  );
  const category = exact?.category || universal?.category;
  if (category) return category;
  if (event.eventCode === "602") return "test";
  if (["401", "403", "407", "408", "409", "3441", "3464"].includes(event.eventCode)) return "arm_disarm";
  return "alarm";
}

export function matchesOperationalEventGroup(event: OperationalEvent, category: string, group?: EventReportGroup) {
  if (!group || group === "all") return true;
  if (group === "arm") return category === "arm_disarm" && event.qualifier === "R";
  if (group === "disarm") return category === "arm_disarm" && event.qualifier === "E";
  if (group === "alarm") return category === "alarm" || category === "analytics";
  if (group === "test") return category === "test";
  return category === "fault" || category === "system" || category === "access";
}
