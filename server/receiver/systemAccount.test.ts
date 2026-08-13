import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getOperationalDeliveryPlan, resolveSystemAccount, shouldOpenOperationalAttendance } from "./systemAccount";

describe("Conta do Sistema", () => {
  it("preserva a conta de uma central cadastrada", () => {
    expect(resolveSystemAccount("0001", true)).toEqual({ account: "0001", receivedAccount: "0001", isSystemAccount: false });
  });

  it("direciona central sem conta para a conta técnica 0000", () => {
    expect(resolveSystemAccount("", false)).toEqual({ account: "0000", receivedAccount: "", isSystemAccount: true });
  });

  it("direciona conta recebida de central desconhecida para 0000 e preserva o valor original", () => {
    expect(resolveSystemAccount("1234", false)).toEqual({ account: "0000", receivedAccount: "1234", isSystemAccount: true });
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

  it("registra a conta técnica no relatório sem emitir card para o dashboard", () => {
    const receiver = readFileSync(resolve(process.cwd(), "server/receiver/index.ts"), "utf8");

    expect(receiver).toContain("getOperationalDeliveryPlan({");
    expect(receiver).toContain("Registrada na Conta do Sistema (0000) para conferência no relatório");
    expect(receiver).toContain("if (deliveryPlan.shouldPersistReport) {");
    expect(receiver).toContain("await createOccurrence({");
    expect(receiver).toContain("if (deliveryPlan.shouldEmitDashboard && eventCallback)");
  });
});
