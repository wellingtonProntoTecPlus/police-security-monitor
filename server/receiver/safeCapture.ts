export type SafeCaptureFrame = {
  brand: string;
  receiverPort: number;
  remoteIp: string;
  capturedAt: string;
  totalBytes: number;
  payloadHex: string;
  truncated: boolean;
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
