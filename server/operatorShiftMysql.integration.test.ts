import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import { setDbForTesting, replaceActiveAuthSession, transitionIncidentForOperator } from "./db";
import { endOperatorSessionWithHandoff, listOperatorShiftInbox, markOperatorShiftMessageRead, sendOperatorShiftMessage, sweepOperatorShiftOperations, createOperatorShiftExceptionSwap, getOperatorShiftReport } from "./operatorShiftDb";
import { saveOperatorShiftAssignmentWithTransaction } from "./operatorShiftPersistence";
import { getUserShiftAttendanceWindow } from "./operatorShiftSchedule";
import { authSessions, incidents, incidentHistory, operatorAttendanceRecords, operatorShiftMessages, operatorShiftReminders, operatorShiftAssignments, operatorShiftExceptions } from "../drizzle/schema";

// Explicit opt-in, Unix socket only. Never reads DATABASE_URL or connects to a VPS.
const socket = process.env.POLICE_SHIFT_TEST_SOCKET;
const localEnabled = Boolean(socket?.startsWith("/tmp/police-shift-db/") && fs.existsSync(socket));
const now = new Date("2026-11-04T15:20:00Z");
const until = new Date("2026-11-04T16:30:00Z");
let pool: mysql.Pool;
let orm: ReturnType<typeof drizzle>;
const database = `police_shift_test_${process.pid}`;
const TABLES = ["users", "auth_sessions", "alarm_events", "incidents", "incident_history", "operator_attendance_records", "operator_shift_assignments", "operator_shift_exceptions", "operator_shift_messages", "operator_shift_reminders"];

function snapshotDDL() {
  const snapshot = JSON.parse(fs.readFileSync(new URL("../drizzle/meta/0044_snapshot.json", import.meta.url), "utf8"));
  return TABLES.map((name) => {
    const table = snapshot.tables[name];
    const columns = Object.values(table.columns).map((column: any) => {
      let value = `\`${column.name}\` ${column.type}${column.notNull ? " NOT NULL" : " NULL"}${column.autoincrement ? " AUTO_INCREMENT" : ""}`;
      if (Object.hasOwn(column, "default")) value += ` DEFAULT ${typeof column.default === "boolean" ? Number(column.default) : column.default}`;
      return value;
    });
    for (const key of Object.values(table.compositePrimaryKeys) as any[]) columns.push(`PRIMARY KEY (${key.columns.map((col: string) => `\`${col}\``).join(",")})`);
    for (const key of Object.values(table.uniqueConstraints) as any[]) columns.push(`UNIQUE KEY \`${key.name}\` (${key.columns.map((col: string) => `\`${col}\``).join(",")})`);
    for (const key of Object.values(table.indexes) as any[]) columns.push(`${key.isUnique ? "UNIQUE " : ""}KEY \`${key.name}\` (${key.columns.map((col: string) => `\`${col}\``).join(",")})`);
    return `CREATE TABLE \`${name}\` (${columns.join(",")}) ENGINE=InnoDB`;
  }).join(";\n");
}
async function fixture() {
  await pool.query("INSERT INTO users (id,openId,name,role) VALUES (1,'test-amanda','Amanda','operator'),(2,'test-yasmin','Yasmin','operator'),(3,'test-stephane','Stephane','operator'),(4,'test-partner','Parceiro','partner')");
  await orm.insert(authSessions).values({ id: 101, userId: 1, tokenHash: "a".repeat(64), createdAt: new Date("2026-11-04T09:50:00Z"), expiresAt: new Date("2027-01-01T00:00:00Z") });
  await orm.insert(operatorAttendanceRecords).values({ id: 201, authSessionId: 101, userId: 1, operatorName: "Amanda", role: "operator", loginAt: new Date("2026-11-04T09:50:00Z"), shiftCode: "first", workDate: "2026-11-04", scheduledStartAt: new Date("2026-11-04T10:00:00Z"), scheduledEndAt: new Date("2026-11-04T16:00:00Z") });
  await pool.query("INSERT INTO alarm_events (id,account,brand,eventCode,qualifier,description) VALUES (301,'TEST-001','COMPATEC','130','E','Alarme fictício de teste')");
  await orm.insert(incidents).values({ id: 401, eventId: 301, operatorId: 1, status: "attending", notes: "Anotação anterior preservada", version: 1 });
}
const handoff = { incidentId: 401, toUserId: 2, message: "Cliente de teste está sem energia; aguarda retorno.", observationUntil: until };
const logoff = (handoffs: any[] = [handoff]) => endOperatorSessionWithHandoff({ userId: 1, authSessionId: 101, operatorName: "Amanda", handoffs, now });

