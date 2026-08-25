export const remoteCommandTypes = ["arm", "disarm", "isolate_zone", "restore_zone", "activate_pgm"] as const;
export type RemoteCommandType = typeof remoteCommandTypes[number];

export function validateRemoteCommandTarget(input: { commandType: RemoteCommandType; zoneNumber?: number; pgmNumber?: number }) {
  if ((input.commandType === "isolate_zone" || input.commandType === "restore_zone") && !input.zoneNumber) {
    return "Informe a zona a isolar ou restaurar";
  }
  if (input.commandType === "activate_pgm" && !input.pgmNumber) {
    return "Informe a PGM a acionar";
  }
  return undefined;
}

export function buildCompatecSimulationPayload(input: {
  commandType: RemoteCommandType;
  partition?: number | null;
  zoneNumber?: number | null;
  pgmNumber?: number | null;
}) {
  return JSON.stringify({
    protocol: "Compatec MicroBus",
    mode: "simulation",
    commandType: input.commandType,
    partition: input.partition ?? null,
    zoneNumber: input.zoneNumber ?? null,
    pgmNumber: input.pgmNumber ?? null,
    note: "Simulação registrada; nenhum pacote foi transmitido à central.",
  });
}
