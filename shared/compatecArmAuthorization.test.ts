import { describe, expect, it } from "vitest";
import {
  COMPATEC_ARM_AUTHORIZATION_BASES,
  areCompatecArmScheduleBasesAllowed,
  getCompatecArmAuditReason,
  getCompatecArmAuthorizationOptions,
  getCompatecArmAuthorizationBasisFromAuditReason,
  getCompatecArmStateEventIdFromAuditReason,
  isCompatecArmScheduleBasisAllowed,
  isCompatecManualReconciliationEvidenceValid,
  isCurrentCompatecStateEventSource,
} from "./compatecArmAuthorization";

describe("autorização Compatec de Arme", () => {
  it("exige evidência técnica direta, rastreável e compatível com o resultado declarado", () => {
    const evidence = {
      commandType: "arm",
      outcome: "not_applied",
      verificationSource: "official_app_command_history",
      observedState: "disarmed",
      evidenceReference: "Registro #APP-12345",
    };
    expect(isCompatecManualReconciliationEvidenceValid(evidence)).toBe(true);
    expect(isCompatecManualReconciliationEvidenceValid({ ...evidence, observedState: "armed" })).toBe(false);
    expect(isCompatecManualReconciliationEvidenceValid({ ...evidence, verificationSource: "external_report" })).toBe(false);
    expect(isCompatecManualReconciliationEvidenceValid({ ...evidence, evidenceReference: "a pessoa falou" })).toBe(false);
    expect(isCompatecManualReconciliationEvidenceValid({ ...evidence, outcome: "applied", observedState: "disarmed" })).toBe(false);
    expect(isCompatecManualReconciliationEvidenceValid({
      ...evidence, commandType: "configure_zones", outcome: "not_applied", observedState: "all_targets_unchanged",
    })).toBe(true);
  });

  it("aceita estado final verificado apenas quando corresponde ao estado pedido pelo comando", () => {
    const direct = { verificationSource: "official_app_command_history", evidenceReference: "Registro #APP-12346" };
    expect(isCompatecManualReconciliationEvidenceValid({ commandType: "arm", outcome: "verified", observedState: "armed", ...direct })).toBe(true);
    expect(isCompatecManualReconciliationEvidenceValid({ commandType: "arm", outcome: "verified", observedState: "disarmed", ...direct })).toBe(false);
    expect(isCompatecManualReconciliationEvidenceValid({ commandType: "disarm", outcome: "verified", observedState: "disarmed", ...direct })).toBe(true);
    expect(isCompatecManualReconciliationEvidenceValid({ commandType: "isolate_zone", outcome: "verified", observedState: "zone_isolated", ...direct })).toBe(true);
    expect(isCompatecManualReconciliationEvidenceValid({ commandType: "restore_zone", outcome: "verified", observedState: "zone_normal", ...direct })).toBe(true);
    expect(isCompatecManualReconciliationEvidenceValid({ commandType: "configure_zones", outcome: "verified", observedState: "all_targets_applied", ...direct })).toBe(true);
  });

  it("valida evento Compatec com prova explícita da conta recebida e identidade física", () => {
    const system = { account: "0342", receiverPort: 9271, macAddress: "C1:BD:CB", imeiGprs: null };
    const event = {
      brand: "COMPATEC", account: "0342", receiverPort: 9271,
      rawData: "Conta recebida: 0342\nIdentificado por mac_ascii: C1BDCB",
    };
    expect(isCurrentCompatecStateEventSource(event, system)).toBe(true);
    expect(isCurrentCompatecStateEventSource({ ...event, account: "9999" }, system)).toBe(false);
    expect(isCurrentCompatecStateEventSource({ ...event, receiverPort: 9272 }, system)).toBe(false);
    expect(isCurrentCompatecStateEventSource({ ...event, brand: "INTELBRAS" }, system)).toBe(false);
    expect(isCurrentCompatecStateEventSource({ ...event, rawData: "Identificado por mac_ascii: FFFFFF" }, system)).toBe(false);
    expect(isCurrentCompatecStateEventSource({ ...event, rawData: "Identificado por MAC confirmado no ISECnet 0x94 desta origem" }, system)).toBe(false);
  });

  it("rejeita a conta recebida divergente mesmo quando conta canônica, porta e MAC coincidem", () => {
    const system = { account: "0342", receiverPort: 9271, macAddress: "C1:BD:CB", imeiGprs: null };
    const event = {
      brand: "COMPATEC", account: "0342", receiverPort: 9271,
      rawData: "Conta recebida: 9999\nIdentificado por mac_ascii: C1BDCB",
    };
    expect(isCurrentCompatecStateEventSource(event, system)).toBe(false);
  });

  it("falha fechada quando a prova da conta recebida está ausente ou ilegível", () => {
    const system = { account: "0342", receiverPort: 9271, macAddress: "C1:BD:CB", imeiGprs: null };
    const event = {
      brand: "COMPATEC", account: "0342", receiverPort: 9271,
      rawData: "Conta recebida: 0342\nIdentificado por mac_ascii: C1BDCB",
    };
    expect(isCurrentCompatecStateEventSource({ ...event, rawData: "Identificado por mac_ascii: C1BDCB" }, system)).toBe(false);
    expect(isCurrentCompatecStateEventSource({ ...event, rawData: "Conta recebida: ausente\nIdentificado por mac_ascii: C1BDCB" }, system)).toBe(false);
    expect(isCurrentCompatecStateEventSource({ ...event, rawData: "Conta recebida 0342\nIdentificado por mac_ascii: C1BDCB" }, system)).toBe(false);
    expect(isCurrentCompatecStateEventSource({ ...event, rawData: "Conta recebida:  0342\nIdentificado por mac_ascii: C1BDCB" }, system)).toBe(false);
    expect(isCurrentCompatecStateEventSource({ ...event, rawData: "Conta recebida: 0342 \nIdentificado por mac_ascii: C1BDCB" }, system)).toBe(false);
    expect(isCurrentCompatecStateEventSource({ ...event, rawData: " Conta recebida: 0342\nIdentificado por mac_ascii: C1BDCB" }, system)).toBe(false);
    expect(isCurrentCompatecStateEventSource({ ...event, rawData: "Conta recebida: 0342\nConta recebida: 0342\nIdentificado por mac_ascii: C1BDCB" }, system)).toBe(false);
  });

  it("não aceita apenas a conta canônica quando rawData não comprova a origem dela", () => {
    const system = { account: "0342", receiverPort: 9271, macAddress: "C1:BD:CB", imeiGprs: null };
    const event = {
      brand: "COMPATEC", account: "0342", receiverPort: 9271,
      rawData: "Identificado por mac_ascii: C1BDCB",
    };
    expect(isCurrentCompatecStateEventSource(event, system)).toBe(false);
  });

  it("oferece apenas solicitação do cliente, hora programada atingida ou Arme programado atrasado", () => {
    expect(COMPATEC_ARM_AUTHORIZATION_BASES).toEqual([
      "customer_request",
      "scheduled_time_due",
      "scheduled_arm_overdue",
    ]);
    expect(getCompatecArmAuthorizationOptions().map(({ value }) => value)).toEqual(COMPATEC_ARM_AUTHORIZATION_BASES);
    expect(getCompatecArmAuditReason("customer_request")).toContain("Pedido do cliente");
    const auditReason = getCompatecArmAuditReason("scheduled_arm_overdue", 42);
    expect(getCompatecArmAuthorizationBasisFromAuditReason(auditReason)).toBe("scheduled_arm_overdue");
    expect(getCompatecArmStateEventIdFromAuditReason(auditReason)).toBe(42);
  });

  it("aceita uma solicitação do cliente sem exigir texto livre nem agenda", () => {
    expect(isCompatecArmScheduleBasisAllowed("customer_request", {
      expectedState: "unknown",
      transition: null,
      toleranceMinutes: 10,
      status: "report_only",
    })).toBe(true);
  });

  it("permite a base ‘na hora’ somente quando a agenda ativa já espera Arme dentro da tolerância", () => {
    const due = {
      expectedState: "armed" as const,
      transition: { kind: "arm" as const, minutesFromNow: -4 },
      toleranceMinutes: 10,
      status: "within_schedule" as const,
    };
    expect(isCompatecArmScheduleBasisAllowed("scheduled_time_due", due)).toBe(true);
    expect(isCompatecArmScheduleBasisAllowed("scheduled_time_due", { ...due, transition: { ...due.transition, minutesFromNow: 1 } })).toBe(false);
    expect(isCompatecArmScheduleBasisAllowed("scheduled_time_due", { ...due, status: "report_only" })).toBe(false);
    expect(isCompatecArmScheduleBasisAllowed("scheduled_time_due", { ...due, expectedState: "disarmed" })).toBe(false);
  });

  it("permite Arme já atrasado somente quando a agenda registra missed_arm além da tolerância", () => {
    const overdue = {
      expectedState: "armed" as const,
      transition: { kind: "arm" as const, minutesFromNow: -18 },
      toleranceMinutes: 10,
      status: "missed_arm" as const,
    };
    expect(isCompatecArmScheduleBasisAllowed("scheduled_arm_overdue", overdue)).toBe(true);
    expect(isCompatecArmScheduleBasisAllowed("scheduled_arm_overdue", { ...overdue, transition: { ...overdue.transition, minutesFromNow: -5 } })).toBe(false);
    expect(isCompatecArmScheduleBasisAllowed("scheduled_arm_overdue", { ...overdue, status: "within_schedule" })).toBe(false);
    expect(isCompatecArmScheduleBasisAllowed("scheduled_arm_overdue", { ...overdue, transition: { kind: "disarm", minutesFromNow: -18 } })).toBe(false);
  });

  it("exige que todas as agendas ativas autorize o Arme total", () => {
    const due = { expectedState: "armed" as const, transition: { kind: "arm" as const, minutesFromNow: -4 }, toleranceMinutes: 10, status: "within_schedule" as const };
    expect(areCompatecArmScheduleBasesAllowed("scheduled_time_due", [due, due])).toBe(true);
    expect(areCompatecArmScheduleBasesAllowed("scheduled_time_due", [due, { ...due, expectedState: "disarmed" }])).toBe(false);
    expect(areCompatecArmScheduleBasesAllowed("scheduled_time_due", [])).toBe(false);
  });
});
