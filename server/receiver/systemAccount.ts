export type SystemAccountResolution = {
  account: string;
  receivedAccount: string;
  isSystemAccount: boolean;
};

export function resolveSystemAccount(receivedAccount: string | null | undefined, systemFound: boolean): SystemAccountResolution {
  const normalized = (receivedAccount || "").trim();
  if (systemFound && normalized) {
    return { account: normalized, receivedAccount: normalized, isSystemAccount: false };
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
