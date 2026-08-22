export type ConfirmedJflSystem = {
  id: number;
  account: string;
  brand: string;
};

const CONTINUATION_TTL_MS = 15 * 60 * 1000;
const confirmedJflSystemsByEndpoint = new Map<string, ConfirmedJflSystem & { confirmedAt: number }>();

function normalizeRemoteIp(remoteIp: string) {
  return remoteIp.trim().replace("::ffff:", "");
}

function endpointKey(remoteIp: string, receiverPort: number) {
  return `${normalizeRemoteIp(remoteIp)}:${receiverPort}`;
}

/**
 * Um 0x40 JFL não carrega serial, MAC ou IMEI. Esta memória temporária só é
 * preenchida após uma conexão 0x21 do mesmo IP e porta ter sido identificada
 * por identificador único. Não há cadastro, busca ou fallback por conta/IP.
 */
export function rememberConfirmedJflEndpoint(remoteIp: string, receiverPort: number, system: ConfirmedJflSystem, now = Date.now()) {
  if (system.brand.trim().toUpperCase() !== "JFL") return;
  confirmedJflSystemsByEndpoint.set(endpointKey(remoteIp, receiverPort), { ...system, confirmedAt: now });
}

export function getConfirmedJflEndpoint(remoteIp: string, receiverPort: number, now = Date.now()) {
  const key = endpointKey(remoteIp, receiverPort);
  const confirmed = confirmedJflSystemsByEndpoint.get(key);
  if (!confirmed) return undefined;
  if (now - confirmed.confirmedAt > CONTINUATION_TTL_MS) {
    confirmedJflSystemsByEndpoint.delete(key);
    return undefined;
  }
  return confirmed;
}

export function refreshConfirmedJflEndpoint(remoteIp: string, receiverPort: number, now = Date.now()) {
  const confirmed = getConfirmedJflEndpoint(remoteIp, receiverPort, now);
  if (!confirmed) return undefined;
  confirmedJflSystemsByEndpoint.set(endpointKey(remoteIp, receiverPort), { ...confirmed, confirmedAt: now });
  return confirmed;
}

export function clearConfirmedJflEndpointsForTesting() {
  confirmedJflSystemsByEndpoint.clear();
}
