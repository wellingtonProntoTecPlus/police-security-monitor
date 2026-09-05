export type SystemAccountResolution = {
  account: string;
  receivedAccount: string;
  isSystemAccount: boolean;
};

type IdentifiedSystemAccount = { account?: string | null } | null | undefined;

export function resolveSystemAccount(receivedAccount: string | null | undefined, system: IdentifiedSystemAccount): SystemAccountResolution {
  // Alguns quadros JFL incluem NUL antes da conta transmitida. A conta bruta
  // continua auditável, mas caracteres de controle não devem aparecer no
  // relatório nem decidir o sistema associado.
  const normalized = (receivedAccount || "").replace(/\0/g, "").trim();
  const registeredAccount = (system?.account || "").trim();
  if (registeredAccount) {
    // A identidade física (MAC, IMEI, serial ou ISEP) já foi confirmada pelo
    // receptor. A conta de cadastro é a referência operacional; a conta do
    // pacote é preservada em receivedAccount para auditoria.
    return { account: registeredAccount, receivedAccount: normalized, isSystemAccount: false };
  }
  return { account: "0000", receivedAccount: normalized, isSystemAccount: true };
}

export function shouldOpenOperationalAttendance(input: {
  isSystemAccount: boolean;
  automaticAction: "queue" | "report_only" | "track_for_restoration" | "try_restoration";
  systemInMaintenance: boolean;
}) {
  return getOperationalDeliveryPlan(input).shouldOpenAttendance;
}

export function getOperationalDeliveryPlan(input: {
  isSystemAccount: boolean;
  automaticAction: "queue" | "report_only" | "track_for_restoration" | "try_restoration";
  systemInMaintenance: boolean;
}) {
  const shouldOpenAttendance = !input.isSystemAccount && input.automaticAction !== "report_only" && !input.systemInMaintenance;
  return {
    shouldOpenAttendance,
    shouldPersistReport: !shouldOpenAttendance,
    shouldEmitDashboard: shouldOpenAttendance,
  };
}
