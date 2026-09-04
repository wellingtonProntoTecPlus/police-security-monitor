export type AlarmSystemDeletionIdentity = {
  account: string;
  brand: string;
  model?: string | null;
  macAddress?: string | null;
  serialNumber?: string | null;
  isepId?: string | null;
};

export function buildAlarmSystemDeletionConfirmation(system: AlarmSystemDeletionIdentity) {
  const identifier = system.macAddress || system.serialNumber || system.isepId || system.account;
  const model = system.model?.trim() || "SEM MODELO";
  return `EXCLUIR ${system.account} ${system.brand} ${model} ${identifier}`.toUpperCase();
}