// These tests are intentionally not runnable against a network database.
describe.skipIf(!localEnabled)("escala e passagem · MariaDB isolado real", () => {
  beforeAll(async () => {
    const admin = await mysql.createConnection({ socketPath: socket, user: "root", multipleStatements: true });
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
    await admin.end();
    pool = mysql.createPool({ socketPath: socket, user: "root", database, connectionLimit: 4, timezone: "Z", multipleStatements: true });
    await pool.query(snapshotDDL());
    orm = drizzle(pool);
    setDbForTesting(orm);
  });
  beforeEach(async () => { for (const table of [...TABLES].reverse()) await pool.query(`DELETE FROM \`${table}\``); await fixture(); });
  afterAll(async () => {
    setDbForTesting(null);
    if (pool) { await pool.query(`DROP DATABASE \`${database}\``); await pool.end(); }
  });

  it("grava logoff real, preserva o mesmo incidente e envia a mensagem somente ao destinatário", async () => {
    const result = await logoff();
    expect(result.messages).toHaveLength(1);
    const [incident] = await orm.select().from(incidents);
    expect(incident).toMatchObject({ id: 401, operatorId: 1, status: "observing", version: 2 });
    expect(incident.notes).toContain("Anotação anterior preservada");
    expect(incident.notes).toContain("para Yasmin");
    const [attendance] = await orm.select().from(operatorAttendanceRecords);
    expect(attendance.logoutAt?.toISOString()).toBe(now.toISOString());
    expect(attendance.logoutReason).toBe("logout");
    expect((await orm.select().from(authSessions))[0].revokedAt).not.toBeNull();
    await expect(transitionIncidentForOperator({ incidentId: 401, operatorId: 1, operatorName: "Amanda", authSessionId: 101, status: "attending" })).rejects.toThrow("encerrada ou substituída");
    expect((await orm.select().from(incidentHistory))[0]).toMatchObject({ incidentId: 401, action: "shift_handoff", operatorName: "Amanda" });
    expect(await listOperatorShiftInbox(3)).toHaveLength(0);
    const inbox = await listOperatorShiftInbox(2);
    expect(inbox).toHaveLength(1);
    await expect(markOperatorShiftMessageRead({ messageId: inbox[0].id, userId: 3 })).rejects.toThrow();
    expect(await listOperatorShiftInbox(2)).toHaveLength(1);
    await markOperatorShiftMessageRead({ messageId: inbox[0].id, userId: 2 });
    expect(await listOperatorShiftInbox(2)).toHaveLength(0);
  });

  it("faz rollback de toda a passagem se o segundo atendimento tem prazo inválido", async () => {
    await orm.insert(incidents).values({ id: 402, eventId: 301, operatorId: 1, status: "attending", notes: "Segundo", version: 1 });
    await expect(logoff([handoff, { ...handoff, incidentId: 402, observationUntil: new Date("2026-11-04T15:00:00Z") }])).rejects.toThrow("data e hora futura");
    expect((await orm.select().from(incidents)).every((row) => row.status === "attending" && row.version === 1)).toBe(true);
    expect(await orm.select().from(operatorShiftMessages)).toHaveLength(0);
    expect(await orm.select().from(incidentHistory)).toHaveLength(0);
    expect((await orm.select().from(operatorAttendanceRecords))[0].logoutAt).toBeNull();
    expect((await orm.select().from(authSessions))[0].revokedAt).toBeNull();
  });

  it("recusa pendência omitida, anotação curta ou destinatário parceiro sem efetuar nenhuma gravação", async () => {
    for (const plan of [[], [{ ...handoff, message: "curta" }], [{ ...handoff, toUserId: 4 }]]) await expect(logoff(plan)).rejects.toThrow();
    expect((await orm.select().from(incidents))[0].status).toBe("attending");
    expect(await orm.select().from(operatorShiftMessages)).toHaveLength(0);
    expect((await orm.select().from(authSessions))[0].revokedAt).toBeNull();
  });

  it("dois logoffs concorrentes não duplicam passagem, mensagem nem relatório", async () => {
    await Promise.all([logoff(), logoff()]);
    expect(await orm.select().from(operatorShiftMessages)).toHaveLength(1);
    expect(await orm.select().from(incidentHistory)).toHaveLength(1);
    expect((await orm.select().from(incidents))[0].version).toBe(2);
  });

  it("permite recado avulso, sem evento e sem mudar o estado da ocorrência", async () => {
    const result = await sendOperatorShiftMessage({ userId: 1, authSessionId: 101, toUserId: 2, message: "Cliente solicitou novo horário de fechamento às 23h." });
    expect(result.id).toBeGreaterThan(0);
    expect((await orm.select().from(operatorShiftMessages))[0].incidentId).toBeNull();
    expect((await orm.select().from(incidents))[0].status).toBe("attending");
    expect((await orm.select().from(authSessions))[0].revokedAt).toBeNull();
  });

  it("bloqueia novo login se há pendências; depois da finalização, registra sessão substituída com motivo próprio", async () => {
    await expect(replaceActiveAuthSession(1, "b".repeat(64), new Date("2027-01-02T00:00:00Z"))).rejects.toThrow("ocorrências pendentes");
    expect((await orm.select().from(authSessions))[0].revokedAt).toBeNull();
    expect(await orm.select().from(operatorAttendanceRecords)).toHaveLength(1);
    await orm.update(incidents).set({ status: "closed" }).where(eq(incidents.id, 401));
    await replaceActiveAuthSession(1, "b".repeat(64), new Date("2027-01-02T00:00:00Z"));
    const rows = await orm.select().from(operatorAttendanceRecords);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.authSessionId === 101)?.logoutReason).toBe("session_replaced");
    expect(rows.find((row) => row.authSessionId !== 101)?.logoutAt).toBeNull();
    expect((await orm.select().from(incidents))[0].status).toBe("closed");
  });

  it("aviso 40/20 não duplica nem com execuções simultâneas", async () => {
    const first = await Promise.all([sweepOperatorShiftOperations(now), sweepOperatorShiftOperations(now)]);
    expect(first.reduce((sum, result) => sum + result.remindersSent.length, 0)).toBe(1);
    const twenty = await sweepOperatorShiftOperations(new Date("2026-11-04T15:40:00Z"));
    expect(twenty.remindersSent.length).toBe(1);
    expect(await orm.select().from(operatorShiftReminders)).toHaveLength(2);
  });

  it("cadastra Comercial e associa login nos dias úteis, incluindo entrada antecipada e fora do turno regular", async () => {
    await orm.transaction((tx) => saveOperatorShiftAssignmentWithTransaction(tx, { userId: 1, shiftCode: "commercial", effectiveFromDate: "2026-11-01", cycleAnchorDate: "2026-11-01", changeReason: "Escala comercial inicial", changedBy: 1 }));
    expect((await orm.select().from(operatorShiftAssignments))[0].shiftCode).toBe("commercial");
    for (const loginAt of ["2026-11-04T09:50:00Z", "2026-11-04T15:20:00Z", "2026-11-05T18:00:00Z"]) {
      const window = await getUserShiftAttendanceWindow(orm, 1, new Date(loginAt));
      expect(window?.shiftCode).toBe("commercial");
      expect(window?.startAt.toISOString().slice(11, 16)).toBe("11:00");
      expect(window?.endAt.toISOString().slice(11, 16)).toBe("21:00");
    }
    expect(await getUserShiftAttendanceWindow(orm, 1, new Date("2026-11-07T15:00:00Z"))).toBeNull();
    expect(await getUserShiftAttendanceWindow(orm, 1, new Date("2026-11-04T21:00:00Z"))).toBeNull();
    const report = await getOperatorShiftReport({ fromDate: "2026-11-02", toDate: "2026-11-08", now });
    expect(report.currentShifts.map((window) => window.shiftCode)).toEqual(["first", "commercial"]);
    expect(report.currentShifts.find((window) => window.shiftCode === "commercial")?.expectedOperators[0]).toMatchObject({ userId: 1, name: "Amanda" });
    expect(report.monthlyPlan.filter((row) => row.userId === 1)).toHaveLength(5);
  });

  it("avisa Comercial às 17:20 e 17:40, uma única vez por sessão/aviso", async () => {
    await orm.update(operatorAttendanceRecords).set({ shiftCode: "commercial", scheduledStartAt: new Date("2026-11-04T11:00:00Z"), scheduledEndAt: new Date("2026-11-04T21:00:00Z") }).where(eq(operatorAttendanceRecords.id, 201));
    const first = await sweepOperatorShiftOperations(new Date("2026-11-04T20:20:00Z"));
    expect(first.remindersSent).toHaveLength(1);
    expect(first.remindersSent[0]).toMatchObject({ minutesBefore: 40, shiftCode: "commercial" });
    expect((await sweepOperatorShiftOperations(new Date("2026-11-04T20:20:00Z"))).remindersSent).toHaveLength(0);
    expect((await sweepOperatorShiftOperations(new Date("2026-11-04T20:40:00Z"))).remindersSent[0]).toMatchObject({ minutesBefore: 20, shiftCode: "commercial" });
    expect(await orm.select().from(operatorShiftReminders)).toHaveLength(2);
  });

  it("vigência permanente inicial passada é permitida; mudar passado já cadastrado é bloqueado", async () => {
    const input = { userId: 1, shiftCode: "first" as const, effectiveFromDate: "2026-11-01", cycleAnchorDate: "2026-11-01", changeReason: "Escala inicial informada", changedBy: 1 };
    await orm.transaction((tx) => saveOperatorShiftAssignmentWithTransaction(tx, input));
    await expect(orm.transaction((tx) => saveOperatorShiftAssignmentWithTransaction(tx, { ...input, effectiveFromDate: "2026-11-02" }))).rejects.toThrow("reescrever escala retroativa");
    expect(await orm.select().from(operatorShiftAssignments)).toHaveLength(1);
  });

  it("troca pontual cria exceções para ambos, nunca altera data-âncora", async () => {
    await orm.insert(operatorShiftAssignments).values({ userId: 1, operatorName: "Amanda", shiftCode: "first", effectiveFromDate: "2026-11-01", cycleAnchorDate: "2026-11-01", changeReason: "Inicial", changedBy: 1 });
    await createOperatorShiftExceptionSwap({ firstUserId: 1, secondUserId: 3, firstWorkDate: "2027-02-01", secondWorkDate: "2027-02-02", shiftOnFirstDate: "first", shiftOnSecondDate: "first", reason: "Troca combinada de teste", createdBy: 1 });
    expect(await orm.select().from(operatorShiftExceptions)).toHaveLength(4);
    expect((await orm.select().from(operatorShiftAssignments))[0].cycleAnchorDate).toBe("2026-11-01");
  });

  it("sem escala, login em outro dia é registrado mas não cria escala permanente", async () => {
    expect(await getUserShiftAttendanceWindow(orm, 1, now)).toBeNull();
    expect(await orm.select().from(operatorShiftAssignments)).toHaveLength(0);
  });

  it("SQL de upgrade da nova função pode ser reaplicado sem perder mensagens ou presenças", async () => {
    await logoff();
    for (const [table, required] of [["operator_attendance_records", false], ["operator_shift_assignments", true], ["operator_shift_exceptions", false], ["operator_shift_reminders", true]] as const) {
      await pool.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`shiftCode\` ENUM('first','second','third') ${required ? "NOT NULL" : "NULL"}`);
    }
    const sql = fs.readFileSync(new URL("../deploy/upgrade_vps.sql", import.meta.url), "utf8");
    const section = sql.slice(sql.indexOf("-- Escala e presença operacional;"));
    await pool.query(`SET @schema_name = DATABASE(); ${section}`);
    await orm.update(operatorAttendanceRecords).set({ shiftCode: "commercial" }).where(eq(operatorAttendanceRecords.id, 201));
    await pool.query(`SET @schema_name = DATABASE(); ${section}`);
    expect(await orm.select().from(operatorShiftMessages)).toHaveLength(1);
    expect((await orm.select().from(operatorAttendanceRecords))[0].logoutReason).toBe("logout");
    expect((await orm.select().from(operatorAttendanceRecords))[0].shiftCode).toBe("commercial");
  });
});
