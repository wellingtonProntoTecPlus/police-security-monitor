import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./_core/env", () => ({ ENV: { cookieSecret: "only-test-dvr-key" } }));
import { createClientDvr, deleteClientDvr, getClientDvr, listClientDvrs, setDbForTesting, updateClientDvr } from "./db";
import { clientDvrs } from "../drizzle/schema";

let records: any[];
let fakeDb: any;
beforeEach(() => {
  vi.stubEnv("DVR_PASSWORD_KEY", "test-only-independent-dvr-key-32-chars");
  records = [];
  const query: any = {
    from: vi.fn((table) => { expect(table).toBe(clientDvrs); return query; }),
    where: vi.fn(() => query),
    orderBy: vi.fn(async () => records.map((record) => ({ ...record }))),
    limit: vi.fn(async () => records.slice(0, 1).map((record) => ({ ...record }))),
  };
  fakeDb = {
    select: vi.fn(() => query),
    insert: vi.fn((table) => {
      expect(table).toBe(clientDvrs);
      return { values: vi.fn(async (values) => {
        const id = records.length + 1;
        records.push({ id, username: "admin", ...values });
        return [{ insertId: id, affectedRows: 1 }];
      }) };
    }),
    update: vi.fn((table) => {
      expect(table).toBe(clientDvrs);
      return { set: vi.fn((values) => ({ where: vi.fn(async () => { Object.assign(records[0], values); return [{ affectedRows: 1 }]; }) })) };
    }),
    delete: vi.fn((table) => {
      expect(table).toBe(clientDvrs);
      return { where: vi.fn(async () => { records = []; return [{ affectedRows: 1 }]; }) };
    }),
  };
  setDbForTesting(fakeDb);
});
afterEach(() => { setDbForTesting(null); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("DVR persistence contract", () => {
  it("stores password encrypted, preserves technical strings, and only decrypts in the allowed projection", async () => {
    const password = " aDM!n password  ";
    const created = await createClientDvr({ clientId: 101, brand: "iNTELBRAS", username: "admin", serialNumber: "AbC123xy", host: "dvr-client.example", password });
    expect(created).toEqual({ id: 1 });
    expect(records[0]).toMatchObject({ username: "admin", serialNumber: "AbC123xy", host: "dvr-client.example" });
    expect(records[0]).not.toHaveProperty("password");
    expect(records[0].encryptedPassword).not.toContain(password);
    expect((await listClientDvrs(101, true))[0]).toMatchObject({ password });
    expect((await listClientDvrs(101, false))[0]).not.toHaveProperty("password");
    expect((await listClientDvrs(101, false))[0]).not.toHaveProperty("encryptedPassword");
    expect(await getClientDvr(1)).not.toHaveProperty("encryptedPassword");
  });

  it("keeps other equipment readable when one stored credential is corrupted", async () => {
    await createClientDvr({ clientId: 101, brand: "Intelbras", password: "secret" });
    await createClientDvr({ clientId: 101, brand: "Hikvision", password: "valid" });
    records[0].encryptedPassword = "invalid-ciphertext";
    const rows = await listClientDvrs(101, true);
    expect(rows[0]).toMatchObject({ brand: "Intelbras", password: "", passwordUnavailable: true });
    expect(rows[1]).toMatchObject({ password: "valid", passwordUnavailable: false });
    expect(rows[0]).not.toHaveProperty("encryptedPassword");
  });

  it("preserves the saved password and parent on a registration-only edit, allowing a new admin password later", async () => {
    await createClientDvr({ clientId: 101, brand: "Intelbras", password: "old-secret" });
    const encrypted = records[0].encryptedPassword;
    await updateClientDvr(1, { model: "MHDX", clientId: 202, password: "" });
    expect(records[0]).toMatchObject({ clientId: 101, model: "MHDX", encryptedPassword: encrypted });
    await updateClientDvr(1, { password: "new-secret", httpPort: 8080 });
    expect(records[0].encryptedPassword).not.toBe(encrypted);
    expect((await listClientDvrs(101, true))[0]).toMatchObject({ password: "new-secret", httpPort: 8080 });
  });

  it("permits several DVRs for a client and deletion affects only DVR storage", async () => {
    await createClientDvr({ clientId: 101, brand: "Intelbras" });
    await createClientDvr({ clientId: 101, brand: "Hikvision" });
    expect(await listClientDvrs(101)).toHaveLength(2);
    expect((await listClientDvrs(101, true))[0]).toMatchObject({ username: "admin", password: "" });
    await deleteClientDvr(1);
    expect(fakeDb.delete).toHaveBeenCalledWith(clientDvrs);
  });

  it("does not claim success without a database", async () => {
    setDbForTesting(null);
    const previousUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(createClientDvr({ clientId: 101, brand: "Intelbras" })).rejects.toThrow("Database not available");
    } finally {
      if (previousUrl !== undefined) process.env.DATABASE_URL = previousUrl;
    }
  });
});
