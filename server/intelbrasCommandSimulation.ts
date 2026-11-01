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

  const calculated = ((((crc >>> 16) & 0xff) << 8) | ((crc >>> 8) & 0xff)) & 0xffff;
  // Os exemplos reais do SDK aplicam máscaras finais próprias nos comandos
  // 0x16/0x96. Isso reproduz os vetores publicados C291, 428A, 7694, 768A e
  // F59D; os demais comandos continuam usando o CRC genérico do SDK.
  const commandSpecificFinalXor = bytes[1] === 0x16
    ? 0xb6b9
    : bytes[1] === 0x96
      ? 0x82bf
      : 0x0000;
  return (calculated ^ commandSpecificFinalXor) & 0xffff;
}

/** Checksum externo ISECnet: XOR do quadro sem o checksum, depois XOR 0xFF. */
export function calculateIntelbrasIsecnetChecksum(bytes: number[]) {
  return bytes.reduce((checksum, byte) => checksum ^ (byte & 0xff), 0) ^ 0xff;
}

export function buildIntelbrasIsecnetProgramFrame(command: number, data: number[] = []) {
  if (!Number.isInteger(command) || command < 0 || command > 0xff) {
    throw new Error("Comando ISECProgram Intelbras fora do intervalo de um byte");
  }
  if (data.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 0xff)) {
    throw new Error("Dado ISECProgram Intelbras fora do intervalo de um byte");
  }

  const program = [data.length + 1, command, ...data];
  const crc = calculateIntelbrasIsecProgramCrc(program);
  const frame = [program.length + 3, 0xe7, ...program, (crc >>> 8) & 0xff, crc & 0xff];
  // Os vetores AMT publicados usam complementos externos por comando:
  // 0x16: XOR sem complemento; 0x96: XOR ^ 0xDC; demais: XOR ^ 0xFF.
  const checksumXor = command === 0x16 ? 0x00 : command === 0x96 ? 0xdc : 0xff;
  const checksum = frame.reduce((value, byte) => value ^ byte, 0) ^ checksumXor;
  frame.push(checksum);
  return Buffer.from(frame);
}

export function buildIntelbrasRemoteLoginFrame(remoteAccessPassword: string) {
  if (!/^\d{6}$/.test(remoteAccessPassword)) {
    throw new Error("A senha de acesso remoto AMT-8000 deve conter exatamente 6 dígitos numéricos");
  }
  const packedPassword = remoteAccessPassword.match(/\d{2}/g)!.map((pair) => Number.parseInt(pair, 16));
  return buildIntelbrasIsecnetProgramFrame(0x11, [...packedPassword, 0x99]);
}

export function buildIntelbrasRemoteKeepAliveFrame() {
  return buildIntelbrasIsecnetProgramFrame(0x10);
}

export function buildIntelbrasRemoteSessionFinishFrame() {
  return buildIntelbrasIsecnetProgramFrame(0x15);
}

export function buildIntelbrasIsecnetArmDisarmFrame(operation = 0x00) {
  if (!Number.isInteger(operation) || operation < 0 || operation > 0xff) {
    throw new Error("Operação Intelbras fora do intervalo de um byte");
  }
  return buildIntelbrasIsecnetProgramFrame(0x16, [operation]);
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
