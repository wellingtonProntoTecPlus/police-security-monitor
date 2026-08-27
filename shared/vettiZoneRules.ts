export type VettiZoneReference = {
  zoneNumber?: number | null;
  type?: string | null;
};

/** Zonas 24 horas não retornam ao normal pelo Desarme e exigem restauro explícito. */
export function isVetti24HourZone(zone?: VettiZoneReference | null) {
  return zone?.type === "24h";
}

export function canRestoreVettiZone(zone?: VettiZoneReference | null) {
  return isVetti24HourZone(zone);
}
