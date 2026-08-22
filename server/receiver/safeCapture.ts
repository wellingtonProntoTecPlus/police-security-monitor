export type SafeCaptureFrame = {
  brand: string;
  receiverPort: number;
  remoteIp: string;
  capturedAt: string;
  totalBytes: number;
  payloadHex: string;
  truncated: boolean;
};

export type CapturedPanelCandidate = {
  systemId: number;
  identifierType: "mac_hex" | "mac_decimal" | "mac_ascii" | "imei_ascii" | "serial_ascii";
  identifier: string;
};

const MAX_CAPTURED_FRAMES_PER_CONNECTION = 12;
const MAX_CAPTURED_BYTES_PER_FRAME = 128;

const framesBySocket = new WeakMap<object, SafeCaptureFrame[]>();

export function isSafeCaptureEnabled(brand: string) {
  return process.env.RECEIVER_SAFE_CAPTURE_MODE !== "false"
    && ["JFL", "INTELBRAS", "VIAWEB", "VETTI", "COMPATEC", "RADIOENGE"].includes(brand);
}

/**
 * Toda central IP exige um identificador único de painel para associação
 * operacional. A conta Contact ID nunca pode escolher sozinha um cliente,
 * pois pode se repetir entre parceiras.
 */
export function shouldResolveSystemByCapturedPanelIdentifier(brand: string) {
  return ["JFL", "INTELBRAS", "VETTI", "COMPATEC", "RADIOENGE", "VIAWEB"].includes(brand);
}

export function recordSafeCaptureFrame(socket: object, input: Omit<SafeCaptureFrame, "capturedAt" | "totalBytes" | "payloadHex" | "truncated"> & { payload: Buffer }) {
  const frames = framesBySocket.get(socket) || [];
  if (frames.length >= MAX_CAPTURED_FRAMES_PER_CONNECTION) return undefined;

  const capturedBytes = input.payload.subarray(0, MAX_CAPTURED_BYTES_PER_FRAME);
  const frame: SafeCaptureFrame = {
    brand: input.brand,
    receiverPort: input.receiverPort,
    remoteIp: input.remoteIp.replace("::ffff:", ""),
    capturedAt: new Date().toISOString(),
    totalBytes: input.payload.length,
    payloadHex: capturedBytes.toString("hex").toUpperCase(),
    truncated: input.payload.length > MAX_CAPTURED_BYTES_PER_FRAME,
  };

  frames.push(frame);
  framesBySocket.set(socket, frames);
  return frame;
}

export function formatSafeCaptureLog(frame: SafeCaptureFrame) {
  const truncation = frame.truncated ? " (cortado em 128 bytes)" : "";
  return `[CAPTURA-IP] ${frame.brand} | porta ${frame.receiverPort} | origem ${frame.remoteIp} | ${frame.totalBytes} bytes${truncation} | HEX ${frame.payloadHex}`;
}

export function getSafeCaptureSummary(socket: object) {
  const frames = framesBySocket.get(socket) || [];
  if (frames.length === 0) return "";

  return frames.map((frame, index) => {
    const truncation = frame.truncated ? " (cortado em 128 bytes)" : "";
    return `[Captura segura ${index + 1} | ${frame.capturedAt} | ${frame.brand}:${frame.receiverPort} | ${frame.totalBytes} bytes${truncation}] HEX ${frame.payloadHex}`;
  }).join("\n");
}

export function getSafeCaptureFrames(socket: object) {
  return framesBySocket.get(socket) || [];
}

