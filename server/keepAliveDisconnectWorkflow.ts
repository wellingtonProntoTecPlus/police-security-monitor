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
  openOnce: (system: EligibleKeepAliveDisconnectCandidate) => Promise<TOpening | null>;
}) {
  const opened: TOpening[] = [];
  let skipped = 0;
  for (const system of input.systems) {
    const eligible = system.connectionStatus === "offline"
      && system.keepAliveMonitoringEnabled
      && system.keepAliveDisconnectAlertEnabled
      && !!system.lastKeepAliveAt
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

export type RestorableDisconnectAlert = { id: number; incidentId: number | null };

/** Registra o retorno sem apagar o incidente; ele permanece em Observação para o operador finalizar. */
export async function restoreKeepAliveDisconnectAlerts(input: {
  alerts: RestorableDisconnectAlert[];
  markRestored: (alertId: number) => Promise<void>;
  moveIncidentToObservation: (incidentId: number) => Promise<void>;
}) {
  for (const alert of input.alerts) {
    await input.markRestored(alert.id);
    if (alert.incidentId) await input.moveIncidentToObservation(alert.incidentId);
  }
  return input.alerts.length;
}
