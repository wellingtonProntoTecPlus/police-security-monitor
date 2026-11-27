export type CompatecConnectionIdentityType = "mac_ascii" | "imei_ascii";

export type CompatecConnectionIdentity = {
  identifierType: CompatecConnectionIdentityType;
  identifier: string;
  receiverPort: number;
};

export type CompatecIdentitySource = {
  account?: string | null;
  macAddress?: string | null;
  imeiGprs?: string | null;
  receiverPort?: number | null;
};

function normalizeHexIdentifier(value: string | null | undefined) {
  return (value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The Compatec identity frame is `*` plus six ASCII hexadecimal characters and a registered receiver port. */
export function getCompatecConnectionIdentity(source: CompatecIdentitySource): CompatecConnectionIdentity | undefined {
  const receiverPort = source.receiverPort;
  if (!Number.isInteger(receiverPort) || (receiverPort || 0) < 1 || (receiverPort || 0) > 65535) return undefined;

  const macAddress = normalizeHexIdentifier(source.macAddress);
  if (/^[A-F0-9]{6}$/.test(macAddress)) {
    return { identifierType: "mac_ascii", identifier: macAddress, receiverPort: receiverPort! };
  }

  const imeiGprs = normalizeHexIdentifier(source.imeiGprs);
  if (/^[A-F0-9]{6}$/.test(imeiGprs)) {
    return { identifierType: "imei_ascii", identifier: imeiGprs, receiverPort: receiverPort! };
  }

  return undefined;
}

export function compatecConnectionIdentityMatches(
  expected: CompatecIdentitySource,
  captured: CompatecConnectionIdentity,
) {
  const receiverPort = expected.receiverPort;
  const expectedIdentifier = captured.identifierType === "mac_ascii"
    ? normalizeHexIdentifier(expected.macAddress)
    : normalizeHexIdentifier(expected.imeiGprs);
  return Number.isInteger(receiverPort)
    && receiverPort === captured.receiverPort
    && /^[A-F0-9]{6}$/.test(expectedIdentifier)
    && expectedIdentifier === captured.identifier;
}
