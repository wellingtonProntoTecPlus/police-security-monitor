import { createHash, randomBytes } from "node:crypto";

export const AUTH_SESSION_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

/** Segredo opaco para cookie HttpOnly; o token bruto não é persistido. */
export function createAuthSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash unidirecional usado como identificador consultável da sessão. */
export function hashAuthSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
