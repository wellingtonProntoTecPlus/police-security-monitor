export type PanelLeaseSnapshot = {
  incidentId: number;
  operatorId: number;
  authSessionId: number;
  leaseToken: string;
  expiresAt: Date | string | null;
  sessionRevokedAt: Date | string | null;
  sessionExpiresAt: Date | string | null;
};

export type PanelLeaseActor = { operatorId: number; authSessionId: number; leaseToken: string };

function dateMillis(value: Date | string | null | undefined) {
  if (!value) return Number.NaN;
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function isPanelLeaseActive(lease: PanelLeaseSnapshot | null | undefined, now = new Date()) {
  if (!lease || lease.sessionRevokedAt) return false;
  return dateMillis(lease.expiresAt) > now.getTime() && dateMillis(lease.sessionExpiresAt) > now.getTime();
}

export function ownsActivePanelLease(lease: PanelLeaseSnapshot | null | undefined, actor: PanelLeaseActor, now = new Date()) {
  return isPanelLeaseActive(lease, now)
    && lease!.operatorId === actor.operatorId
    && lease!.authSessionId === actor.authSessionId
    && lease!.leaseToken === actor.leaseToken;
}

export function canAcquirePanelLease(lease: PanelLeaseSnapshot | null | undefined, actor: PanelLeaseActor, now = new Date()) {
  return !isPanelLeaseActive(lease, now) || ownsActivePanelLease(lease, actor, now);
}
