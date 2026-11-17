export const COMPATEC_PHYSICAL_ZONE_LIMIT = 23;

export type CompatecZoneConfigurationChange = {
  zoneNumber: number;
  armState?: "armed" | "disarmed";
  bypassState?: "annulled" | "restored";
};

const LINE_END = "\r\n";
const ARMED_FLAG = 0x0080;
const BYPASS_FLAG = 0x0008;

function normalizeHexWord(value: number) {
  return value.toString(16).toUpperCase().padStart(4, "0");
}

/** AK2 seleciona os bits alterados e AK1 define seus valores; a sequência termina em KA1, sem AK4. */
export function buildCompatecZoneConfigurationFrames(zoneChanges: CompatecZoneConfigurationChange[]) {
  if (!Array.isArray(zoneChanges) || zoneChanges.length < 1 || zoneChanges.length > COMPATEC_PHYSICAL_ZONE_LIMIT) {
    throw new Error(`Informe de 1 a ${COMPATEC_PHYSICAL_ZONE_LIMIT} setores para alterar`);
  }
  const masks = Array(COMPATEC_PHYSICAL_ZONE_LIMIT).fill(0);
  const values = Array(COMPATEC_PHYSICAL_ZONE_LIMIT).fill(0);
  const seen = new Set<number>();
  for (const change of zoneChanges) {
    if (!Number.isInteger(change.zoneNumber) || change.zoneNumber < 1 || change.zoneNumber > COMPATEC_PHYSICAL_ZONE_LIMIT) {
      throw new Error(`Setor Compatec fora do intervalo documentado de 1 a ${COMPATEC_PHYSICAL_ZONE_LIMIT}`);
    }
    if (seen.has(change.zoneNumber)) throw new Error("Cada setor pode aparecer uma única vez");
    if (change.armState === undefined && change.bypassState === undefined) {
      throw new Error(`Informe uma alteração para o setor ${change.zoneNumber}`);
    }
    seen.add(change.zoneNumber);
    const index = change.zoneNumber - 1;
    if (change.armState !== undefined) {
      masks[index] |= ARMED_FLAG;
      if (change.armState === "armed") values[index] |= ARMED_FLAG;
    }
    if (change.bypassState !== undefined) {
      masks[index] |= BYPASS_FLAG;
      if (change.bypassState === "annulled") values[index] |= BYPASS_FLAG;
    }
  }
  const maskArgs = masks.map(normalizeHexWord).join(",");
  const valueArgs = values.map(normalizeHexWord).join(",");
  return [`MB=AK2[${maskArgs}]${LINE_END}`, `MB=AK1[${valueArgs}]${LINE_END}`];
}
