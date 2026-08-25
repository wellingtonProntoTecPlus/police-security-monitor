import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { ENV } from "./_core/env";

const CIPHER_VERSION = "v1";

function getCredentialKey(secret = ENV.cookieSecret) {
  if (!secret) throw new Error("A chave do servidor não está disponível para proteger a credencial técnica");
  return createHash("sha256").update(`police-central:remote-command-credential:${secret}`).digest();
}

/** Cifra uma credencial exclusiva do painel com AES-256-GCM. */
export function encryptRemoteCommandCredential(credential: string, secret?: string) {
  const plainText = credential.trim();
  if (!plainText) throw new Error("Informe a credencial técnica da central");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getCredentialKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [CIPHER_VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

/** Uso restrito ao futuro transporte físico; jamais retornar para a interface. */
export function decryptRemoteCommandCredential(encryptedCredential: string, secret?: string) {
  const [version, ivValue, tagValue, encryptedValue] = encryptedCredential.split(".");
  if (version !== CIPHER_VERSION || !ivValue || !tagValue || !encryptedValue) throw new Error("Formato inválido da credencial técnica protegida");
  const decipher = createDecipheriv("aes-256-gcm", getCredentialKey(secret), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}
