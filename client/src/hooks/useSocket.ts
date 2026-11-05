import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

export interface AlarmEvent {
  id?: number;
  account: string;
  brand: string;
  qualifier: string;
  eventCode: string;
  partition: string;
  zoneUser: string;
  description: string;
  priority: string;
  remoteIp: string;
  receiverPort: number;
  timestamp: string;
  clientId?: number;
  alarmSystemId?: number;
  kind?: "restoration_closed" | "keepalive" | "arm_disarm_confirmation" | "remote_command_confirmation" | "radioenge_observation_escalated" | "alarm_schedule_alert";
  originalEventId?: number;
  incidentId?: number;
  commandId?: number;
  commandType?: string;
  actionLabel?: string;
  alertType?: "missed_arm" | "unexpected_disarm";
  expectedAt?: string | Date;
  detectedAt?: string | Date;
  sourceEventId?: number;
}

export interface IncidentStateUpdate {
  kind: "incident_state_changed";
  incidentId: number;
  parentIncidentId?: number | null;
  incidentStatus: "waiting" | "attending" | "observing" | "dispatched" | "maintenance" | "closed";
  operatorId: number | null;
  operatorName: string | null;
  action: "claimed" | "assumed" | "status_changed" | "observing";
  timestamp: string;
}

export type OperatorShiftNotice =
  | { kind: "shift_reminder"; reminderId: number; userId: number; operatorName: string; shiftCode: "first" | "second" | "third" | "commercial"; minutesBefore: 20 | 40; shiftEndsAt: string | Date }
  | { kind: "shift_message"; messageId: number; userId: number; fromOperatorName: string; toOperatorName: string; incidentId: number | null; account: string | null };

// A single authenticated connection per tab, even when both layout and Dashboard subscribe.
let sharedSocket: Socket | null = null;
let subscribers = 0;
function acquireSocket() {
  if (!sharedSocket) sharedSocket = io(window.location.origin, { path: "/api/socket.io", transports: ["websocket", "polling"] });
  subscribers += 1;
  return sharedSocket;
}
function releaseSocket(socket: Socket) {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers === 0 && sharedSocket === socket) { socket.disconnect(); sharedSocket = null; }
}

export function useSocket(options: { operationalNoticesOnly?: boolean; incidentUpdatesOnly?: boolean; enabled?: boolean } = {}) {
  const enabled = options.enabled !== false;
  const noticesOnly = options.operationalNoticesOnly === true;
  const incidentUpdatesOnly = options.incidentUpdatesOnly === true;
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [realtimeEvents, setRealtimeEvents] = useState<AlarmEvent[]>([]);
  const [incidentUpdates, setIncidentUpdates] = useState<IncidentStateUpdate[]>([]);
  const [operatorNotices, setOperatorNotices] = useState<OperatorShiftNotice[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const socket = acquireSocket();
    socketRef.current = socket;
    setConnected(socket.connected);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onAlarm = (event: AlarmEvent) => setRealtimeEvents((previous) => [event, ...previous].slice(0, 200));
    const onIncident = (event: IncidentStateUpdate) => setIncidentUpdates((previous) => [event, ...previous].slice(0, 100));
    const onNotice = (event: OperatorShiftNotice) => setOperatorNotices((previous) => [...previous.filter((notice) => !(
      notice.kind === event.kind && (notice.kind === "shift_reminder" && event.kind === "shift_reminder" ? notice.reminderId === event.reminderId : notice.kind === "shift_message" && event.kind === "shift_message" && notice.messageId === event.messageId)
    )), event].slice(-100));
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("operator:shift", onNotice);
    if (!noticesOnly) socket.on("alarm:event", onAlarm);
    if (!noticesOnly || incidentUpdatesOnly) socket.on("incident:state", onIncident);
    return () => {
      socket.off("connect", onConnect); socket.off("disconnect", onDisconnect); socket.off("operator:shift", onNotice);
      socket.off("alarm:event", onAlarm); socket.off("incident:state", onIncident);
      releaseSocket(socket); socketRef.current = null;
    };
  }, [enabled, noticesOnly, incidentUpdatesOnly]);

  const clearEvents = useCallback(() => setRealtimeEvents([]), []);
  return { connected, realtimeEvents, incidentUpdates, operatorNotices, clearEvents };
}
