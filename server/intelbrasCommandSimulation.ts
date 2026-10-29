import type { RemoteCommandType } from "./remoteCommandContract";

/**
 * CRC interno ISECProgram documentado no SDK Intelbras AMT.
 * O algoritmo inclui dois bytes zero ao final e transmite CRC Hi/Lo.
 */
export function calculateIntelbrasIsecProgramCrc(bytes: number[]) {
  const input = [...bytes, 0, 0];
  let crc = 0;
  let crcByteCount = 0;

  for (const byte of input) {
    const leftShift = 8 * (2 - crcByteCount);
    crc = crc & (((0xff << leftShift) ^ 0xffffffff) >>> 0);
    crc = (crc | ((byte & 0xff) << leftShift)) >>> 0;

    if (crcByteCount < 2) {
      crcByteCount += 1;
      continue;
    }

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc << 1) >>> 0;
      if ((crc & 0x1000000) === 0x1000000) {
        crc = (crc ^ 0x00800500) >>> 0;
      }
    }
  }

  return ((((crc >>> 16) & 0xff) << 8) | ((crc >>> 8) & 0xff)) & 0xffff;
}

/** Checksum externo ISECnet: XOR do quadro sem o checksum, depois XOR 0xFF. */
export function calculateIntelbrasIsecnetChecksum(bytes: number[]) {
  return bytes.reduce((checksum, byte) => checksum ^ (byte & 0xff), 0) ^ 0xff;
}

export function buildIntelbrasIsecnetArmDisarmFrame(operation = 0x00) {
  if (!Number.isInteger(operation) || operation < 0 || operation > 0xff) {
    throw new Error("Operação Intelbras fora do intervalo de um byte");
  }

  // Conteúdo ISECProgram: 02 16 operação CRC_Hi CRC_Lo.
  const program = [0x02, 0x16, operation];
  const crc = calculateIntelbrasIsecProgramCrc(program);
  const encapsulated = [...program, (crc >>> 8) & 0xff, crc & 0xff];

  // E7 encaminha o conteúdo para a central previamente associada.
  const frame = [encapsulated.length + 1, 0xe7, ...encapsulated];
  frame.push(calculateIntelbrasIsecnetChecksum(frame));
  return Buffer.from(frame);
}

export function validateIntelbrasSimulationTarget(input: Pick<{ commandType: RemoteCommandType }, "commandType">) {
  if (input.commandType !== "arm" && input.commandType !== "disarm") {
    return "Nesta etapa, a AMT-8000 aceita apenas a simulação de Arme/Desarme pelo comando 0x16";
  }
  return undefined;
}

export function buildIntelbrasSimulationPayload(input: {
  commandType: RemoteCommandType;
  partition?: number | null;
}) {
  if (input.commandType !== "arm" && input.commandType !== "disarm") {
    throw new Error("O simulador Intelbras aceita somente Arme ou Desarme");
  }
  const operation = input.partition && input.partition > 0 ? 1 << (input.partition - 1) : 0x00;
  const frame = buildIntelbrasIsecnetArmDisarmFrame(operation);
  return JSON.stringify({
    protocol: "Intelbras ISECnet / ISECProgram",
    mode: "simulation",
    commandType: input.commandType,
    operation,
    partition: input.partition ?? null,
    frames: [frame.toString("hex").match(/../g)?.join(" ").toUpperCase() || ""],
    note: "Simulação registrada conforme o SDK Intelbras; nenhum quadro foi transmitido à central.",
  });
}
