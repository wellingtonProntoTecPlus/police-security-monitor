import "dotenv/config";
import express from "express";
import compression from "compression";
import { createServer } from "http";
import net from "net";
import { Server as SocketIOServer } from "socket.io";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { createSlowRequestLoggingMiddleware } from "./slowRequestLogging";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startReceivers, setEventCallback } from "../receiver/index";
import { expireStaleRemoteCommandDispatches, getActiveAuthSessionByTokenHash, normalizeExistingRegistrationText, sweepAlarmScheduleCompliance, sweepKeepAliveDisconnects } from "../db";
import { sweepOperatorShiftOperations } from "../operatorShiftDb";
import { COOKIE_NAME } from "@shared/const";
import { hashAuthSessionToken } from "./localSession";
import { setAuthSessionRevocationHandler } from "./authSessionRuntime";
import { setIncidentStateEventEmitter } from "./socketEvents";
import { emitOperatorShiftNotice, registerOperatorSocket, setOperatorShiftNoticeEmitter, unregisterOperatorSocket } from "./operatorShiftRuntime";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  app.use(createSlowRequestLoggingMiddleware());
  app.use(compression());
  const server = createServer(app);

  // Socket.IO para eventos em tempo real
  const io = new SocketIOServer(server, {
    cors: { origin: "*" },
    path: "/api/socket.io",
  });

  io.use(async (socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie || "";
    const prefix = `${COOKIE_NAME}=`;
    const value = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
    if (!value) return next(new Error("unauthorized-session"));
    let token = "";
    try { token = decodeURIComponent(value.slice(prefix.length)); } catch { return next(new Error("unauthorized-session")); }
    try {
      const session = await getActiveAuthSessionByTokenHash(hashAuthSessionToken(token));
      if (!session) return next(new Error("unauthorized-session"));
      socket.data.authSessionId = Number(session.sessionId);
      socket.data.authUserId = session.user.id;
      next();
    } catch {
      next(new Error("unauthorized-session"));
    }
  });

  io.on("connection", (socket) => {
    const sessionId = Number(socket.data.authSessionId);
    const userId = Number(socket.data.authUserId);
    socket.join(`auth-session:${sessionId}`);
    socket.join(`operator-user:${userId}`);
    registerOperatorSocket(sessionId);
    console.log(`[Socket.IO] Cliente conectado: ${socket.id}`);
    socket.on("disconnect", () => {
      unregisterOperatorSocket(sessionId);
      console.log(`[Socket.IO] Cliente desconectado: ${socket.id}`);
    });
  });

  setIncidentStateEventEmitter((event) => io.emit("incident:state", event));
  setOperatorShiftNoticeEmitter((notice) => {
    if (notice.kind === "shift_reminder") io.to(`auth-session:${notice.authSessionId}`).emit("operator:shift", notice);
    else io.to(`operator-user:${notice.userId}`).emit("operator:shift", notice);
  });

  setAuthSessionRevocationHandler((sessionIds) => {
    for (const sessionId of sessionIds) io.in(`auth-session:${sessionId}`).disconnectSockets(true);
  });

  // Conectar receptor de eventos ao Socket.IO
  setEventCallback((event) => {
    io.emit("alarm:event", event);
    if (event.kind === "keepalive") {
      console.log(`[Socket.IO] Supervisão emitida: ${event.brand} conta ${event.account}`);
    } else if (event.kind === "remote_command_confirmation") {
      console.log(`[Socket.IO] Comando remoto confirmado: ${event.actionLabel || "ação remota"} | sistema ${event.alarmSystemId} | comando ${event.commandId}`);
    } else if (event.kind === "radioenge_observation_escalated") {
      console.log(`[Socket.IO] Radioenge E361 escalado: conta ${event.account} | incidente ${event.incidentId}`);
    } else {
      console.log(`[Socket.IO] Evento emitido: ${event.brand} conta ${event.account} ${event.qualifier}${event.eventCode}`);
    }
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // A VPS chama este endpoint apenas por loopback a cada minuto. Os sweeps são
  // idempotentes e só criam alertas depois de ultrapassar o prazo configurado.
  app.post("/api/internal/keep-alive-disconnect-sweep", async (req, res) => {
    const remoteAddress = req.socket.remoteAddress || "";
    const isLocal = remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
    if (!isLocal) return res.status(403).json({ error: "loopback-only" });
    try {
      const dispatchesMarkedUnknown = await expireStaleRemoteCommandDispatches(new Date());
      const result = await sweepKeepAliveDisconnects(new Date());
      for (const event of result.opened) {
        io.emit("alarm:event", { ...event, timestamp: event.receivedAt.getTime() });
      }
      const scheduleResult = await sweepAlarmScheduleCompliance(new Date());
      for (const alert of scheduleResult.opened) {
        io.emit("alarm:event", {
          kind: "alarm_schedule_alert",
          ...alert,
          timestamp: new Date().toISOString(),
        });
      }
      const shiftResult = await sweepOperatorShiftOperations(new Date());
      for (const reminder of shiftResult.remindersSent) {
        emitOperatorShiftNotice({ kind: "shift_reminder", ...reminder });
      }
      return res.json({
        ok: true,
        opened: result.opened.length,
        skipped: result.skipped,
        scheduleAlertsOpened: scheduleResult.opened.length,
        scheduleAlertsResolved: scheduleResult.resolved,
        shiftRemindersSent: shiftResult.remindersSent.length,
        expiredOperatorSessionsClosed: shiftResult.sessionsClosed,
        dispatchesMarkedUnknown,
      });
    } catch (error) {
      console.error("[KEEPALIVE] Falha no sweep de desconexão", error);
      return res.status(500).json({ error: error instanceof Error ? error.message : "unknown", timestamp: new Date().toISOString() });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  normalizeExistingRegistrationText()
    .then((updated) => console.log(`[Cadastros] ${updated} registro(s) padronizado(s) para iniciais maiúsculas`))
    .catch((error) => console.warn("[Cadastros] Falha não crítica ao padronizar textos:", error));

  // Iniciar receptores de alarme Contact ID
  try {
    startReceivers();
    console.log("[RECIP] Receptores de alarme iniciados com sucesso");
  } catch (err: any) {
    console.warn("[RECIP] Falha ao iniciar receptores (não-fatal):", err.message);
  }
}

startServer().catch(console.error);
