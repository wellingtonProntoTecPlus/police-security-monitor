import { performance } from "node:perf_hooks";
import type { NextFunction, Request, RequestHandler, Response } from "express";

type SlowRequestLoggerOptions = {
  thresholdMs?: number;
  now?: () => number;
  warn?: (message: string) => void;
};

/** Registra lentidões sem incluir query strings, cookies ou conteúdo de solicitações. */
export function createSlowRequestLoggingMiddleware(
  options: SlowRequestLoggerOptions = {},
): RequestHandler {
  const thresholdMs = options.thresholdMs ?? 1_000;
  const now = options.now ?? (() => performance.now());
  const warn = options.warn ?? ((message) => console.warn(message));

  return (req: Request, res: Response, next: NextFunction) => {
    const path = req.path || "/";
    const shouldMeasure =
      path === "/" || path === "/index.html" ||
      path.startsWith("/assets/") || path.startsWith("/api/trpc/");
    if (!shouldMeasure) return next();

    const startedAt = now();
    res.once("finish", () => {
      const durationMs = Math.max(0, Math.round(now() - startedAt));
      if (durationMs >= thresholdMs) {
        warn(`[HTTP-LENTO] ${req.method} ${path} status=${res.statusCode} duracao_ms=${durationMs}`);
      }
    });
    next();
  };
}
