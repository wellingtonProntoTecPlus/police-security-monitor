export type OccurrenceSystemReference = {
  id: number;
  clientId: number | null;
};

export type OccurrenceClientReference = {
  id: number;
  name: string;
  fantasyName?: string | null;
  partnerCompanyId?: number | null;
};

export function getAutomaticOccurrenceAssociation(
  system?: OccurrenceSystemReference | null,
  client?: OccurrenceClientReference | null,
) {
  return {
    systemId: system?.id ?? null,
    clientId: system?.clientId ?? null,
    clientName: client?.fantasyName || client?.name || null,
    partnerCompanyId: client?.partnerCompanyId ?? null,
  };
}
