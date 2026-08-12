import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import * as db from "../db";
import { verifyLocalSessionToken } from "./localSession";
import { COOKIE_NAME } from "@shared/const";

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
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (!user) {
    const session = verifyLocalSessionToken(getCookie(opts.req, COOKIE_NAME));
    if (session) user = await db.getUserById(session.userId) ?? null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
