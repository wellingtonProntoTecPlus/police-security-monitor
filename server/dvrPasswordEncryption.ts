import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CIPHER_VERSION = "v1";

/** Chave própria e estável: rotação de JWT_SECRET não afeta as senhas dos DVRs. */
function getDvrPasswordKey(createIfMissing: boolean, secret?: string) {
  let material = secret || process.env.DVR_PASSWORD_KEY;
  if (!material) {
    const keyFile = process.env.DVR_PASSWORD_KEY_FILE || resolve(process.cwd(), ".dvr-password.key");
    try {
      material = readFileSync(keyFile, "utf8").trim();
    } catch (error: any) {
      if (error.code !== "ENOENT" || !createIfMissing) throw new Error("A chave privada das senhas DVR não está disponível; restaure o backup da chave");
      try {
        // O_EXCL evita sobrescrever a chave já criada por outro processo.
        writeFileSync(keyFile, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" });
      } catch (creationError: any) {
        if (creationError.code !== "EEXIST") throw new Error("Não foi possível criar a chave privada das senhas DVR");
      }
      material = readFileSync(keyFile, "utf8").trim();
    }
    if (!/^[a-f0-9]{64}$/i.test(material)) throw new Error("A chave privada das senhas DVR está inválida; restaure o backup da chave");
  }
  if (!secret && material.length < 32) throw new Error("A chave das senhas DVR deve conter pelo menos 32 caracteres");
  return createHash("sha256").update(`police-central:dvr-password:${material}`).digest();
}

export function encryptDvrPassword(password: string, secret?: string) {
  if (!password.trim()) throw new Error("Informe a senha do DVR");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getDvrPasswordKey(true, secret), iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [CIPHER_VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptDvrPassword(encryptedPassword: string, secret?: string) {
  const [version, ivValue, tagValue, encryptedValue] = encryptedPassword.split(".");
  if (version !== CIPHER_VERSION || !ivValue || !tagValue || !encryptedValue) throw new Error("Formato inválido da senha DVR protegida");
  const decipher = createDecipheriv("aes-256-gcm", getDvrPasswordKey(false, secret), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}
