export type ClientMonitoringStatus = "active" | "blocked" | "suspended";

type ClientMonitoringStatusInput = {
  monitoringStatus?: ClientMonitoringStatus | string | null;
  monitoringStatusUntil?: Date | string | null;
};

/**
 * A suspensão com data final deixa de bloquear a operação após o prazo.
 * O cadastro preserva a informação para auditoria, mas os indicadores voltam
 * a apresentar o cliente como ativo sem exigir uma intervenção manual urgente.
 */
export function getEffectiveClientMonitoringStatus(
  client: ClientMonitoringStatusInput | null | undefined,
  referenceTime = new Date(),
): ClientMonitoringStatus {
  const status = client?.monitoringStatus;
  if (status === "blocked") return "blocked";
  if (status !== "suspended") return "active";

  if (!client?.monitoringStatusUntil) return "suspended";
  const until = new Date(client.monitoringStatusUntil);
  if (Number.isNaN(until.getTime()) || until.getTime() > referenceTime.getTime()) return "suspended";
  return "active";
}

export function isClientMonitoringBlocked(client: ClientMonitoringStatusInput | null | undefined, referenceTime = new Date()) {
  return getEffectiveClientMonitoringStatus(client, referenceTime) !== "active";
}
