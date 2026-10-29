export type RemoteCommandBrand = "COMPATEC" | "VETTI" | "INTELBRAS" | "";

type RemoteCommandEvent = {
  brand?: string | null;
  alarmSystemId?: number | null;
  incidentSystemId?: number | null;
};

type RemoteCommandSystem = {
  id?: number | null;
  brand?: string | null;
};

function normalizeBrand(value?: string | null): RemoteCommandBrand {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "COMPATEC" || normalized === "VETTI" || normalized === "INTELBRAS" ? normalized : "";
}

function validId(value?: number | null) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}

/**
 * O sistema resolvido pelo ID persistido é a fonte confiável. O evento bruto é
 * usado como fallback para eventos antigos ou recém-chegados antes do refresh.
 */
export function resolveRemoteCommandIdentity(event?: RemoteCommandEvent | null, system?: RemoteCommandSystem | null) {
  return {
    brand: normalizeBrand(system?.brand) || normalizeBrand(event?.brand),
    systemId: validId(system?.id) || validId(event?.alarmSystemId) || validId(event?.incidentSystemId),
  };
}
