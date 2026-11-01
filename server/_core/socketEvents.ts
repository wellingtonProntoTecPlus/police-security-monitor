export type IncidentStateChangedEvent = {
  kind: "incident_state_changed";
  incidentId: number;
  parentIncidentId?: number | null;
  incidentStatus: "waiting" | "attending" | "observing" | "dispatched" | "maintenance" | "closed";
  operatorId: number | null;
  operatorName: string | null;
  action: "claimed" | "assumed" | "status_changed" | "observing";
  timestamp: string;
};

type EventEmitter = (event: IncidentStateChangedEvent) => void;
let emitEvent: EventEmitter | null = null;

export function setIncidentStateEventEmitter(emitter: EventEmitter | null) {
  emitEvent = emitter;
}

export function emitIncidentStateChanged(event: Omit<IncidentStateChangedEvent, "kind" | "timestamp">) {
  try {
    emitEvent?.({ ...event, kind: "incident_state_changed", timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("[Socket.IO] Falha ao emitir atualização de atendimento", error);
  }
}
