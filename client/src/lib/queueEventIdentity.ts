export type QueueIdentityEvent = {
  account?: string | null;
  brand?: string | null;
  alarmSystemId?: number | null;
  incidentSystemId?: number | null;
  clientId?: number | null;
  incidentClientId?: number | null;
};

type SystemIdentity = {
  id: number;
  account?: string | null;
  brand?: string | null;
  clientId?: number | null;
};

type ClientIdentity = {
  id: number;
};

function normalizeIdentity(value?: string | null) {
  return (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function numericIdentifier(value?: number | null) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}

/**
 * Resolve a central usando primeiro os IDs persistidos no evento/incidente.
 * Uma conta Contact ID repetida nunca pode selecionar o primeiro sistema da
 * lista: sem ID e sem candidato único, não há sistema resolvido.
 */
export function resolveQueueEventSystem<T extends SystemIdentity>(event: QueueIdentityEvent, systems: readonly T[]): T | null {
  const persistedSystemId = numericIdentifier(event.alarmSystemId) ?? numericIdentifier(event.incidentSystemId);
  if (persistedSystemId) return systems.find((system) => system.id === persistedSystemId) || null;

  const account = normalizeIdentity(event.account);
  if (!account) return null;
  const brand = normalizeIdentity(event.brand);
  const eventClientId = numericIdentifier(event.clientId) ?? numericIdentifier(event.incidentClientId);
  const accountCandidates = systems.filter((system) => {
    if (normalizeIdentity(system.account) !== account) return false;
    return !brand || normalizeIdentity(system.brand) === brand;
  });

  if (eventClientId) {
    const clientCandidates = accountCandidates.filter((system) => system.clientId === eventClientId);
    return clientCandidates.length === 1 ? clientCandidates[0] : null;
  }
  return accountCandidates.length === 1 ? accountCandidates[0] : null;
}

/** A identificação persistida do evento tem precedência sobre qualquer aproximação visual. */
export function resolveQueueEventClient<T extends ClientIdentity>(event: QueueIdentityEvent, system: SystemIdentity | null, clients: readonly T[]): T | null {
  const clientId = numericIdentifier(event.clientId)
    ?? numericIdentifier(event.incidentClientId)
    ?? numericIdentifier(system?.clientId);
  return clientId ? clients.find((client) => client.id === clientId) || null : null;
}
