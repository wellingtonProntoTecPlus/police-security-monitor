import { classifyContactIdOperationalEvent } from "./alarmSchedulePolicy";

export type ArmDisarmStatusEvent = {
  account: string;
  qualifier: string;
  receivedAt: Date | null;
  alarmSystemId: number | null;
  brand?: string | null;
  eventCode?: string | null;
  description?: string | null;
};

export type ArmDisarmStatusSystem = {
  id: number;
  account: string;
  isActive?: boolean;
};

export type LatestArmDisarmStatus = {
  account: string;
  qualifier: string;
  receivedAt: Date | null;
  alarmSystemId: number;
  brand?: string | null;
  eventCode?: string | null;
  state: "armed" | "disarmed";
};

export const STANDARD_ARM_DISARM_EVENT_CODES = ["401", "403", "407", "408", "409", "441"] as const;

/** O 701 é Arme por aplicativo somente no protocolo Compatec; em outras marcas
 * pode representar eventos não operacionais e não deve alimentar este indicador. */
export function isArmDisarmStatusEvent(event: Pick<ArmDisarmStatusEvent, "brand"> & { eventCode: string }) {
  const result = classifyContactIdOperationalEvent(event as ArmDisarmStatusEvent);
  return result.kind === "arm" || result.kind === "disarm";
}

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
    if (!event.eventCode) continue;
    const classification = classifyContactIdOperationalEvent(event);
    if (classification.kind !== "arm" && classification.kind !== "disarm") continue;
    const system = systemsById.get(event.alarmSystemId);
    if (!system || system.isActive === false) continue;
    const canonicalAccount = system?.account?.trim() || event.account;
    if (!canonicalAccount || canonicalAccount === "0000") continue;

    statusBySystem.set(event.alarmSystemId, {
      account: canonicalAccount,
      qualifier: event.qualifier,
      receivedAt: event.receivedAt,
      alarmSystemId: event.alarmSystemId,
      brand: event.brand,
      eventCode: event.eventCode,
      state: classification.state as "armed" | "disarmed",
    });
  }

  return Array.from(statusBySystem.values());
}
