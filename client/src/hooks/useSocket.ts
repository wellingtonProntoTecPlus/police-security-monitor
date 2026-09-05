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
  kind?: "restoration_closed" | "keepalive" | "arm_disarm_confirmation";
  originalEventId?: number;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [realtimeEvents, setRealtimeEvents] = useState<AlarmEvent[]>([]);

  useEffect(() => {
    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      console.log("[Socket.IO] Conectado ao servidor");
    });

    socket.on("disconnect", () => {
      setConnected(false);
      console.log("[Socket.IO] Desconectado do servidor");
    });

    socket.on("alarm:event", (event: AlarmEvent) => {
      setRealtimeEvents((prev) => [event, ...prev].slice(0, 200));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const clearEvents = useCallback(() => {
    setRealtimeEvents([]);
  }, []);

  return { connected, realtimeEvents, clearEvents };
}
