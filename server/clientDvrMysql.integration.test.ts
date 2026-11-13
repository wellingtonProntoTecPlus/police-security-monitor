import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { readFileSync, existsSync } from "node:fs";
vi.mock("./_core/env", () => ({ ENV: { cookieSecret: "private-dvr-integration-key" } }));
import { createClientDvr, deleteClient, deleteClientDvr, getClientDvr, listClientDvrs, setDbForTesting, updateClientDvr } from "./db";

// Explicitly opt-in to a disposable private Unix socket. Never uses DATABASE_URL.
const socket = process.env.POLICE_DVR_TEST_SOCKET;
const enabled = Boolean(socket?.startsWith("/tmp/police-dvr-db/") && existsSync(socket));
const database = `police_dvr_test_${process.pid}`;
const upgrade = readFileSync(new URL("../deploy/upgrade_vps.sql", import.meta.url), "utf8");
const migration = upgrade.slice(upgrade.lastIndexOf("CREATE TABLE IF NOT EXISTS client_dvrs ("));
let pool: mysql.Pool;

function parentTablesDDL() {
  const snapshot = JSON.parse(readFileSync(new URL("../drizzle/meta/0050_snapshot.json", import.meta.url), "utf8"));
  return ["clients", "alarm_systems", "registration_documents"].map((name) => {
    const table = snapshot.tables[name];
    const columns = Object.values(table.columns).map((column: any) => {
      let value = `\`${column.name}\` ${column.type}${column.notNull ? " NOT NULL" : " NULL"}${column.autoincrement ? " AUTO_INCREMENT" : ""}`;
      if (Object.hasOwn(column, "default")) value += ` DEFAULT ${typeof column.default === "boolean" ? Number(column.default) : column.default}`;
      return value;
    });
    for (const key of Object.values(table.compositePrimaryKeys) as any[]) columns.push(`PRIMARY KEY (${key.columns.map((col: string) => `\`${col}\``).join(",")})`);
    return `CREATE TABLE \`${name}\` (${columns.join(",")})`;
  }).join(";\n");
}

const suite = enabled ? describe : describe.skip;
suite("DVR private MariaDB integration", () => {
  beforeAll(async () => {
    vi.stubEnv("DVR_PASSWORD_KEY", "private-dvr-test-key-independent-of-jwt");
    const root = await mysql.createConnection({ socketPath: socket!, user: "root" });
    await root.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
    await root.end();
    pool = mysql.createPool({ socketPath: socket!, user: "root", database, connectionLimit: 2, multipleStatements: true });
    await pool.query(migration);
    await pool.query(parentTablesDDL());
    setDbForTesting(drizzle(pool));
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM client_dvrs");
  });

  afterAll(async () => {
    setDbForTesting(null);
    if (pool) { await pool.query(`DROP DATABASE \`${database}\``); await pool.end(); }
    vi.unstubAllEnvs();
  });

  it("persists several DVRs for a client, keeps exact technical data and never returns another client's DVR", async () => {
    await createClientDvr({ clientId: 101, brand: "Intelbras", serialNumber: "AbCd123", host: "myDVR.example", tcpPort: 37777, udpPort: 37778, httpPort: 80, rtspPort: 554, httpsPort: 443, serverPort: 8000 });
    await createClientDvr({ clientId: 101, brand: "Hikvision", username: "AdminCase" });
    await createClientDvr({ clientId: 202, brand: "Outra empresa" });
    const rows = await listClientDvrs(101, false);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ clientId: 101, serialNumber: "AbCd123", host: "myDVR.example", username: "admin", tcpPort: 37777, udpPort: 37778, httpPort: 80, rtspPort: 554, httpsPort: 443, serverPort: 8000 });
    expect(rows[1]).toMatchObject({ username: "AdminCase" });
    expect(rows.every((row) => row.clientId === 101)).toBe(true);
  });

  it("stores authenticated ciphertext and returns readable password only in an explicitly permitted projection", async () => {
    const password = " aDM!n private-password  ";
    const created = await createClientDvr({ clientId: 101, brand: "Intelbras", password });
    const [stored] = await pool.query<any[]>("SELECT encryptedPassword FROM client_dvrs WHERE id = ?", [created.id]);
    expect(stored[0].encryptedPassword).toMatch(/^v1\./);
    expect(stored[0].encryptedPassword).not.toContain(password);
    expect((await listClientDvrs(101, true))[0]).toMatchObject({ password });
    expect((await listClientDvrs(101, false))[0]).not.toHaveProperty("password");
    expect((await listClientDvrs(101, false))[0]).not.toHaveProperty("encryptedPassword");
    expect(await getClientDvr(created.id)).not.toHaveProperty("encryptedPassword");
  });

  it("preserves password and owner during registration-only editing, then permits replacing the credential", async () => {
    const created = await createClientDvr({ clientId: 101, brand: "Intelbras", password: "old-password" });
    await updateClientDvr(created.id, { model: "MHDX", clientId: 202, password: "" });
    expect((await listClientDvrs(101, true))[0]).toMatchObject({ model: "MHDX", clientId: 101, password: "old-password" });
    await updateClientDvr(created.id, { password: "new-password", httpPort: 8080 });
    expect((await listClientDvrs(101, true))[0]).toMatchObject({ password: "new-password", httpPort: 8080 });
  });

  it("deletes only the identified DVR and preserves other DVRs for that client", async () => {
    const first = await createClientDvr({ clientId: 101, brand: "Intelbras" });
    const second = await createClientDvr({ clientId: 101, brand: "Hikvision" });
    await deleteClientDvr(first.id);
    expect(await getClientDvr(first.id)).toBeUndefined();
    expect(await listClientDvrs(101)).toMatchObject([{ id: second.id, brand: "Hikvision" }]);
  });

  it("discards DVR passwords in the same transaction as customer deletion, preserving other customers", async () => {
    await pool.query("INSERT INTO clients (id, partnerCompanyId, type, name) VALUES (101, 1, 'pj', 'Cliente ficticio')");
    const own = await createClientDvr({ clientId: 101, brand: "Intelbras", password: "removed-with-customer" });
    const other = await createClientDvr({ clientId: 202, brand: "Hikvision", password: "other-customer-kept" });
    await deleteClient(101);
    expect(await getClientDvr(own.id)).toBeUndefined();
    expect((await listClientDvrs(202, true))[0]).toMatchObject({ id: other.id, password: "other-customer-kept" });
    const [removed] = await pool.query<any[]>("SELECT id FROM clients WHERE id = 101");
    expect(removed).toHaveLength(0);
  });

  it("reapplies the VPS migration without deleting records or indexes", async () => {
    const created = await createClientDvr({ clientId: 101, brand: "Intelbras", password: "kept-password" });
    await pool.query(migration);
    await pool.query(migration);
    expect((await listClientDvrs(101, true))[0]).toMatchObject({ id: created.id, password: "kept-password" });
    const [indexes] = await pool.query<any[]>("SHOW INDEX FROM client_dvrs");
    expect(indexes.map((index) => index.Key_name)).toEqual(expect.arrayContaining(["PRIMARY", "client_dvrs_client_idx", "client_dvrs_serial_idx"]));
  });
});
