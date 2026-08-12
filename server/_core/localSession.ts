import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_TYPE = "police-central-local";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

type LocalSessionPayload = {
  type: typeof SESSION_TYPE;
  userId: number;
  openId: string;
  expiresAt: number;
};

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET não configurado para a sessão local");
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createLocalSessionToken(user: { id: number; openId: string }) {
  const encodedPayload = Buffer.from(JSON.stringify({
    type: SESSION_TYPE,
    userId: user.id,
    openId: user.openId,
    expiresAt: Date.now() + ONE_YEAR_MS,
  } satisfies LocalSessionPayload)).toString("base64url");

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyLocalSessionToken(token: string | undefined): LocalSessionPayload | null {
  if (!token) return null;
  const [encodedPayload, receivedSignature, ...extra] = token.split(".");
  if (!encodedPayload || !receivedSignature || extra.length > 0) return null;

  try {
    const expectedSignature = sign(encodedPayload);
    const received = Buffer.from(receivedSignature, "base64url");
    const expected = Buffer.from(expectedSignature, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as LocalSessionPayload;
    if (payload.type !== SESSION_TYPE || !Number.isInteger(payload.userId) || !payload.openId || payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
