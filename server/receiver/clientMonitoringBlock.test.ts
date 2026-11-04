import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import * as db from "../db";
import { processEvent } from "./index";

vi.mock("../db");

const system = { id: 42, clientId: 17, account: "0044", brand: "RADIOENGE" };
const profile = { id: 17, name: "Cliente de teste", fantasyName: "Loja de teste", partnerCompanyId: 3, monitoringStatus: "active" as const, monitoringStatusReason: null, monitoringStatusUntil: null };
const alarmEvent = { brand: "RADIOENGE", account: "0044", qualifier: "E", eventCode: "130", partition: "01", zoneUser: "003", receiverPort: 9035, rawData: "PACOTE_TESTE_SEM_TRANSMISSAO" };

describe("bloqueio de monitoramento no processamento de evento", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(db.getContactIdDescription).mockResolvedValue({ description: "Alarme de zona", priority: "high", abreTela: 1 } as any);
    vi.mocked(db.getAlarmSystemByCapturedPanelIdentifier).mockResolvedValue(system as any);
    vi.mocked(db.getAlarmSystemByReceivedAccount).mockResolvedValue(system as any);
    vi.mocked(db.getClientOperationalProfile).mockResolvedValue(profile);
    vi.mocked(db.createAlarmEvent).mockResolvedValue({ id: 400 });
    vi.mocked(db.createAlarmEventWithOpenIncident).mockResolvedValue({ eventId: 400, incidentId: 500 });
    vi.mocked(db.isSystemInMaintenance).mockReturnValue(false);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(["blocked", "suspended"] as const)("preserva evento e ocorrência de relatório de cliente %s, sem incidente", async (monitoringStatus) => {
    vi.mocked(db.getClientOperationalProfile).mockResolvedValue({ ...profile, monitoringStatus, monitoringStatusReason: "Solicitação do cliente", monitoringStatusUntil: new Date("2099-01-01T00:00:00Z") });
    expect(await processEvent(alarmEvent, "127.0.0.1")).toBe(true);
    expect(db.createAlarmEvent).toHaveBeenCalledWith(expect.objectContaining({ account: "0044", alarmSystemId: 42, autoFinalized: true, autoFinalizationReason: expect.stringContaining("Solicitação do cliente"), rawData: expect.stringContaining("PACOTE_TESTE_SEM_TRANSMISSAO") }));
    expect(db.createOccurrence).toHaveBeenCalledWith(expect.objectContaining({ account: "0044", systemId: 42, clientId: 17, partnerCompanyId: 3, observations: expect.stringContaining("sem abrir atendimento") }));
    expect(db.createAlarmEventWithOpenIncident).not.toHaveBeenCalled();
    expect(db.createConfirmedVettiDisarmEventWithOpenIncident).not.toHaveBeenCalled();
  });

  it("Radioenge E361 de cliente suspenso não cria observação que possa estourar na tela", async () => {
    vi.mocked(db.getClientOperationalProfile).mockResolvedValue({ ...profile, monitoringStatus: "suspended" });
    expect(await processEvent({ ...alarmEvent, eventCode: "361" }, "127.0.0.1")).toBe(true);
    expect(db.createAlarmEvent).toHaveBeenCalled();
    expect(db.createOccurrence).toHaveBeenCalled();
    expect(db.createAlarmEventWithOpenIncident).not.toHaveBeenCalled();
  });

  it("suspensão expirada permite novo atendimento normalmente", async () => {
    vi.mocked(db.getClientOperationalProfile).mockResolvedValue({ ...profile, monitoringStatus: "suspended", monitoringStatusUntil: new Date("2020-01-01T00:00:00Z") });
    expect(await processEvent(alarmEvent, "127.0.0.1")).toBe(true);
    expect(db.createAlarmEventWithOpenIncident).toHaveBeenCalledWith(expect.objectContaining({ incident: expect.objectContaining({ status: "waiting", clientId: 17, alarmSystemId: 42 }) }));
    expect(db.createOccurrence).not.toHaveBeenCalled();
  });

  it("falha na consulta do perfil não silencia alarme", async () => {
    vi.mocked(db.getClientOperationalProfile).mockRejectedValue(new Error("Banco indisponível para consulta"));
    expect(await processEvent(alarmEvent, "127.0.0.1")).toBe(true);
    expect(db.createAlarmEventWithOpenIncident).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("aplica o bloqueio também às varreduras internas de Keep Alive e agenda", () => {
    const source = fs.readFileSync("server/db.ts", "utf8");
    expect(source).toContain("isMonitoringBlocked: (system) => isClientMonitoringBlocked(clientById.get(system.clientId || 0), referenceTime)");
    expect(source).toContain("if (isClientMonitoringBlocked(systemRow, now)) { skipped += 1; continue; }");
  });
});
