export type RestorationWaitConfiguration = {
  qualifier?: string | null;
  fechaComRestauracao?: number | boolean | null;
  tempoEsperaSegundos?: number | null;
};

/** Retorna apenas prazos positivos configurados para falhas E que aguardam restauração. */
export function getConfiguredRestorationWaitSeconds(config: RestorationWaitConfiguration) {
  if (config.qualifier?.trim().toUpperCase() !== "E" || !config.fechaComRestauracao) return 0;
  const seconds = Number(config.tempoEsperaSegundos || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(Math.floor(seconds), 7 * 24 * 60 * 60);
}

export function getRestorationWaitUntil(receivedAt: Date, waitSeconds: number) {
  if (!Number.isFinite(waitSeconds) || waitSeconds <= 0) return null;
  return new Date(receivedAt.getTime() + Math.floor(waitSeconds) * 1000);
}

export function isRestorationWaitExpired(waitUntil: Date | null | undefined, now = new Date()) {
  return Boolean(waitUntil && waitUntil.getTime() <= now.getTime());
}
