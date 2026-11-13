import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { getClientProcedureTreatment, listClientProcedures, updateClientProcedure, setDbForTesting } from "./db";
const socket = process.env.POLICE_SHIFT_TEST_SOCKET;
const enabled = Boolean(socket?.startsWith("/tmp/police-shift-db/") && existsSync(socket));
const database = `police_procedure_test_${process.pid}`;
const tables = ["alarm_systems", "alarm_events", "alarm_schedule_alerts", "client_procedures"];
let pool: mysql.Pool;
const upgrade = readFileSync(new URL("../deploy/upgrade_vps.sql", import.meta.url), "utf8");
const migration = upgrade.slice(upgrade.indexOf("-- Tipo de protocolo de atendimento;"), upgrade.indexOf("-- Ficha cadastral de DVRs"));
function legacyDDL() {
  const snapshot = JSON.parse(readFileSync(new URL("../drizzle/meta/0050_snapshot.json", import.meta.url), "utf8"));
  return tables.map(name => {
    const table = snapshot.tables[name];
    const columns = Object.values(table.columns).map((column: any) => {
      let value = `\`${column.name}\` ${column.type}${column.notNull ? " NOT NULL" : " NULL"}${column.autoincrement ? " AUTO_INCREMENT" : ""}`;
      if (Object.hasOwn(column, "default")) value += ` DEFAULT ${typeof column.default === "boolean" ? Number(column.default) : column.default}`;
      return value;
    });
    for (const key of Object.values(table.compositePrimaryKeys) as any[]) columns.push(`PRIMARY KEY (${key.columns.map((column: string) => `\`${column}\``).join(",")})`);
    return `CREATE TABLE \`${name}\` (${columns.join(",")})`;
  }).join(";\n");
}
describe.skipIf(!enabled)("client protocols · private MariaDB only", () => {
  beforeAll(async () => {
    const root = await mysql.createConnection({ socketPath: socket, user: "root" });
    await root.query(`CREATE DATABASE \`${database}\``); await root.end();
    pool = mysql.createPool({ socketPath: socket, user: "root", database, connectionLimit: 3, multipleStatements: true });
    await pool.query(legacyDDL());
    // Um registro legado deve sobreviver à adição e à reaplicação.
    await pool.query("INSERT INTO client_procedures (clientId,title,description) VALUES (99,'Legado','Orientacao existente')");
    await pool.query(migration); await pool.query(migration);
    const [legacy] = await pool.query<any[]>("SELECT procedureType,description FROM client_procedures WHERE clientId = 99");
    expect(legacy[0]).toMatchObject({ procedureType: "general", description: "Orientacao existente" });
    setDbForTesting(drizzle(pool));
  });
  beforeEach(async () => {
    for (const table of [...tables].reverse()) await pool.query(`DELETE FROM \`${table}\``);
    await pool.query("INSERT INTO alarm_systems (id,clientId,account,brand) VALUES (10,1,'0001','JFL'),(20,2,'0002','JFL')");
    await pool.query("INSERT INTO alarm_events (id,alarmSystemId,account,brand,qualifier,eventCode,description) VALUES (101,10,'0001','JFL','E','130','Disparo'),(102,10,'0001','JFL','E','120','Panico'),(103,10,'0001','JFL','E','KOFF','Painel desconectado'),(104,10,'0001','JFL','E','401','Desarmado'),(105,10,'0001','JFL','R','401','Armado'),(106,10,'0001','JFL','R','130','Restauracao'),(201,20,'0002','JFL','E','130','Outro cliente')");
    await pool.query("INSERT INTO client_procedures (id,clientId,title,description,procedureType,isActive) VALUES (1,1,'Geral','Instrucao geral','general',1),(2,1,'Disparo','Instrucao disparo','alarm',1),(3,1,'Panico','Instrucao panico','panic',1),(4,1,'Falhas','Instrucao falhas','system_problem',1),(5,1,'Desarme fora','Instrucao desarme','outside_schedule_disarm',1),(6,1,'Antigo','Nao mostrar','alarm',0),(7,2,'Privado','Outra carteira','alarm',1)");
  });
  afterAll(async () => { setDbForTesting(null); if (pool) { await pool.query(`DROP DATABASE \`${database}\``); await pool.end(); } });
  it("returns only active specific plus general instructions from the same client, without creating events", async () => {
    const result = await getClientProcedureTreatment(1,101);
    expect(result.eventType).toBe("alarm"); expect(result.procedures.map(row => row.id)).toEqual([2,1]);
    expect(result.hasSpecificProcedure).toBe(true);
    const [count] = await pool.query<any[]>("SELECT COUNT(*) AS n FROM alarm_events"); expect(count[0].n).toBe(7);
  });
  it("distinguishes panic and KOFF problems from regular alarms", async () => {
    expect((await getClientProcedureTreatment(1,102)).procedures.map(row => row.id)).toEqual([3,1]);
    expect((await getClientProcedureTreatment(1,103)).procedures.map(row => row.id)).toEqual([4,1]);
  });
  it("does not label normal disarm or arm as outside-hours without a matching persisted schedule violation", async () => {
    expect((await getClientProcedureTreatment(1,104)).eventType).toBe("general");
    expect((await getClientProcedureTreatment(1,105)).eventType).toBe("general");
    await pool.query("INSERT INTO alarm_schedule_alerts (alarmSystemId,sourceEventId,alertType,dedupeKey,alertDate,status) VALUES (10,104,'unexpected_disarm','test-violation','2026-11-13','acknowledged')");
    expect((await getClientProcedureTreatment(1,104)).procedures.map(row => row.id)).toEqual([5,1]);
    expect((await getClientProcedureTreatment(1,105)).eventType).toBe("general");
  });
  it("rejects an event from another customer and never returns its protocol", async () => {
    await expect(getClientProcedureTreatment(1,201)).rejects.toThrow("não pertence");
  });
  it("keeps an inactivated instruction persisted but removes it from the operator's applicable instructions", async () => {
    await updateClientProcedure(2,1,{ isActive:false });
    expect((await listClientProcedures(1)).find(row => row.id === 2)?.isActive).toBe(false);
    expect((await getClientProcedureTreatment(1,101)).hasSpecificProcedure).toBe(false);
    expect((await getClientProcedureTreatment(1,101)).procedures.map(row => row.id)).toEqual([1]);
  });
  it("does not treat alarm restoration as another alarm or panic", async () => {
    expect((await getClientProcedureTreatment(1,106)).procedures.map(row => row.id)).toEqual([1]);
  });
});
