import type { RemoteCommandType } from "./remoteCommandContract";

const VETTI_FRAME = 0xAF;
const VETTI_NULL = 0xFF;
const VETTI_ALL_PARTITIONS_MASK = 0x3F;

type VettiSimulationInput = {
  commandType: RemoteCommandType;
  zoneNumber?: number | null;
  pgmNumber?: number | null;
};

/** CRC-8 VSec: do campo NB até o byte anterior ao CRC. */
export function calculateVettiCrc(bytes: number[]) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xFF : (crc << 1) & 0xFF;
    }
  }
  return crc;
}

export function buildVettiFrame(command: number, parameters: number[]) {
  const nb = 4 + parameters.length;
  const body = [nb, VETTI_FRAME, command, ...parameters];
  const crc = calculateVettiCrc(body);
  return [0x02, ...body, crc].map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

function buildVettiCredentialTemplate(command: number, partitions = VETTI_ALL_PARTITIONS_MASK) {
  return `02 <NB> AF ${command.toString(16).toUpperCase().padStart(2, "0")} ${partitions.toString(16).toUpperCase().padStart(2, "0")} <SENHA_DE_COMANDO_CIFRADA> FF <CRC>`;
}

export function validateVettiSimulationTarget(input: Pick<VettiSimulationInput, "commandType" | "zoneNumber" | "pgmNumber">) {
  if ((input.commandType === "isolate_zone" || input.commandType === "restore_zone") && (!input.zoneNumber || input.zoneNumber < 1 || input.zoneNumber > 511)) {
    return "Informe uma zona Vetti entre 1 e 511 para isolar ou restaurar";
  }
  if (input.commandType === "activate_pgm" && (!input.pgmNumber || input.pgmNumber < 1 || input.pgmNumber > 255)) {
    return "Informe uma PGM Vetti entre 1 e 255";
  }
  return undefined;
}

export function buildVettiSimulationFrames(input: VettiSimulationInput) {
  const login = "02 07 AF 11 <SENHA_DE_ACESSO_REMOTO_CIFRADA> FF <CRC>";
  const status = buildVettiFrame(0x14, [VETTI_NULL]);

  if (input.commandType === "arm") {
    return [login, status, buildVettiCredentialTemplate(0x42)];
  }
  if (input.commandType === "disarm") {
    return [login, status, buildVettiCredentialTemplate(0x43)];
  }
  if (input.commandType === "isolate_zone" || input.commandType === "restore_zone") {
    const zone = input.zoneNumber || 0;
    const action = input.commandType === "isolate_zone" ? 0x01 : 0x00;
    return [login, status, buildVettiFrame(0x29, [action, (zone >> 8) & 0x01, zone & 0xFF])];
  }
  return [login, status, buildVettiFrame(0x17, [0x01, input.pgmNumber || 0, VETTI_NULL])];
}

export function buildVettiSimulationPayload(input: VettiSimulationInput) {
  return JSON.stringify({
    protocol: "Vetti VSec Rev. 13",
    mode: "simulation",
    commandType: input.commandType,
    zoneNumber: input.zoneNumber ?? null,
    pgmNumber: input.pgmNumber ?? null,
    frames: buildVettiSimulationFrames(input),
    note: "Simulação registrada; senhas técnicas permanecem cifradas e nenhum frame VSec foi transmitido à central.",
  });
}
