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
  identifierType: "mac_hex" | "mac_decimal" | "mac_ascii";
  identifier: string;
};

const MAX_CAPTURED_FRAMES_PER_CONNECTION = 12;
const MAX_CAPTURED_BYTES_PER_FRAME = 128;

const framesBySocket = new WeakMap<object, SafeCaptureFrame[]>();

export function isSafeCaptureEnabled(brand: string) {
  return process.env.RECEIVER_SAFE_CAPTURE_MODE !== "false"
    && ["COMPATEC", "VETTI", "RADIOENGE"].includes(brand);
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

/**
 * Identifica somente formatos que foram confirmados com uma captura real.
 */
export function findCapturedPanelCandidates(
  brand: string,
  frames: SafeCaptureFrame[],
  systems: Array<{ id: number; macAddress?: string | null; imeiGprs?: string | null }>,
): CapturedPanelCandidate[] {
  const normalizedBrand = brand.trim().toUpperCase();
  const packetHex = frames.map((frame) => frame.payloadHex).join("");
  const packetText = frames.map((frame) => Buffer.from(frame.payloadHex, "hex").toString("latin1")).join("");
  const candidates: CapturedPanelCandidate[] = [];

  for (const system of systems) {
    const identifier = normalizeIdentifier(system.macAddress || system.imeiGprs);
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
  const uniqueSystemIds = Array.from(new Set(candidates.map((candidate) => candidate.systemId)));
  if (uniqueSystemIds.length !== 1) return undefined;
  return candidates.find((candidate) => candidate.systemId === uniqueSystemIds[0]);
}
