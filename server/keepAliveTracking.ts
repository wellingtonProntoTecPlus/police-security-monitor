export type KeepAliveMeasurement = {
  receivedAt: Date;
  previousAt: Date | null;
  intervalMs: number | null;
};

export function measureKeepAlive(previousAt: Date | null | undefined, receivedAt = new Date()): KeepAliveMeasurement {
  const previous = previousAt ?? null;
  return {
    receivedAt,
    previousAt: previous,
    intervalMs: previous ? Math.max(0, receivedAt.getTime() - previous.getTime()) : null,
  };
}

export function formatKeepAliveInterval(intervalMs: number | null) {
  if (intervalMs === null) return "primeiro Keep Alive observado";
  return `${(intervalMs / 1000).toFixed(1)}s desde o Keep Alive anterior`;
}
