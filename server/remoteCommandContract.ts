import { z } from "zod";

export const remoteCommandTypes = ["arm", "disarm", "isolate_zone", "restore_zone", "activate_pgm"] as const;
export type RemoteCommandType = typeof remoteCommandTypes[number];
export const COMPATEC_BENCH_MAC_SUFFIX = "C1BDCB";
export const VETTI_BENCH_MAC_SUFFIX = "2DE4A8";
export const COMPATEC_PHYSICAL_ZONE_LIMIT = 23;

export const remoteCommandSimulationInputSchema = z.object({
  alarmSystemId: z.number(),
  incidentId: z.number().optional(),
  commandType: z.enum(remoteCommandTypes),
  reason: z.string().trim().min(5, "Informe o motivo operacional do comando").max(2000),
  partition: z.number().int().min(0).max(16).optional(),
  zoneNumber: z.number().int().min(1).max(511).optional(),
  pgmNumber: z.number().int().min(1).max(255).optional(),
});

export const intelbrasPhysicalCommandInputSchema = z.object({
  alarmSystemId: z.number(),
  incidentId: z.number().optional(),
  commandType: z.enum(["arm", "disarm"]),
  reason: z.string().trim().min(5, "Informe o motivo operacional do comando físico").max(2000),
  partition: z.number().int().min(0).max(0).optional(),
});

export type IntelbrasPhysicalCommandType = "arm" | "disarm";

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

export function validateIntelbrasPhysicalTarget(input: {
  commandType: IntelbrasPhysicalCommandType;
  partition?: number | null;
}) {
  if (input.commandType !== "arm" && input.commandType !== "disarm") {
    return "A AMT-8000 aceita somente Arme ou Desarme físico nesta etapa";
  }
  if (input.partition !== undefined && input.partition !== null && input.partition !== 0) {
    return "Nesta etapa, a AMT-8000 aceita somente a operação homologável para todas as partições (0x00)";
  }
  return undefined;
}

