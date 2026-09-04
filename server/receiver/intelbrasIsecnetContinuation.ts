export type ConfirmedIntelbrasSystem = {
  id: number;
  account: string;
  brand: string;
};

type Continuation =
  | { kind: "confirmed"; system: ConfirmedIntelbrasSystem; confirmedAt: number }
  | { kind: "ambiguous"; confirmedAt: number };

const CONTINUATION_TTL_MS = 5 * 60 * 1000;
const continuationsByEndpoint = new Map<string, Map<string, Continuation>>();

function normalizeRemoteIp(remoteIp: string) {
  return remoteIp.trim().replace("::ffff:", "");
}

function endpointKey(remoteIp: string, receiverPort: number) {
  return `${normalizeRemoteIp(remoteIp)}:${receiverPort}`;
}

/**
 * Eventos ISECnet podem chegar em conexão TCP diferente do 0x94. A memória
 * temporária existe apenas após identificação por MAC físico e conta, e não
 * permite fallback por IP quando dois painéis com a mesma conta colidem.
 */
export function rememberConfirmedIntelbrasEndpoint(remoteIp: string, receiverPort: number, system: ConfirmedIntelbrasSystem, now = Date.now()) {
  if (system.brand.trim().toUpperCase() !== "INTELBRAS") return;
  const key = endpointKey(remoteIp, receiverPort);
  const continuations = continuationsByEndpoint.get(key) || new Map<string, Continuation>();
  const current = continuations.get(system.account);

  if (current?.kind === "confirmed" && current.system.id !== system.id) {
    continuations.set(system.account, { kind: "ambiguous", confirmedAt: now });
  } else {
    continuations.set(system.account, { kind: "confirmed", system, confirmedAt: now });
  }
  continuationsByEndpoint.set(key, continuations);
}

export function getConfirmedIntelbrasEndpoint(remoteIp: string, receiverPort: number, account: string, now = Date.now()) {
  const key = endpointKey(remoteIp, receiverPort);
  const continuations = continuationsByEndpoint.get(key);
  const current = continuations?.get(account);
  if (!current) return undefined;
  if (now - current.confirmedAt > CONTINUATION_TTL_MS) {
    continuations?.delete(account);
    if (continuations?.size === 0) continuationsByEndpoint.delete(key);
    return undefined;
  }
  return current.kind === "confirmed" ? current.system : undefined;
}

export function clearConfirmedIntelbrasEndpointsForTesting() {
  continuationsByEndpoint.clear();
}