function normalizeIdentifier(value: string | null | undefined) {
  return (value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function parseJflConnectionIdentity(payload: Buffer) {
  if (payload.length < 16 || payload[0] !== 0x7b || payload[3] !== 0x21) return undefined;
  const packetText = payload.toString("latin1");
  // Nos quadros JFL Active v7+, os identificadores ficam após o cabeçalho
  // 7B/len/seq/21. A leitura fixa impede que uma parte do IMEI seja confundida
  // com o serial de 10 dígitos da central.
  const serialAtFixedOffset = packetText.slice(4, 14);
  const imeiAtFixedOffset = packetText.slice(14, 29);
  const macAtFixedOffset = packetText.slice(29, 41);
  const serialNumber = /^\d{10}$/.test(serialAtFixedOffset)
    ? serialAtFixedOffset
    : packetText.match(/(?<!\d)(\d{10})(?!\d)/)?.[1];
  const imeiNumber = /^\d{15}$/.test(imeiAtFixedOffset) ? imeiAtFixedOffset : undefined;
  const fullMac = /^[A-F0-9]{12}$/.test(macAtFixedOffset)
    ? macAtFixedOffset
    : packetText.match(/[A-F0-9]{12}/)?.[0];
  if (!serialNumber && !imeiNumber && !fullMac) return undefined;

  return {
    serialNumber,
    imeiNumber,
    imeiSuffix: imeiNumber?.slice(-6),
    fullMac,
    macSuffix: fullMac?.slice(-6),
  };
}

/**
 * Identifica somente formatos que foram confirmados com uma captura real.
 */
export function findCapturedPanelCandidates(
  brand: string,
  frames: SafeCaptureFrame[],
  systems: Array<{ id: number; macAddress?: string | null; imeiGprs?: string | null; serialNumber?: string | null }>,
): CapturedPanelCandidate[] {
  const normalizedBrand = brand.trim().toUpperCase();
  const packetHex = frames.map((frame) => frame.payloadHex).join("");
  const packetText = frames.map((frame) => Buffer.from(frame.payloadHex, "hex").toString("latin1")).join("");
  const candidates: CapturedPanelCandidate[] = [];
  const jflIdentities = normalizedBrand === "JFL"
    ? frames.map((frame) => parseJflConnectionIdentity(Buffer.from(frame.payloadHex, "hex"))).filter(Boolean)
    : [];

  for (const system of systems) {
    const macAddress = normalizeIdentifier(system.macAddress);
    const imeiGprs = normalizeIdentifier(system.imeiGprs);
    const identifier = macAddress || imeiGprs;
    const serialNumber = normalizeIdentifier(system.serialNumber);

    if (normalizedBrand === "JFL") {
      for (const connectionIdentity of jflIdentities) {
        if (serialNumber.length === 10 && connectionIdentity!.serialNumber === serialNumber) {
          candidates.push({ systemId: system.id, identifierType: "serial_ascii", identifier: serialNumber });
        }
        if (macAddress.length === 6 && connectionIdentity!.macSuffix === macAddress) {
          candidates.push({ systemId: system.id, identifierType: "mac_ascii", identifier: macAddress });
        }
        if (imeiGprs.length === 6 && connectionIdentity!.imeiSuffix === imeiGprs) {
          candidates.push({ systemId: system.id, identifierType: "imei_ascii", identifier: imeiGprs });
        }
      }
      continue;
    }

    if (identifier.length !== 6) continue;

    if (normalizedBrand === "VETTI" && packetHex.includes(identifier)) {
      candidates.push({ systemId: system.id, identifierType: "mac_hex", identifier });
      continue;
    }

    if (normalizedBrand === "COMPATEC" && packetText.includes(`*${identifier}`)) {
      candidates.push({ systemId: system.id, identifierType: "mac_ascii", identifier });
      continue;
    }

    if (normalizedBrand === "RADIOENGE") {
      const decimalIdentifier = Number.parseInt(identifier, 16).toString(10);
      if (packetText.includes(decimalIdentifier)) {
        candidates.push({ systemId: system.id, identifierType: "mac_decimal", identifier: decimalIdentifier });
      }
    }
  }

  return candidates;
}

export function resolveUniqueCapturedPanelCandidate(candidates: CapturedPanelCandidate[]) {
  const identifierPriority: CapturedPanelCandidate["identifierType"][] = [
    "serial_ascii",
    "mac_ascii",
    "imei_ascii",
    "mac_hex",
    "mac_decimal",
  ];

  for (const identifierType of identifierPriority) {
    const candidatesForType = candidates.filter((candidate) => candidate.identifierType === identifierType);
    const systemIds = Array.from(new Set(candidatesForType.map((candidate) => candidate.systemId)));
    if (systemIds.length === 1) return candidatesForType[0];
    // Um identificador do mesmo tipo que aponta para mais de um cadastro é ambíguo
    // e jamais pode ser substituído por uma conta Contact ID ou outro cadastro.
    if (systemIds.length > 1) return undefined;
  }

  return undefined;
}
