import {
  buildIntelbrasIsecnetArmDisarmFrame,
  buildIntelbrasRemoteLoginFrame,
  buildIntelbrasRemoteSessionFinishFrame,
  calculateIntelbrasIsecProgramCrc,
} from "../intelbrasCommandSimulation";

export type IntelbrasPhysicalCommandType = "arm" | "disarm";

export type IntelbrasIsecProgramResponse = {
  command: number;
  data: Buffer;
  frame: Buffer;
};

/** AMT-8000: login remoto ISECProgram 0x11, com senha de acesso remoto. */
export function buildIntelbrasPhysicalLoginFrame(remoteAccessPassword: string) {
  return buildIntelbrasRemoteLoginFrame(remoteAccessPassword);
}

/** ISECProgram 0x16 alterna o estado; o servidor valida antes da transmissão. */
export function buildIntelbrasPhysicalArmDisarmFrame(operation = 0x00) {
  return buildIntelbrasIsecnetArmDisarmFrame(operation);
}

/** Finaliza o acesso remoto e libera o teclado da central com o comando E7/0x15. */
export function buildIntelbrasPhysicalSessionFinishFrame() {
  return buildIntelbrasRemoteSessionFinishFrame();
}

function hasValidIsecnetChecksum(frame: Buffer, command: number) {
  let checksum = 0;
  for (let index = 0; index < frame.length - 1; index += 1) checksum ^= frame[index]!;
  const finalXor = command === 0x16 ? 0x00 : command === 0x96 ? 0xdc : 0xff;
  return (checksum ^ finalXor) === frame[frame.length - 1];
}

/**
 * Decodifica respostas ISECProgram encapsuladas em E7. O tamanho, CRC interno
 * e checksum externo são validados conforme o XOR final dos vetores reais
 * publicados pela Intelbras para o comando de resposta.
 */
export function parseIntelbrasIsecProgramResponse(frame: Buffer): IntelbrasIsecProgramResponse | undefined {
  if (
    frame.length < 7
    || frame[1] !== 0xe7
    || frame.length !== frame[0]! + 2
  ) return undefined;

  const programEnd = frame.length - 3;
  const program = Array.from(frame.subarray(2, programEnd));
  if (program.length < 2 || program[0] !== program.length - 1) return undefined;
  if (!hasValidIsecnetChecksum(frame, program[1]!)) return undefined;

  const receivedCrc = (frame[programEnd]! << 8) | frame[programEnd + 1]!;
  if (calculateIntelbrasIsecProgramCrc(program) !== receivedCrc) return undefined;

  return {
    command: program[1]!,
    data: Buffer.from(program.slice(2)),
    frame: Buffer.from(frame),
  };
}

/** O status 0x96: bit 7 = zonas abertas; bits 0-3 = partições A-D armadas. */
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
  // 0x16 é alternância: o payload registra a ação contextual solicitada pelo
  // operador, mas o quadro transmitido utiliza a operação oficial do modelo.
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
    note: "Quadro E7 preparado para envio somente após login remoto e na sessão da central identificada por MAC e conta.",
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
  const dataHex = response.data.toString("hex").toUpperCase();
  const frameHex = response.frame.toString("hex").toUpperCase();
  return `Resposta E7/0x${response.command.toString(16).toUpperCase().padStart(2, "0")}${dataHex ? ` (dados ${dataHex})` : ""}; quadro ${frameHex}`;
}
