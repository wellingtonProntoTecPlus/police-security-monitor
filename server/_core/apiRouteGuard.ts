import type { NextFunction, Request, Response } from "express";

const API_NOT_FOUND_MESSAGE = "API route not found";

/**
 * Identifica URLs de API sem confundir caminhos comuns da SPA como /apix.
 * O valor recebido é originalUrl porque o Express pode reescrever req.path
 * quando um middleware é montado com app.use("*").
 */
export function isApiRequestUrl(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0] || url;
  return path === "/api" || path.startsWith("/api/");
}

/**
 * Nunca entrega index.html para uma URL de API desconhecida.
 * Rotas conhecidas são encerradas pelos middlewares registrados antes deste.
 */
export function rejectApiFallback(
  req: Pick<Request, "originalUrl">,
  res: Response,
  next: NextFunction,
) {
  if (!isApiRequestUrl(req.originalUrl)) {
    next();
    return;
  }

  res.status(404).json({ error: API_NOT_FOUND_MESSAGE });
}
