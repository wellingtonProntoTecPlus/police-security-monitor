export const ALARM_SYSTEM_BRANDS = ["JFL", "INTELBRAS", "VETTI", "COMPATEC", "RADIOENGE", "VIAWEB"] as const;

export type AlarmSystemBrand = typeof ALARM_SYSTEM_BRANDS[number];

export type AlarmSystemProfile = {
  receiverPorts: number[];
  primaryReceiverPort: number;
  expectedKeepAliveSeconds: number;
  offlineAfterMinutes: number;
  identificationLabel: string;
};

export const ALARM_SYSTEM_PROFILES: Record<AlarmSystemBrand, AlarmSystemProfile> = {
  JFL: {
    receiverPorts: [9061, 9191, 9131],
    primaryReceiverPort: 9061,
    expectedKeepAliveSeconds: 60,
    offlineAfterMinutes: 5,
    identificationLabel: "JFL v7 ou superior: serial de 10 dígitos. Nas demais versões, informe MAC ou IMEI quando disponível.",
  },
  INTELBRAS: {
    receiverPorts: [9071, 9271],
    primaryReceiverPort: 9071,
    expectedKeepAliveSeconds: 60,
    offlineAfterMinutes: 5,
    identificationLabel: "Informe MAC Ethernet ou IMEI GPRS (últimos 6 caracteres).",
  },
  VETTI: {
    receiverPorts: [9161],
    primaryReceiverPort: 9161,
    expectedKeepAliveSeconds: 60,
    offlineAfterMinutes: 5,
    identificationLabel: "Informe o MAC Ethernet (últimos 6 caracteres).",
  },
  COMPATEC: {
    receiverPorts: [9112],
    primaryReceiverPort: 9112,
    expectedKeepAliveSeconds: 60,
    offlineAfterMinutes: 5,
    identificationLabel: "Informe o MAC Ethernet (últimos 6 caracteres).",
  },
  RADIOENGE: {
    receiverPorts: [9035, 9040],
    primaryReceiverPort: 9035,
    expectedKeepAliveSeconds: 60,
    offlineAfterMinutes: 5,
    identificationLabel: "Informe o MAC Ethernet (últimos 6 caracteres).",
  },
  VIAWEB: {
    receiverPorts: [9111],
    primaryReceiverPort: 9111,
    expectedKeepAliveSeconds: 60,
    offlineAfterMinutes: 5,
    identificationLabel: "O ID ISEP de 4 caracteres será gerado automaticamente ao salvar.",
  },
};

export function getAlarmSystemProfile(brand: string): AlarmSystemProfile | undefined {
  return ALARM_SYSTEM_PROFILES[brand as AlarmSystemBrand];
}

export function isJflVersion7OrLater(brand: string | null | undefined, firmwareVersion: string | null | undefined) {
  const majorVersion = Number((firmwareVersion || "").trim().replace(/^v/i, "").split(".")[0]);
  return brand === "JFL" && Number.isInteger(majorVersion) && majorVersion >= 7;
}

export function getAlarmSystemIdentifierValidationError(input: {
  brand?: string | null;
  firmwareVersion?: string | null;
  macAddress?: string | null;
  imeiGprs?: string | null;
  serialNumber?: string | null;
}) {
  const brand = input.brand || "";
  const mac = (input.macAddress || "").replace(/[^A-Z0-9]/gi, "");
  const imei = (input.imeiGprs || "").replace(/[^A-Z0-9]/gi, "");
  const serial = (input.serialNumber || "").replace(/\D/g, "");

  if (brand === "VIAWEB") return null;
  if (isJflVersion7OrLater(brand, input.firmwareVersion) && !/^\d{10}$/.test(serial)) {
    return "A central JFL versão 7 ou superior exige o número de série com 10 dígitos";
  }
  if (["VETTI", "COMPATEC", "RADIOENGE"].includes(brand) && mac.length !== 6) {
    return `A central ${brand} exige o MAC Ethernet com os 6 últimos caracteres`;
  }
  if (brand === "INTELBRAS" && mac.length !== 6 && imei.length !== 6) {
    return "A central INTELBRAS exige MAC Ethernet ou IMEI GPRS com os 6 últimos caracteres";
  }
  if (brand === "JFL" && !serial && mac.length !== 6 && imei.length !== 6) {
    return "Informe o serial, MAC ou IMEI da central JFL para identificá-la com segurança";
  }
  return null;
}

export function applyAlarmSystemBrandProfile<T extends Record<string, unknown>>(current: T, brand: AlarmSystemBrand): T & Record<string, unknown> {
  const profile = ALARM_SYSTEM_PROFILES[brand];
  return {
    ...current,
    brand,
    model: "",
    firmwareVersion: "",
    serialNumber: "",
    macAddress: "",
    imeiGprs: "",
    viawebCode: "",
    receiverPort: profile.primaryReceiverPort,
    keepAliveMonitoringEnabled: true,
    keepAliveExpectedIntervalSeconds: profile.expectedKeepAliveSeconds,
    keepAliveFailureEventEnabled: false,
    keepAliveOfflineAfterMinutes: profile.offlineAfterMinutes,
    keepAliveDisconnectAlertEnabled: true,
    keepAliveRepeatAlertEnabled: false,
    keepAliveRepeatAlertEveryMinutes: 60,
  };
}
