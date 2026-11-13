import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { encryptDvrPassword, decryptDvrPassword } from "./dvrPasswordEncryption";
let dir: string;
let keyFile: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "private-dvr-key-"));
  keyFile = join(dir, "dvr.key");
  vi.stubEnv("DVR_PASSWORD_KEY", "");
  vi.stubEnv("DVR_PASSWORD_KEY_FILE", keyFile);
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });

describe("DVR independent private key lifecycle", () => {
  it("creates a private key once and preserves passwords when JWT_SECRET changes", () => {
    vi.stubEnv("JWT_SECRET", "old-session-secret");
    const cipher = encryptDvrPassword("DVR credential");
    const material = readFileSync(keyFile, "utf8");
    expect(material).toMatch(/^[a-f0-9]{64}$/);
    expect(statSync(keyFile).mode & 0o777).toBe(0o600);
    vi.stubEnv("JWT_SECRET", "new-session-secret");
    expect(decryptDvrPassword(cipher)).toBe("DVR credential");
    encryptDvrPassword("Another credential");
    expect(readFileSync(keyFile, "utf8")).toBe(material);
  });

  it("does not silently regenerate a missing key on decryption and can recover from its backup", () => {
    const cipher = encryptDvrPassword("kept-password");
    const backup = readFileSync(keyFile, "utf8");
    unlinkSync(keyFile);
    expect(() => decryptDvrPassword(cipher)).toThrow("restaure o backup");
    expect(existsSync(keyFile)).toBe(false);
    writeFileSync(keyFile, backup, { mode: 0o600 });
    expect(decryptDvrPassword(cipher)).toBe("kept-password");
  });

  it("rejects malformed private keys without overwriting them", () => {
    writeFileSync(keyFile, "invalid-key", { mode: 0o600 });
    expect(() => encryptDvrPassword("password")).toThrow("inválida");
    expect(readFileSync(keyFile, "utf8")).toBe("invalid-key");
  });
});
