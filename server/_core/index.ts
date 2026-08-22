import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { Server as SocketIOServer } from "socket.io";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startReceivers, setEventCallback } from "../receiver/index";
import { normalizeExistingRegistrationText, sweepKeepAliveDisconnects } from "../db";

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
  const server = createServer(app);

  // Socket.IO para eventos em tempo real
  const io = new SocketIOServer(server, {
    cors: { origin: "*" },
    path: "/api/socket.io",
  });

  io.on("connection", (socket) => {
    console.log(`[Socket.IO] Cliente conectado: ${socket.id}`);
    socket.on("disconnect", () => {
      console.log(`[Socket.IO] Cliente desconectado: ${socket.id}`);
    });
  });

  // Conectar receptor de eventos ao Socket.IO
  setEventCallback((event) => {
    io.emit("alarm:event", event);
    console.log(`[Socket.IO] Evento emitido: ${event.brand} conta ${event.account} ${event.qualifier}${event.eventCode}`);
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // A VPS chama este endpoint apenas por loopback a cada minuto. O sweep é
  // idempotente e abre uma única ocorrência depois de ultrapassar o prazo.
  app.post("/api/internal/keep-alive-disconnect-sweep", async (req, res) => {
    const remoteAddress = req.socket.remoteAddress || "";
    const isLocal = remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
    if (!isLocal) return res.status(403).json({ error: "loopback-only" });
    try {
      const result = await sweepKeepAliveDisconnects(new Date());
      for (const event of result.opened) {
        io.emit("alarm:event", { ...event, timestamp: event.receivedAt.getTime() });
      }
      return res.json({ ok: true, opened: result.opened.length, skipped: result.skipped });
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
