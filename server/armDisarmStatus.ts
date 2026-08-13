export type ArmDisarmStatusEvent = {
  account: string;
  qualifier: string;
  receivedAt: Date | null;
  alarmSystemId: number | null;
};

export type ArmDisarmStatusSystem = {
  id: number;
  account: string;
};

export type LatestArmDisarmStatus = {
  account: string;
  qualifier: string;
  receivedAt: Date | null;
  alarmSystemId: number;
};

/**
 * Os indicadores operacionais representam o estado do sistema cadastrado,
 * e não uma conta transitória que um protocolo legado possa ter interpretado
 * incorretamente em um evento histórico.
 */
export function getLatestArmDisarmStatusBySystem(
  events: ArmDisarmStatusEvent[],
  systems: ArmDisarmStatusSystem[],
): LatestArmDisarmStatus[] {
  const systemsById = new Map(systems.map((system) => [system.id, system]));
  const statusBySystem = new Map<number, LatestArmDisarmStatus>();

  for (const event of events) {
    if (!event.alarmSystemId || statusBySystem.has(event.alarmSystemId)) continue;
    const system = systemsById.get(event.alarmSystemId);
    const canonicalAccount = system?.account?.trim() || event.account;
    if (!canonicalAccount || canonicalAccount === "0000") continue;

    statusBySystem.set(event.alarmSystemId, {
      account: canonicalAccount,
      qualifier: event.qualifier,
      receivedAt: event.receivedAt,
      alarmSystemId: event.alarmSystemId,
    });
  }

  return Array.from(statusBySystem.values());
}