export function isPhysicalIntelbrasSystem(system: {
  brand?: string | null;
  model?: string | null;
  macAddress?: string | null;
  isActive?: boolean | null;
}) {
  const normalizedMac = (system.macAddress || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const normalizedModel = (system.model || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return system.brand?.trim().toUpperCase() === "INTELBRAS"
    && normalizedModel.includes("AMT8000")
    && system.isActive !== false
    && normalizedMac.length >= 6;
}

export function isKnownCompatecBenchSystem(system: { brand?: string | null; macAddress?: string | null }) {
  return system.brand === "COMPATEC"
    && (system.macAddress || "").replace(/[^A-Z0-9]/gi, "").toUpperCase().endsWith(COMPATEC_BENCH_MAC_SUFFIX);
}

export function isConfirmedCompatecBenchSystem(system: { brand?: string | null; macAddress?: string | null; remoteCommandLabEnabled?: boolean | null }) {
  return Boolean(system.remoteCommandLabEnabled) && isKnownCompatecBenchSystem(system);
}

/**
 * Reserva a futura homologação física Vetti somente ao painel de testes
 * identificado pelo MAC confirmado FC-0F-E7-2D-E4-A8. A conta não é usada
 * como identidade de segurança, evitando qualquer associação por conta.
 */
export function isKnownVettiBenchSystem(system: { brand?: string | null; macAddress?: string | null }) {
  return system.brand === "VETTI"
    && (system.macAddress || "").replace(/[^A-Z0-9]/gi, "").toUpperCase().endsWith(VETTI_BENCH_MAC_SUFFIX);
}

export function isConfirmedVettiBenchSystem(system: { brand?: string | null; macAddress?: string | null; remoteCommandLabEnabled?: boolean | null }) {
  return Boolean(system.remoteCommandLabEnabled) && isKnownVettiBenchSystem(system);
}

export function isKnownIntelbrasBenchSystem(system: { brand?: string | null; model?: string | null; macAddress?: string | null; isActive?: boolean | null }) {
  const normalizedModel = (system.model || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const normalizedMac = (system.macAddress || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return system.brand?.trim().toUpperCase() === "INTELBRAS"
    && normalizedModel.includes("AMT8000")
    && system.isActive !== false
    && normalizedMac.length >= 6;
}

/** O modo de bancada só se aplica a Compatec/Vetti homologadas ou AMT-8000 identificada. */
export function isKnownRemoteCommandBenchSystem(system: { brand?: string | null; model?: string | null; macAddress?: string | null; isActive?: boolean | null }) {
  return isKnownCompatecBenchSystem(system)
    || isKnownVettiBenchSystem(system)
    || isKnownIntelbrasBenchSystem(system);
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

export type CompatecPhysicalZoneCommandType = "isolate_zone" | "restore_zone";

/** Quadros oficiais AK2→AK1 para alterar exclusivamente o bypass de uma zona. */
export function buildCompatecPhysicalZoneFrames(input: {
  commandType: CompatecPhysicalZoneCommandType;
  zoneNumber: number;
}) {
  if (!Number.isInteger(input.zoneNumber) || input.zoneNumber < 1 || input.zoneNumber > COMPATEC_PHYSICAL_ZONE_LIMIT) {
    throw new Error(`Zona Compatec fora do intervalo documentado de 1 a ${COMPATEC_PHYSICAL_ZONE_LIMIT}`);
  }

  const maskWord = "0008";
  const valueWord = input.commandType === "isolate_zone" ? "0008" : "0000";
  const maskArgs = buildSectorWordArgs(input.zoneNumber, maskWord, COMPATEC_PHYSICAL_ZONE_LIMIT);
  const valueArgs = buildSectorWordArgs(input.zoneNumber, valueWord, COMPATEC_PHYSICAL_ZONE_LIMIT);
  return [
    `MB=AK2[${maskArgs}]${COMPATEC_LINE_END}`,
    `MB=AK1[${valueArgs}]${COMPATEC_LINE_END}`,
  ];
}

/** Gera um único AK2→AK1 com a máscara dos setores selecionados, seguido pelo Arme total oficial. */
export function buildCompatecPhysicalArmWithZonesFrames(zoneNumbers: number[]) {
  const normalized = Array.from(new Set(zoneNumbers)).sort((left, right) => left - right);
  if (normalized.length > COMPATEC_PHYSICAL_ZONE_LIMIT || normalized.some((zone) => !Number.isInteger(zone) || zone < 1 || zone > COMPATEC_PHYSICAL_ZONE_LIMIT)) {
    throw new Error(`Selecione zonas Compatec inteiras entre 1 e ${COMPATEC_PHYSICAL_ZONE_LIMIT}`);
  }
  if (normalized.length === 0) return ["MB=AK4[4]\r\n"];

  const bypassMask = Array.from({ length: COMPATEC_PHYSICAL_ZONE_LIMIT }, (_, index) =>
    normalized.includes(index + 1) ? "0008" : "0000",
  ).join(",");
  return [
    `MB=AK2[${bypassMask}]\r\n`,
    `MB=AK1[${bypassMask}]\r\n`,
    "MB=AK4[4]\r\n",
  ];
}

/** Somente o servidor deve formar o payload depois de ler as seleções válidas no banco. */
export function buildCompatecPhysicalArmWithZonesPayload(input: {
  zoneNumbers: number[];
  requestedBy?: string | null;
  sourceStateEventId?: number;
  selectedBy?: Array<{ zoneNumber: number; operatorId: number; operatorName: string | null }>;
}) {
  const zoneNumbers = Array.from(new Set(input.zoneNumbers)).sort((left, right) => left - right);
  const frames = buildCompatecPhysicalArmWithZonesFrames(zoneNumbers);
  return JSON.stringify({
    protocol: "Compatec MicroBus",
    mode: "physical_arm_with_zones",
    commandType: "arm",
    zoneNumbers,
    sourceStateEventId: input.sourceStateEventId,
    requestedBy: input.requestedBy?.trim() || null,
    selectedBy: input.selectedBy || [],
    frames,
    note: zoneNumbers.length
      ? "Sequência física AK2→AK1 dos setores selecionados e depois AK4[4]. KA1 é somente recebimento; KA4[4] é a resposta do Arme."
      : "Arme total físico oficial AK4[4].",
  });
}

/** Armazena os quadros físicos de zona em formato estruturado e auditável. */
export function buildCompatecPhysicalZonePayload(input: {
  commandType: CompatecPhysicalZoneCommandType;
  zoneNumber: number;
  requestedBy?: string;
}) {
  const frames = buildCompatecPhysicalZoneFrames(input);
  return JSON.stringify({
    protocol: "Compatec MicroBus",
    mode: "physical",
    commandType: input.commandType,
    partition: null,
    zoneNumber: input.zoneNumber,
    requestedBy: input.requestedBy?.trim() || null,
    frames,
    note: "Sequência física AK2→AK1; resposta KA1 confirma recebimento, não o estado final do bypass.",
  });
}

export function validateCompatecPhysicalZoneTarget(input: {
  commandType: string;
  zoneNumber?: number | null;
}) {
  if (input.commandType !== "isolate_zone" && input.commandType !== "restore_zone") {
    return "A ação Compatec física aceita somente isolamento ou restauração de zona";
  }
  if (!Number.isInteger(input.zoneNumber) || Number(input.zoneNumber) < 1 || Number(input.zoneNumber) > COMPATEC_PHYSICAL_ZONE_LIMIT) {
    return `Selecione uma zona Compatec configurada entre 1 e ${COMPATEC_PHYSICAL_ZONE_LIMIT}`;
  }
  return undefined;
}
