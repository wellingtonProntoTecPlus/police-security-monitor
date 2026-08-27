import { z } from "zod";

export const remoteCommandTypes = ["arm", "disarm", "isolate_zone", "restore_zone", "activate_pgm"] as const;
export type RemoteCommandType = typeof remoteCommandTypes[number];
export const COMPATEC_BENCH_MAC_SUFFIX = "C1BDCB";
export const VETTI_BENCH_MAC_SUFFIX = "2DE4A8";

export const remoteCommandSimulationInputSchema = z.object({
  alarmSystemId: z.number(),
  incidentId: z.number().optional(),
  commandType: z.enum(remoteCommandTypes),
  reason: z.string().trim().min(5, "Informe o motivo operacional do comando").max(2000),
  partition: z.number().int().min(0).max(16).optional(),
  zoneNumber: z.number().int().min(1).max(511).optional(),
  pgmNumber: z.number().int().min(1).max(255).optional(),
});

const COMPATEC_LINE_END = "\r\n";
const COMPATEC_ALL_SECTORS_MASK = "03FF";
const COMPATEC_ZONE_ISOLATION_FLAG = "0008";

function normalizeHexWord(value: number) {
  return Math.max(0, Math.trunc(value)).toString(16).toUpperCase().padStart(4, "0");
}

function buildCompatecCommand(command: string, args?: string) {
  return `MB=AJ${command}${args ? `[${args}]` : ""}${COMPATEC_LINE_END}`;
}

function buildSectorWordArgs(zoneNumber: number, selectedWord: string, total = 10) {
  return Array.from({ length: total }, (_, index) => index === zoneNumber - 1 ? selectedWord : "0000").join(",");
}

function resolveCompatecPgmGroup(pgmNumber: number) {
  const groupMap: Record<number, number> = {
    1: 5,
    2: 6,
    3: 7,
    4: 16,
    5: 17,
    6: 18,
    7: 19,
    8: 20,
  };
  return groupMap[pgmNumber];
}

export function validateRemoteCommandTarget(input: { commandType: RemoteCommandType; zoneNumber?: number; pgmNumber?: number }) {
  if ((input.commandType === "isolate_zone" || input.commandType === "restore_zone") && (!input.zoneNumber || input.zoneNumber < 1 || input.zoneNumber > 10)) {
    return "Informe uma zona Compatec entre 1 e 10 para isolar ou restaurar";
  }
  if (input.commandType === "activate_pgm" && !input.pgmNumber) {
    return "Informe a PGM a acionar";
  }
  return undefined;
}

export function isConfirmedCompatecBenchSystem(system: { brand?: string | null; macAddress?: string | null; remoteCommandLabEnabled?: boolean | null }) {
  return system.brand === "COMPATEC"
    && Boolean(system.remoteCommandLabEnabled)
    && (system.macAddress || "").replace(/[^A-Z0-9]/gi, "").toUpperCase().endsWith(COMPATEC_BENCH_MAC_SUFFIX);
}

/**
 * Reserva a futura homologação física Vetti somente ao painel de testes
 * identificado pelo MAC confirmado FC-0F-E7-2D-E4-A8. A conta não é usada
 * como identidade de segurança, evitando qualquer associação por conta.
 */
export function isConfirmedVettiBenchSystem(system: { brand?: string | null; macAddress?: string | null; remoteCommandLabEnabled?: boolean | null }) {
  return system.brand === "VETTI"
    && Boolean(system.remoteCommandLabEnabled)
    && (system.macAddress || "").replace(/[^A-Z0-9]/gi, "").toUpperCase().endsWith(VETTI_BENCH_MAC_SUFFIX);
}

export function buildCompatecSimulationPayload(input: {
  commandType: RemoteCommandType;
  partition?: number | null;
  zoneNumber?: number | null;
  pgmNumber?: number | null;
}) {
  const frames = buildCompatecSimulationFrames(input);
  return JSON.stringify({
    protocol: "Compatec MicroBus",
    mode: "simulation",
    commandType: input.commandType,
    partition: input.partition ?? null,
    zoneNumber: input.zoneNumber ?? null,
    pgmNumber: input.pgmNumber ?? null,
    frames,
    note: "Simulação registrada; nenhum pacote foi transmitido à central.",
  });
}

export function buildCompatecSimulationFrames(input: {
  commandType: RemoteCommandType;
  partition?: number | null;
  zoneNumber?: number | null;
  pgmNumber?: number | null;
}) {
  if (input.commandType === "arm") {
    const sectorMask = input.partition && input.partition > 0 ? normalizeHexWord(1 << (input.partition - 1)) : COMPATEC_ALL_SECTORS_MASK;
    return [buildCompatecCommand("4", `0,${sectorMask}`)];
  }

  if (input.commandType === "disarm") {
    return [buildCompatecCommand("4", "0,0000")];
  }

  if (input.commandType === "activate_pgm") {
    const group = resolveCompatecPgmGroup(input.pgmNumber || 0);
    if (!group) throw new Error("PGM Compatec fora do intervalo suportado para simulação");
    return [buildCompatecCommand("4", String(group))];
  }

  const zoneNumber = input.zoneNumber || 0;
  if (zoneNumber < 1 || zoneNumber > 10) throw new Error("Zona Compatec fora do intervalo suportado para simulação");
  const zoneWord = input.commandType === "isolate_zone" ? COMPATEC_ZONE_ISOLATION_FLAG : "0000";
  const sectorArgs = buildSectorWordArgs(zoneNumber, zoneWord);
  return [
    buildCompatecCommand("2", sectorArgs),
    buildCompatecCommand("1", sectorArgs),
  ];
}
