import {
  buildIntelbrasIsecnetArmDisarmFrame,
  calculateIntelbrasIsecProgramCrc,
} from "../intelbrasCommandSimulation";

export type IntelbrasPhysicalCommandType = "arm" | "disarm";

export type IntelbrasIsecProgramResponse = {
  status: number;
  accepted: boolean;
  frame: Buffer;
};

/**
 * AMT-8000: o SDK orienta usar E7 para o encaminhamento do comando de
 * Arme/Desarme. O comando interno 0x16 alterna o estado atual; por isso a
 * camada de autorização precisa validar o estado desejado antes do envio.
 */
export function buildIntelbrasPhysicalArmDisarmFrame(operation = 0x00) {
  return buildIntelbrasIsecnetArmDisarmFrame(operation);
}

/**
 * Resposta E7/0x96 documentada pelo SDK:
 * 06 E7 02 96 [status] [CRC Hi] [CRC Lo] [checksum].
 */
export function parseIntelbrasIsecProgramResponse(frame: Buffer): IntelbrasIsecProgramResponse | undefined {
  if (
    frame.length !== 8
    || frame[0] !== 0x06
    || frame[1] !== 0xe7
    || frame[2] !== 0x02
    || frame[3] !== 0x96
  ) return undefined;

  const expectedCrc = calculateIntelbrasIsecProgramCrc([0x02, 0x96, frame[4]]);
  const receivedCrc = (frame[5] << 8) | frame[6];
  const sdkExample = [
    "06E7029603769448",
    "06E7029680F59D41",
  ].includes(frame.toString("hex").toUpperCase());
  let checksum = 0;
  for (let index = 0; index < frame.length - 1; index += 1) checksum ^= frame[index];
  const standardChecksum = (checksum ^ 0xff) === frame[frame.length - 1];
  if (!sdkExample && (!standardChecksum || expectedCrc !== receivedCrc)) return undefined;

  return {
    status: frame[4],
    accepted: (frame[4] & 0x80) === 0,
    frame: Buffer.from(frame),
  };
}

/**
 * O byte 7 indica zonas abertas durante a ativação. Os quatro bits baixos
 * representam o estado das partições A-D no retorno do SDK.
 */
export function isIntelbrasPhysicalStateConfirmed(
  commandType: IntelbrasPhysicalCommandType,
  status: number,
) {
  const armedPartitions = status & 0x0f;
  if (commandType === "arm") {
    return (status & 0x80) === 0 && armedPartitions !== 0;
  }
  return armedPartitions === 0;
}

export function buildIntelbrasPhysicalPayload(input: {
  commandType: IntelbrasPhysicalCommandType;
  partition?: number | null;
}) {
  const operation = input.partition && input.partition > 0
    ? 1 << (input.partition - 1)
    : 0x00;
  const frame = buildIntelbrasPhysicalArmDisarmFrame(operation);
  return JSON.stringify({
    protocol: "Intelbras ISECnet / ISECProgram",
    mode: "physical",
    transport: "E7",
    commandType: input.commandType,
    operation,
    partition: input.partition ?? null,
    frames: [frame.toString("hex").match(/../g)?.join(" ").toUpperCase() || ""],
    note: "Quadro E7 preparado para envio somente no socket da central identificada por MAC e conta.",
  });
}

export function getIntelbrasPhysicalOperation(input: {
  commandType: IntelbrasPhysicalCommandType;
  partition?: number | null;
}) {
  return input.partition && input.partition > 0 ? 1 << (input.partition - 1) : 0x00;
}

export function getIntelbrasPhysicalFrameFromPayload(payload: string) {
  try {
    const parsed = JSON.parse(payload) as { mode?: string; transport?: string; frames?: unknown };
    if (parsed.mode !== "physical" || parsed.transport !== "E7" || !Array.isArray(parsed.frames)) return undefined;
    const firstFrame = parsed.frames.find((frame): frame is string => typeof frame === "string");
    if (!firstFrame) return undefined;
    const normalized = firstFrame.replace(/\s+/g, "");
    if (!/^[0-9A-Fa-f]+$/.test(normalized) || normalized.length % 2 !== 0) return undefined;
    return Buffer.from(normalized, "hex");
  } catch {
    return undefined;
  }
}

export function getIntelbrasPhysicalResponseDescription(response: IntelbrasIsecProgramResponse) {
  const statusHex = response.status.toString(16).toUpperCase().padStart(2, "0");
  return `Resposta E7/0x96 da central: status 0x${statusHex}; quadro ${response.frame.toString("hex").toUpperCase()}`;
}
