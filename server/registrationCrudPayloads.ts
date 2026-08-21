import { normalizeRegistrationPayload } from "./registrationText";

export function normalizeTechnicalIdentifier(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function prepareAlarmSystemCreatePayload<T extends Record<string, unknown>>(data: T) {
  const formatted = normalizeRegistrationPayload("alarmSystem", data);
  return {
    ...formatted,
    account: typeof formatted.account === "string" ? normalizeTechnicalIdentifier(formatted.account) : formatted.account,
    macAddress: typeof formatted.macAddress === "string" ? normalizeTechnicalIdentifier(formatted.macAddress) : formatted.macAddress,
    imeiGprs: typeof formatted.imeiGprs === "string" ? normalizeTechnicalIdentifier(formatted.imeiGprs) : formatted.imeiGprs,
    serialNumber: typeof formatted.serialNumber === "string" ? normalizeTechnicalIdentifier(formatted.serialNumber) : formatted.serialNumber,
    isepId: typeof formatted.isepId === "string" ? normalizeTechnicalIdentifier(formatted.isepId) : formatted.isepId,
  };
}

export function prepareSystemUserCreatePayload<T extends Record<string, unknown>>(data: T) {
  return normalizeRegistrationPayload("systemUser", data);
}

export function prepareFinalizationPayload<T extends Record<string, unknown>>(data: T) {
  return normalizeRegistrationPayload("finalization", data);
}

export function prepareClientProcedurePayload<T extends Record<string, unknown>>(data: T) {
  return normalizeRegistrationPayload("procedure", data);
}
