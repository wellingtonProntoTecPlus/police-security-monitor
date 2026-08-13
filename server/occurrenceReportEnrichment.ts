export type OccurrenceReportRow = {
  clientId?: number | null;
  clientName?: string | null;
  systemId?: number | null;
  partnerCompanyId?: number | null;
  [key: string]: unknown;
};

export type OccurrenceReportSystem = {
  id: number;
  clientId: number | null;
};

export type OccurrenceReportClient = {
  id: number;
  name: string;
  fantasyName?: string | null;
  partnerCompanyId?: number | null;
};

export function enrichOccurrenceReportClients(
  rows: OccurrenceReportRow[],
  systems: OccurrenceReportSystem[],
  clients: OccurrenceReportClient[],
) {
  const systemsById = new Map(systems.map((system) => [system.id, system]));
  const clientsById = new Map(clients.map((client) => [client.id, client]));

  return rows.map((row) => {
    const linkedSystem = row.systemId ? systemsById.get(row.systemId) : undefined;
    const resolvedClientId = row.clientId ?? linkedSystem?.clientId ?? null;
    const linkedClient = resolvedClientId ? clientsById.get(resolvedClientId) : undefined;

    return {
      ...row,
      clientId: resolvedClientId,
      clientName: row.clientName || linkedClient?.fantasyName || linkedClient?.name || null,
      partnerCompanyId: row.partnerCompanyId ?? linkedClient?.partnerCompanyId ?? null,
    };
  });
}

export function filterOccurrenceReportRowsByPartner<T extends { partnerCompanyId?: number | null }>(
  rows: T[],
  partnerCompanyId?: number,
) {
  if (!partnerCompanyId) return rows;
  return rows.filter((row) => row.partnerCompanyId === partnerCompanyId);
}
