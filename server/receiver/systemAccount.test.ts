import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getOperationalDeliveryPlan, resolveSystemAccount, shouldOpenOperationalAttendance } from "./systemAccount";
import { getEffectiveClientMonitoringStatus, isClientMonitoringBlocked } from "@shared/clientMonitoringStatus";

describe("Conta do Sistema", () => {
  it("usa a conta cadastrada de uma central identificada fisicamente", () => {
    expect(resolveSystemAccount("0001", { account: "0022" })).toEqual({ account: "0022", receivedAccount: "0001", isSystemAccount: false });
  });

  it("remove NUL da conta bruta e mantém a auditoria quando usa a conta cadastrada", () => {
    expect(resolveSystemAccount("\0$00", { account: "0022" })).toEqual({ account: "0022", receivedAccount: "$00", isSystemAccount: false });
  });

  it("direciona central sem conta para a conta técnica 0000", () => {
    expect(resolveSystemAccount("", undefined)).toEqual({ account: "0000", receivedAccount: "", isSystemAccount: true });
  });

  it("direciona conta recebida de central desconhecida para 0000 e preserva o valor original", () => {
    expect(resolveSystemAccount("1234", undefined)).toEqual({ account: "0000", receivedAccount: "1234", isSystemAccount: true });
  });

  it("mantém eventos da Conta do Sistema fora das filas mesmo quando o código abriria atendimento", () => {
    expect(shouldOpenOperationalAttendance({
      isSystemAccount: true,
      automaticAction: "track_for_restoration",
      systemInMaintenance: false,
    })).toBe(false);
  });

  it("permite atendimento somente para sistema identificado com evento operacional", () => {
    expect(shouldOpenOperationalAttendance({
      isSystemAccount: false,
      automaticAction: "track_for_restoration",
      systemInMaintenance: false,
    })).toBe(true);
  });

  it("planeja persistência em relatório sem incidente aberto ou emissão para a Conta do Sistema", () => {
    expect(getOperationalDeliveryPlan({
      isSystemAccount: true,
      automaticAction: "queue",
      systemInMaintenance: false,
    })).toEqual({
      shouldOpenAttendance: false,
      shouldPersistReport: true,
      shouldEmitDashboard: false,
    });
  });

  it("planeja incidente e emissão ao dashboard para uma central identificada", () => {
    expect(getOperationalDeliveryPlan({
      isSystemAccount: false,
      automaticAction: "queue",
      systemInMaintenance: false,
    })).toEqual({
      shouldOpenAttendance: true,
      shouldPersistReport: false,
      shouldEmitDashboard: true,
    });
  });

  it("mantém eventos do cliente bloqueado/suspenso no relatório sem abrir atendimento ou emitir cartão", () => {
    expect(getOperationalDeliveryPlan({
      isSystemAccount: false,
      automaticAction: "queue",
      systemInMaintenance: false,
      clientMonitoringBlocked: true,
    })).toEqual({
      shouldOpenAttendance: false,
      shouldPersistReport: true,
      shouldEmitDashboard: false,
    });
  });

  it("aplica a suspensão apenas até a data cadastrada e mantém bloqueio administrativo sem prazo", () => {
    const now = new Date("2026-11-04T15:00:00.000Z");
    const suspended = { monitoringStatus: "suspended", monitoringStatusUntil: "2026-11-04T16:00:00.000Z" };
    const expired = { monitoringStatus: "suspended", monitoringStatusUntil: "2026-11-04T14:00:00.000Z" };

    expect(getEffectiveClientMonitoringStatus(suspended, now)).toBe("suspended");
    expect(isClientMonitoringBlocked(suspended, now)).toBe(true);
    expect(getEffectiveClientMonitoringStatus(expired, now)).toBe("active");
    expect(isClientMonitoringBlocked({ monitoringStatus: "blocked" }, now)).toBe(true);
  });

  it("planeja auditoria sem fila para um evento interno ViaWeb associado", () => {
    expect(getOperationalDeliveryPlan({
      isSystemAccount: false,
      automaticAction: "report_only",
      systemInMaintenance: false,
    })).toEqual({
      shouldOpenAttendance: false,
      shouldPersistReport: true,
      shouldEmitDashboard: false,
    });
  });

  it("mantém restauração fora da fila para fechar somente a falha anterior", () => {
    expect(getOperationalDeliveryPlan({
      isSystemAccount: false,
      automaticAction: "try_restoration",
      systemInMaintenance: false,
    })).toEqual({
      shouldOpenAttendance: false,
      shouldPersistReport: true,
      shouldEmitDashboard: false,
    });
  });

  it("registra a conta técnica no relatório sem emitir card para o dashboard", () => {
    const receiver = readFileSync(resolve(process.cwd(), "server/receiver/index.ts"), "utf8");

    expect(receiver).toContain("getOperationalDeliveryPlan({");
    expect(receiver).toContain("getEffectiveClientMonitoringStatus(client, eventReceivedAt)");
    expect(receiver).toContain("clientMonitoringBlocked,");
    expect(receiver).toContain("evento registrado somente no relatório, sem abrir atendimento");
    expect(receiver).toContain('const deliveryAutomaticAction = isViawebInternalEvent ? "report_only" as const : eventAutomaticAction;');
    expect(receiver).toContain("Registrada na Conta do Sistema (0000) para conferência no relatório");
    expect(receiver).toContain("if ((deliveryPlan.shouldPersistReport || Boolean(repeatedTrackedIncident)) && !remoteCommandMatched && !radioengeObservation) {");
    expect(receiver).toContain("await persistAutomaticOccurrence({");
    expect(receiver).toContain("if ((deliveryPlan.shouldEmitDashboard || remoteCommandMatched) && !radioengeObservation && eventCallback)");
    expect(receiver).toContain("createConfirmedVettiDisarmEventWithOpenIncident");
  });
});
