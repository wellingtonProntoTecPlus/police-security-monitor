export type KeepAliveDisconnectCandidate = {
  id: number;
  account: string;
  brand: string;
  clientId: number | null;
  receiverPort: number | null;
  connectionStatus: "online" | "offline" | "not_monitored";
  keepAliveMonitoringEnabled: boolean;
  keepAliveDisconnectAlertEnabled: boolean;
  keepAliveOfflineAfterMinutes: number | null;
  cutoffMs: number | null;
  lastKeepAliveAt: Date | null;
  maintenanceStartAt: Date | null;
  maintenanceEndAt: Date | null;
};

export type EligibleKeepAliveDisconnectCandidate = Omit<KeepAliveDisconnectCandidate, "lastKeepAliveAt"> & {
  lastKeepAliveAt: Date;
};

/** Filtra apenas quedas contínuas que ultrapassaram o prazo calculado pelo status. */
export async function processKeepAliveDisconnectCandidates<TOpening>(input: {
  systems: KeepAliveDisconnectCandidate[];
  isInMaintenance: (system: KeepAliveDisconnectCandidate) => boolean;
  isMonitoringBlocked?: (system: KeepAliveDisconnectCandidate) => boolean;
  openOnce: (system: EligibleKeepAliveDisconnectCandidate) => Promise<TOpening | null>;
}) {
  const opened: TOpening[] = [];
  let skipped = 0;
  for (const system of input.systems) {
    const eligible = system.connectionStatus === "offline"
      && system.keepAliveMonitoringEnabled
      && system.keepAliveDisconnectAlertEnabled
      && !!system.lastKeepAliveAt
      && !input.isMonitoringBlocked?.(system)
      && !input.isInMaintenance(system);
    if (!eligible) {
      skipped += 1;
      continue;
    }
    const opening = await input.openOnce(system as EligibleKeepAliveDisconnectCandidate);
    if (opening) opened.push(opening);
  }
  return { opened, skipped };
}
