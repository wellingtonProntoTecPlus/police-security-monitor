export const INITIAL_KEEP_ALIVE_GRACE_MS = 10 * 60 * 1000;
export const MINIMUM_KEEP_ALIVE_CUTOFF_MS = 90 * 1000;

/**
 * Define uma janela de expiração por central, usando os intervalos que ela
 * efetivamente transmitiu. A média multiplicada por três cobre atrasos comuns;
 * 1,5 vez o maior intervalo protege reconexões pontuais sem tornar o Offline
 * excessivamente lento.
 */
export function calculateKeepAliveCutoffMs(intervals: Array<number | null | undefined>) {
  const validIntervals = intervals.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  if (validIntervals.length === 0) return INITIAL_KEEP_ALIVE_GRACE_MS;

  const average = validIntervals.reduce((total, value) => total + value, 0) / validIntervals.length;
  const maximum = Math.max(...validIntervals);
  return Math.round(Math.max(
    MINIMUM_KEEP_ALIVE_CUTOFF_MS,
    average * 3,
    maximum * 1.5,
  ));
}

export function getKeepAliveConnectionStatus(input: {
  lastKeepAliveAt?: Date | null;
  intervals?: Array<number | null | undefined>;
  now?: Date;
}) {
  const cutoffMs = calculateKeepAliveCutoffMs(input.intervals || []);
  const lastKeepAliveAt = input.lastKeepAliveAt;
  if (!lastKeepAliveAt || Number.isNaN(lastKeepAliveAt.getTime())) {
    return { connectionStatus: "offline" as const, cutoffMs };
  }

  const elapsedMs = (input.now || new Date()).getTime() - lastKeepAliveAt.getTime();
  return {
    connectionStatus: elapsedMs <= cutoffMs ? "online" as const : "offline" as const,
    cutoffMs,
  };
}
