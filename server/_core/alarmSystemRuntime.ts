export type AlarmSystemsRetiredListener = (systemIds: number[]) => void;

type Cleanup = () => void;

const listeners = new Set<AlarmSystemsRetiredListener>();

/**
 * Registra um listener local para invalidar estado volátil de centrais aposentadas.
 * O cleanup é idempotente e não afeta os demais listeners.
 */
export function onAlarmSystemsRetired(listener: AlarmSystemsRetiredListener): Cleanup {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Notifica os caches locais depois que a aposentadoria foi persistida.
 * Cada callback é isolado para que uma falha local não interrompa os demais.
 */
export function notifyAlarmSystemsRetired(systemIds: number[]) {
  if (systemIds.length === 0) return;

  for (const listener of Array.from(listeners)) {
    try {
      listener([...systemIds]);
    } catch (error) {
      console.error("[AlarmSystem] Não foi possível invalidar caches de centrais aposentadas", error);
    }
  }
}
