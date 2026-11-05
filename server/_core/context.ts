import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import * as db from "../db";
import { hashAuthSessionToken } from "./localSession";
import { COOKIE_NAME } from "@shared/const";
import {
  AuthSessionValidationTimeoutError,
  withAuthSessionValidationTimeout,
} from "./authSessionValidation";

function getCookie(req: CreateExpressContextOptions["req"], name: string) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const prefix = `${name}=`;
  const item = cookieHeader.split(";").map(value => value.trim()).find(value => value.startsWith(prefix));
  if (!item) return undefined;
  try {
    return decodeURIComponent(item.slice(prefix.length));
  } catch {
    return undefined;
  }
}

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  authSessionId: number | null;
  authSessionTokenHash: string | null;
  authSessionInvalid: boolean;
  authSessionScheduleDecisionPending?: boolean;
  /** Banco indisponível/lento: não é logout nem sessão substituída. */
  authSessionValidationTimedOut?: boolean;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let authSessionId: number | null = null;
  let authSessionTokenHash: string | null = null;
  let authSessionInvalid = false;
  let authSessionScheduleDecisionPending = false;
  let sessionLookupSuccessful = false;
  let authSessionValidationTimedOut = false;

  const bearer = opts.req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = getCookie(opts.req, COOKIE_NAME) || bearer;
  if (token) {
    authSessionTokenHash = hashAuthSessionToken(token);
    try {
      const activeSession = await withAuthSessionValidationTimeout(
        db.getActiveAuthSessionByTokenHash(authSessionTokenHash),
      );
      sessionLookupSuccessful = true;
      if (activeSession) {
        user = activeSession.user;
        authSessionId = Number(activeSession.sessionId);
        authSessionScheduleDecisionPending = Boolean(activeSession.scheduleDecisionPending);
      }
    } catch (error) {
      // Falha fechada: não aceitar token sem validar sua revogação no banco.
      authSessionValidationTimedOut = error instanceof AuthSessionValidationTimeoutError;
      console.error(authSessionValidationTimedOut
        ? "[Auth] Validação de sessão excedeu o prazo seguro"
        : "[Auth] Falha ao validar sessão ativa");
      user = null;
    }
    if (sessionLookupSuccessful && !user) authSessionInvalid = true;
  }

  // Autenticação de serviço interno para os sweeps do VPS continua separada.
  // Tokens OAuth antigos de usuários não são aceitos como sessão operacional.
  if (!user) {
    try {
      const serviceUser = await sdk.authenticateRequest(opts.req);
      if (serviceUser?.openId?.startsWith("cron_")) user = serviceUser;
    } catch {
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    authSessionId,
    authSessionTokenHash,
    authSessionInvalid,
    authSessionScheduleDecisionPending,
    authSessionValidationTimedOut,
  };
}
