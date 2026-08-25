import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getKeepAliveConnectionStatus } from "./keepAliveStatus";
import { processKeepAliveDisconnectCandidates, restoreKeepAliveDisconnectAlerts } from "./keepAliveDisconnectWorkflow";

const projectRoot = path.resolve(__dirname, "../");

describe("ocorrência por desconexão de Keep Alive", () => {
  it("mantém Online no limite e só considera Offline após ultrapassá-lo", () => {
    const lastKeepAliveAt = new Date("2026-08-22T20:00:00.000Z");
    expect(getKeepAliveConnectionStatus({ lastKeepAliveAt, configuredOfflineAfterMinutes: 15, now: new Date("2026-08-22T20:15:00.000Z") }).connectionStatus).toBe("online");
    expect(getKeepAliveConnectionStatus({ lastKeepAliveAt, configuredOfflineAfterMinutes: 15, now: new Date("2026-08-22T20:15:00.001Z") }).connectionStatus).toBe("offline");
  });

  it("protege a criação única e transfere a ocorrência restaurada para observação", () => {
    const dbSource = fs.readFileSync(path.join(projectRoot, "server/db.ts"), "utf8");
    const schemaSource = fs.readFileSync(path.join(projectRoot, "drizzle/schema.ts"), "utf8");
    expect(schemaSource).toContain("system_disconnect_alerts_system_outage_unique");
    expect(dbSource).toContain("export async function sweepKeepAliveDisconnects");
    expect(dbSource).toContain("export async function markDisconnectAlertsRestored");
    expect(dbSource).toContain('status: "observing"');
  });

  it("abre uma única vez após o prazo e não soma períodos que receberam novo Keep Alive", async () => {
    const offline = {
      id: 27,
      account: "0071",
      brand: "JFL",
      clientId: 12,
      receiverPort: 9061,
      connectionStatus: "offline" as const,
      keepAliveMonitoringEnabled: true,
      keepAliveDisconnectAlertEnabled: true,
      keepAliveOfflineAfterMinutes: 15,
      cutoffMs: 900_000,
      lastKeepAliveAt: new Date("2026-08-22T20:00:00.000Z"),
      maintenanceStartAt: null,
      maintenanceEndAt: null,
    };
    const recoveredBeforeDeadline = { ...offline, id: 28, connectionStatus: "online" as const, lastKeepAliveAt: new Date("2026-08-22T20:14:59.000Z") };
    const claims = new Set<number>();
    const openOnce = async (system: typeof offline) => {
      if (claims.has(system.id)) return null;
      claims.add(system.id);
      return { incidentId: system.id };
    };

    const first = await processKeepAliveDisconnectCandidates({ systems: [offline, recoveredBeforeDeadline], isInMaintenance: () => false, openOnce });
    const second = await processKeepAliveDisconnectCandidates({ systems: [offline, recoveredBeforeDeadline], isInMaintenance: () => false, openOnce });
    expect(first.opened).toEqual([{ incidentId: 27 }]);
    expect(second.opened).toEqual([]);
    expect(first.skipped).toBe(1);
  });

  it("mantém a ocorrência restaurada em Observação para finalização manual", async () => {
    const restored: number[] = [];
    const observing: number[] = [];
    const total = await restoreKeepAliveDisconnectAlerts({
      alerts: [{ id: 4, incidentId: 12 }, { id: 5, incidentId: null }],
      markRestored: async (id) => { restored.push(id); },
      moveIncidentToObservation: async (id) => { observing.push(id); },
    });
    expect(total).toBe(2);
    expect(restored).toEqual([4, 5]);
    expect(observing).toEqual([12]);
  });
});
