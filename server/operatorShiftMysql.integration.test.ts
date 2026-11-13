import { onAlarmSystemsRetired } from "./_core/alarmSystemRuntime";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import { setDbForTesting, replaceActiveAuthSession, transitionIncidentForOperator, assumeObservedIncident, getActiveAuthSessionByTokenHash, createClient, createPartnerCompany, updatePartnerCompany, getAlarmSystemByPanelIdentifier, getOperationalAlarmSystem, recordSystemKeepAlive, listSystemsConnectionStatus, deleteClient, deleteAlarmSystem, createAlarmSystem, dispatchAlarmRemoteCommand, expireStaleRemoteCommandDispatches } from "./db";
import { endOperatorSessionWithHandoff, listOperatorShiftInbox, markOperatorShiftMessageRead, sendOperatorShiftMessage, sweepOperatorShiftOperations, createOperatorShiftExceptionSwap, getOperatorShiftReport, getLoginScheduleDecision, confirmLoginScheduleException } from "./operatorShiftDb";
import { saveOperatorShiftAssignmentWithTransaction } from "./operatorShiftPersistence";
import { getUserShiftAttendanceWindow } from "./operatorShiftSchedule";
import { authSessions, incidents, incidentHistory, operatorAttendanceRecords, operatorShiftMessages, operatorShiftReminders, operatorShiftAssignments, operatorShiftExceptions, clients, partnerCompanies, registrationDocuments, alarmSystems, alarmEvents, alarmRemoteCommands, systemKeepAliveSamples } from "../drizzle/schema";

// Explicit opt-in, Unix socket only. Never reads DATABASE_URL or connects to a VPS.
const socket = process.env.POLICE_SHIFT_TEST_SOCKET;
const localEnabled = Boolean(socket?.startsWith("/tmp/police-shift-db/") && fs.existsSync(socket));
const now = new Date("2026-11-04T15:20:00Z");
const until = new Date("2026-11-04T16:30:00Z");
let pool: mysql.Pool;
let orm: ReturnType<typeof drizzle>;
const database = `police_shift_test_${process.pid}`;
const TABLES = ["users", "auth_sessions", "alarm_events", "incidents", "incident_history", "operator_attendance_records", "operator_shift_assignments", "operator_shift_exceptions", "operator_shift_messages", "operator_shift_reminders", "clients", "partner_companies", "registration_documents", "alarm_systems", "alarm_remote_commands", "alarm_remote_credentials", "system_keep_alive_samples", "system_disconnect_alerts"];
function snapshotDDL() {
  const snapshot = JSON.parse(fs.readFileSync(new URL("../drizzle/meta/0048_snapshot.json", import.meta.url), "utf8"));
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
    const upgrade = fs.readFileSync(new URL("../deploy/upgrade_vps.sql", import.meta.url), "utf8");
    await pool.query(upgrade.slice(upgrade.lastIndexOf("CREATE TABLE IF NOT EXISTS client_dvrs (")));
    orm = drizzle(pool);
    setDbForTesting(orm);
  });
  beforeEach(async () => { for (const table of [...TABLES].reverse()) await pool.query(`DELETE FROM \`${table}\``); await fixture(); });
  afterAll(async () => {
    setDbForTesting(null);
    if (pool) { await pool.query(`DROP DATABASE \`${database}\``); await pool.end(); }
  });

  it("mantém recado lido até finalizar e o encaminha a cada operador que assume ou recebe passagem", async () => {
    const firstHandoff = await logoff();
    expect(firstHandoff.messages).toHaveLength(1);
    let inbox = await listOperatorShiftInbox(2);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ isCurrent: true, incidentStatus: "observing", fromOperatorName: "Amanda", toOperatorName: "Yasmin" });
    await markOperatorShiftMessageRead({ messageId: inbox[0].id, userId: 2 });
    inbox = await listOperatorShiftInbox(2);
    expect(inbox).toHaveLength(1);

    await orm.insert(authSessions).values({ id: 102, userId: 2, tokenHash: "b".repeat(64), createdAt: now, expiresAt: new Date("2027-01-01T00:00:00Z") });
    const assumed = await assumeObservedIncident({ incidentId: 401, operatorId: 2, operatorName: "Yasmin", authSessionId: 102 });
    expect(assumed).toMatchObject({ id: 401, status: "attending", forwardedMessage: { toUserId: 2, toOperatorName: "Yasmin", incidentId: 401 } });
    inbox = await listOperatorShiftInbox(2);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ isCurrent: true, readAt: null, fromOperatorName: "Amanda", toOperatorName: "Yasmin" });

    const secondHandoff = await endOperatorSessionWithHandoff({
      userId: 2, authSessionId: 102, operatorName: "Yasmin",
      handoffs: [{ incidentId: 401, toUserId: 3, message: "A equipe tática confirmou que o local está normal; manter observação.", observationUntil: until }], now,
    });
    expect(secondHandoff.messages[0]).toMatchObject({ toUserId: 3, toOperatorName: "Stephane", incidentId: 401 });
    expect(await listOperatorShiftInbox(2)).toHaveLength(0);
    const nextInbox = await listOperatorShiftInbox(3);
    expect(nextInbox).toHaveLength(1);
    expect(nextInbox[0]).toMatchObject({ isCurrent: true, incidentStatus: "observing", fromOperatorName: "Yasmin", toOperatorName: "Stephane" });

    await orm.update(incidents).set({ status: "closed" }).where(eq(incidents.id, 401));
    expect(await listOperatorShiftInbox(3)).toHaveLength(0);
    const messages = await orm.select().from(operatorShiftMessages).orderBy(operatorShiftMessages.id);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({ isCurrent: false, fromOperatorName: "Amanda", toOperatorName: "Yasmin", message: handoff.message });
    expect(messages[0].readAt).not.toBeNull();
    expect(messages[1].isCurrent).toBe(false);
    expect(messages[2]).toMatchObject({ isCurrent: true, fromOperatorName: "Yasmin", toOperatorName: "Stephane" });
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
    expect(await listOperatorShiftInbox(2)).toHaveLength(1);
    await orm.update(incidents).set({ status: "closed" }).where(eq(incidents.id, 401));
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

  it("registra justificativa fora da escala só na sessão autenticada e a exibe no relatório", async () => {
    await orm.update(operatorAttendanceRecords).set({ scheduleStatus: "outside_window", shiftCode: null, workDate: null, scheduledStartAt: null, scheduledEndAt: null }).where(eq(operatorAttendanceRecords.id, 201));
    expect(await getLoginScheduleDecision({ userId: 1, authSessionId: 101 })).toMatchObject({ required: true, scheduleStatus: "outside_window", reason: null });
    expect(await getLoginScheduleDecision({ userId: 1, authSessionId: 999 })).toMatchObject({ required: false, attendanceId: null });
    await expect(confirmLoginScheduleException({ userId: 1, authSessionId: 999, reason: "double_shift", now })).rejects.toThrow("encerrada ou substituída");
    await expect(confirmLoginScheduleException({ userId: 1, authSessionId: 101, reason: "double_shift", now })).resolves.toMatchObject({ success: true, alreadyRecorded: false });
    await expect(confirmLoginScheduleException({ userId: 1, authSessionId: 101, reason: "double_shift", now })).resolves.toMatchObject({ success: true, alreadyRecorded: true });
    await expect(confirmLoginScheduleException({ userId: 1, authSessionId: 101, reason: "vacation_coverage", now })).rejects.toThrow("não pode ser alterado");
    const report = await getOperatorShiftReport({ fromDate: "2026-11-04", toDate: "2026-11-04", userId: 1, now });
    expect(report.attendance[0]).toMatchObject({ scheduleStatus: "outside_window", outOfScheduleReason: "double_shift" });
    expect(await getLoginScheduleDecision({ userId: 1, authSessionId: 101 })).toMatchObject({ required: false, reason: "double_shift" });
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

  it("a sessão nasce pendente só para login efetivamente fora da escala e deixa de estar pendente após justificativa", async () => {
    await orm.insert(operatorShiftAssignments).values({ userId: 3, operatorName: "Stephane", shiftCode: "first", effectiveFromDate: "2026-11-01", cycleAnchorDate: "2026-11-04", changeReason: "Inicial", changedBy: 1 });
    const loginAt = new Date("2026-11-05T11:00:00Z");
    const token = "c".repeat(64);
    const { sessionId } = await replaceActiveAuthSession(3, token, new Date("2027-01-01T00:00:00Z"), loginAt);
    expect(await getActiveAuthSessionByTokenHash(token, loginAt)).toMatchObject({ sessionId, scheduleDecisionPending: true });
    await confirmLoginScheduleException({ userId: 3, authSessionId: sessionId, reason: "scale_swap", now: loginAt });
    expect(await getActiveAuthSessionByTokenHash(token, loginAt)).toMatchObject({ scheduleDecisionPending: false });
    expect((await orm.select().from(operatorShiftAssignments))[0].cycleAnchorDate).toBe("2026-11-04");
  });

  it("reutiliza o CNPJ apenas na sede confirmada da própria parceira, preservando a edição e impedindo outro cliente", async () => {
    const document = "04252011000110";
    const partner = await createPartnerCompany({ name: "Parceira fictícia", managingCompanyId: 1, cnpj: document });
    const customer = { partnerCompanyId: partner.id, type: "pj" as const, propertyType: "company" as const, name: "Sede fictícia", document };
    await expect(createClient(customer)).rejects.toThrow("CPF/CNPJ já cadastrado");
    expect(await orm.select().from(clients)).toHaveLength(0);
    const result = await createClient(customer, { confirmPartnerDocumentReuse: true });
    expect((await orm.select().from(clients))[0]).toMatchObject({ id: result.id, isPartnerHeadquarters: true });
    expect(await orm.select().from(registrationDocuments)).toHaveLength(2);
    await expect(updatePartnerCompany(partner.id, { name: "Parceira editada", cnpj: document })).resolves.toBeUndefined();
    await expect(createClient({ ...customer, name: "Duplicidade não autorizada" }, { confirmPartnerDocumentReuse: true })).rejects.toThrow("CPF/CNPJ já cadastrado");
    expect(await orm.select().from(clients)).toHaveLength(1);
    expect(await orm.select().from(partnerCompanies)).toHaveLength(1);
    expect(await orm.select().from(registrationDocuments)).toHaveLength(2);
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

  it("migra mensagens antigas preservando a mais recente por atendimento até o fechamento, de modo repetível", async () => {
    await orm.insert(incidents).values({ id: 402, eventId: 301, status: "closed", closedAt: now, version: 2 });
    await orm.insert(operatorShiftMessages).values([
      { id: 501, fromUserId: 1, fromOperatorName: "Amanda", fromAttendanceId: 201, toUserId: 2, toOperatorName: "Yasmin", incidentId: 401, account: "TEST-001", message: "Passagem antiga." },
      { id: 502, fromUserId: 3, fromOperatorName: "Stephane", fromAttendanceId: 201, toUserId: 2, toOperatorName: "Yasmin", incidentId: 401, account: "TEST-001", message: "Passagem atual." },
      { id: 503, fromUserId: 1, fromOperatorName: "Amanda", fromAttendanceId: 201, toUserId: 2, toOperatorName: "Yasmin", incidentId: 402, account: "TEST-001", message: "Ocorrência encerrada." },
      { id: 504, fromUserId: 1, fromOperatorName: "Amanda", fromAttendanceId: 201, toUserId: 2, toOperatorName: "Yasmin", incidentId: null, account: null, message: "Recado avulso." },
    ]);
    await pool.query("ALTER TABLE operator_shift_messages DROP INDEX operator_shift_message_active_incident_idx, DROP COLUMN isCurrent");
    const source = fs.readFileSync(new URL("../deploy/upgrade_vps.sql", import.meta.url), "utf8");
    const start = source.indexOf("-- Mensagens de passagem associadas a incidente permanecem ativas até o atendimento ser finalizado.");
    const end = source.indexOf("CREATE TABLE IF NOT EXISTS `operator_shift_reminders`", start);
    const migration = source.slice(start, end);
    await pool.query(`SET @schema_name = DATABASE(); ${migration}`);
    let rows = await orm.select().from(operatorShiftMessages).orderBy(operatorShiftMessages.id);
    expect(rows.map((row) => [row.id, row.isCurrent])).toEqual([[501, false], [502, true], [503, false], [504, true]]);
    await pool.query(`SET @schema_name = DATABASE(); ${migration}`);
    rows = await orm.select().from(operatorShiftMessages).orderBy(operatorShiftMessages.id);
    expect(rows.map((row) => [row.id, row.isCurrent])).toEqual([[501, false], [502, true], [503, false], [504, true]]);
  });

  it("migra índice documental antigo e colunas novas de modo repetível, sem inventar motivos históricos", async () => {
    await createPartnerCompany({ name: "Sede de teste", managingCompanyId: 1, cnpj: "04252011000110" });
    await pool.query("ALTER TABLE registration_documents ADD UNIQUE KEY registration_documents_document_unique (document); ALTER TABLE registration_documents DROP INDEX registration_documents_document_ownerType_unique; ALTER TABLE clients DROP COLUMN isPartnerHeadquarters; ALTER TABLE operator_attendance_records DROP COLUMN scheduleStatus, DROP COLUMN outOfScheduleReason, DROP COLUMN outOfScheduleDecisionAt;");
    const source = fs.readFileSync(new URL("../deploy/upgrade_vps.sql", import.meta.url), "utf8");
    const docs = source.slice(source.indexOf("-- CPF/CNPJ é único"), source.indexOf("-- Bloqueia qualquer transmissão MicroBus"));
    const columns = source.slice(source.indexOf("-- Dados de cliente/parceira e exceções de escala"));
    await pool.query(`SET @schema_name = DATABASE(); ${docs} ${columns}`);
    expect((await orm.select().from(operatorAttendanceRecords))[0]).toMatchObject({ scheduleStatus: null, outOfScheduleReason: null });
    const [partner] = await orm.select().from(partnerCompanies);
    await createClient({ name: "Sede fictícia", type: "pj", propertyType: "company", partnerCompanyId: partner.id, document: partner.cnpj }, { confirmPartnerDocumentReuse: true });
    await orm.update(operatorAttendanceRecords).set({ scheduleStatus: "outside_window", outOfScheduleReason: "double_shift", outOfScheduleDecisionAt: now }).where(eq(operatorAttendanceRecords.id, 201));
    await pool.query(`SET @schema_name = DATABASE(); ${docs} ${columns}`);
    expect(await orm.select().from(registrationDocuments)).toHaveLength(2);
    expect((await orm.select().from(operatorAttendanceRecords))[0]).toMatchObject({ outOfScheduleReason: "double_shift" });
    expect((await orm.select().from(clients))[0].isPartnerHeadquarters).toBe(true);
  });

  it("reassocia o MAC 37C6B0 à conta 0021 nova, ignora cadastro órfão e preserva eventos ao excluir o cliente", async () => {
    await orm.insert(clients).values({ id: 76, partnerCompanyId: 1, type: "pj", name: "Teto Locadora", fantasyName: "Teto Locadora", isActive: true });
    await orm.insert(alarmSystems).values([
      { id: 77, clientId: 999, account: "0021", brand: "INTELBRAS", model: "MT8000 antigo", macAddress: "37C6B0", receiverPort: 9271, isActive: true, isOnline: true, lastCommunication: now, lastKeepAliveAt: now },
      { id: 80, clientId: 76, account: "0021", brand: "INTELBRAS", model: "AMT 8000 Lite", macAddress: "37C6B0", receiverPort: 9271, isActive: true, isOnline: false, lastKeepAliveAt: null },
    ]);
    await orm.insert(alarmEvents).values({ id: 78103, alarmSystemId: 77, account: "0021", brand: "INTELBRAS", qualifier: "R", eventCode: "570", description: "Evento histórico do cadastro anterior" });
    await orm.insert(alarmEvents).values({ id: 78104, alarmSystemId: 80, account: "0021", brand: "INTELBRAS", qualifier: "E", eventCode: "401", description: "Evento de teste da nova conta" });
    await orm.insert(alarmRemoteCommands).values([
      { id: 880, alarmSystemId: 77, operatorId: 1, brand: "INTELBRAS", commandType: "arm", transportMode: "isecnet", status: "waiting_connection", reason: "Comando fictício aguardando no cadastro órfão", commandPayload: "QUADRO_FICTICIO" },
      { id: 881, alarmSystemId: 77, operatorId: 1, brand: "INTELBRAS", commandType: "arm", transportMode: "isecnet", status: "sent", reason: "Comando fictício já transmitido no cadastro órfão", commandPayload: "QUADRO_FICTICIO" },
    ]);

    const matched = await getAlarmSystemByPanelIdentifier("37C6B0", "mac", "INTELBRAS", 9271);
    expect(matched).toMatchObject({ id: 80, clientId: 76, account: "0021", macAddress: "37C6B0" });
    expect(await getOperationalAlarmSystem(77)).toBeUndefined();
    expect(await recordSystemKeepAlive(77, new Date("2026-11-04T16:00:00Z"))).toBeUndefined();
    expect(await orm.select().from(systemKeepAliveSamples)).toHaveLength(0);
    expect((await listSystemsConnectionStatus(new Date("2026-11-04T16:00:00Z"))).map((system) => system.id)).toEqual([80]);

    const upgrade = fs.readFileSync(new URL("../deploy/upgrade_vps.sql", import.meta.url), "utf8");
    const orphanMigration = upgrade.slice(upgrade.indexOf("-- Cadastros órfãos não podem representar cliente novo"));
    await pool.query(`SET @schema_name = DATABASE(); ${orphanMigration}`);
    expect((await orm.select().from(alarmSystems).where(eq(alarmSystems.id, 77)))[0]).toMatchObject({ isActive: false, isOnline: false });
    expect((await orm.select().from(alarmSystems).where(eq(alarmSystems.id, 80)))[0].isActive).toBe(true);
    expect((await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.alarmSystemId, 77)).orderBy(alarmRemoteCommands.id)).map((command) => command.status)).toEqual(["cancelled", "sent"]);
    await pool.query(`SET @schema_name = DATABASE(); ${orphanMigration}`);
    expect(await orm.select().from(alarmEvents).where(eq(alarmEvents.account, "0021"))).toHaveLength(2);
    expect((await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.alarmSystemId, 77)).orderBy(alarmRemoteCommands.id)).map((command) => command.status)).toEqual(["cancelled", "sent"]);

    const measurement = await recordSystemKeepAlive(80, new Date("2026-11-04T16:01:00Z"));
    expect(measurement).toMatchObject({ intervalMs: null });
    expect((await getOperationalAlarmSystem(80))?.isOnline).toBe(true);
    expect(await orm.select().from(systemKeepAliveSamples)).toHaveLength(1);

    await orm.insert(alarmRemoteCommands).values([
      { id: 901, alarmSystemId: 80, operatorId: 1, brand: "INTELBRAS", commandType: "arm", transportMode: "isecnet", status: "waiting_connection", reason: "Teste de comando ainda aguardando", commandPayload: "QUADRO_FICTICIO" },
      { id: 902, alarmSystemId: 80, operatorId: 1, brand: "INTELBRAS", commandType: "arm", transportMode: "isecnet", status: "sent", reason: "Teste de comando já enviado", commandPayload: "QUADRO_FICTICIO" },
    ]);

    await deleteClient(76);
    expect(await getOperationalAlarmSystem(80)).toBeUndefined();
    const storedSystem = (await orm.select().from(alarmSystems).where(eq(alarmSystems.id, 80)))[0];
    expect(storedSystem).toMatchObject({ isActive: false, isOnline: false, remoteCommandLabEnabled: false });
    expect(await orm.select().from(alarmEvents).where(eq(alarmEvents.account, "0021"))).toHaveLength(2);
    const commands = await orm.select().from(alarmRemoteCommands).orderBy(alarmRemoteCommands.id);
    expect(commands.map((command) => command.status)).toEqual(["cancelled", "sent", "cancelled", "sent"]);
  });

  it("exige porta exata, rejeita MAC duplicado entre ativos e ignora cliente inativo", async () => {
    await orm.insert(clients).values([{ id: 76, partnerCompanyId: 1, type: "pj", name: "Ativo", isActive: true }, { id: 79, partnerCompanyId: 1, type: "pj", name: "Inativo", isActive: false }]);
    await orm.insert(alarmSystems).values([
      { id: 80, clientId: 76, account: "0021", brand: "INTELBRAS", macAddress: "37C6B0", receiverPort: 9271 },
      { id: 81, clientId: 79, account: "0021", brand: "INTELBRAS", macAddress: "37C6B0", receiverPort: 9271 },
      { id: 82, clientId: 76, account: "0021", brand: "INTELBRAS", macAddress: "37C6B0", receiverPort: null },
    ]);
    expect((await getAlarmSystemByPanelIdentifier("37C6B0", "mac", "INTELBRAS", 9271))?.id).toBe(80);
    expect(await getAlarmSystemByPanelIdentifier("37C6B0", "mac", "INTELBRAS", 9071)).toBeUndefined();
    expect(await getAlarmSystemByPanelIdentifier("37C6B0", "mac", "INTELBRAS")).toBeUndefined();
    expect(await getOperationalAlarmSystem(81)).toBeUndefined();
    await orm.insert(alarmSystems).values({ id: 83, clientId: 76, account: "0999", brand: "INTELBRAS", macAddress: "37C6B0", receiverPort: 9271 });
    expect(await getAlarmSystemByPanelIdentifier("37C6B0", "mac", "INTELBRAS", 9271)).toBeUndefined();
  });

  it("aposenta central sem apagar eventos, preserva serial histórico e permite recadastro", async () => {
    await orm.insert(clients).values({ id: 76, partnerCompanyId: 1, type: "pj", name: "Cliente ativo" });
    await orm.insert(alarmSystems).values({ id: 80, clientId: 76, account: "0021", brand: "INTELBRAS", macAddress: "37C6B0", serialNumber: "1234567890", receiverPort: 9271 });
    await orm.insert(alarmEvents).values({ alarmSystemId: 80, account: "0021", brand: "INTELBRAS", qualifier: "E", eventCode: "401", description: "Histórico preservado" });
    await pool.query("INSERT INTO alarm_remote_credentials (alarmSystemId,credentialKind,encryptedSecret,updatedBy) VALUES (80,'intelbras_master','SEGREDO_FICTICIO',1)");
    await deleteAlarmSystem(80);
    expect((await orm.select().from(alarmSystems).where(eq(alarmSystems.id, 80)))[0]).toMatchObject({ isActive: false, isOnline: false, serialNumber: null, retiredSerialNumber: "1234567890" });
    expect((await pool.query("SELECT * FROM alarm_remote_credentials"))[0]).toHaveLength(0);
    const recreated = await createAlarmSystem({ clientId: 76, account: "0021", brand: "INTELBRAS", macAddress: "37C6B0", serialNumber: "1234567890", receiverPort: 9271 });
    expect((await getAlarmSystemByPanelIdentifier("37C6B0", "mac", "INTELBRAS", 9271))?.id).toBe(recreated.id);
    expect(await orm.select().from(alarmEvents).where(eq(alarmEvents.alarmSystemId, 80))).toHaveLength(1);
  });

  it("serializa despacho simulado contra exclusão e não escreve depois da aposentadoria", async () => {
    await orm.insert(clients).values({ id: 76, partnerCompanyId: 1, type: "pj", name: "Cliente de corrida" });
    await orm.insert(alarmSystems).values({ id: 80, clientId: 76, account: "0021", brand: "INTELBRAS", macAddress: "37C6B0", receiverPort: 9271 });
    await orm.insert(alarmRemoteCommands).values({ id: 901, alarmSystemId: 80, operatorId: 1, brand: "INTELBRAS", commandType: "arm", transportMode: "TEST_ONLY", status: "queued", reason: "Teste de lock", commandPayload: "SEM_QUADRO_FISICO" });
    const timeline: string[] = [];
    const cleanup = onAlarmSystemsRetired((ids) => { if (ids.includes(80)) timeline.push("retired"); });
    try {
      await Promise.all([
        dispatchAlarmRemoteCommand({ alarmSystemId: 80, commandId: 901, expectedStatuses: ["queued"], unavailableStatus: "failed", sentResponsePayload: "Escrita apenas simulada", send: () => { timeline.push("send"); return { sent: true }; } }),
        deleteAlarmSystem(80),
      ]);
      expect(timeline).not.toEqual(["retired", "send"]);
      expect(timeline.filter((item) => item === "send").length).toBeLessThanOrEqual(1);
      let writes = 0;
      const retry = await dispatchAlarmRemoteCommand({ alarmSystemId: 80, commandId: 901, expectedStatuses: ["queued"], unavailableStatus: "failed", sentResponsePayload: "Não executar", send: () => { writes++; return { sent: true }; } });
      expect(retry.sent).toBe(false);
      expect(writes).toBe(0);
    } finally { cleanup(); }
  });

  it("não repete despacho incerto e recupera interrupção como resultado indeterminado", async () => {
    await orm.insert(clients).values({ id: 76, partnerCompanyId: 1, type: "pj", name: "Cliente de despacho" });
    await orm.insert(alarmSystems).values({ id: 80, clientId: 76, account: "0021", brand: "INTELBRAS", macAddress: "37C6B0", receiverPort: 9271 });
    await orm.insert(alarmRemoteCommands).values([
      { id: 901, alarmSystemId: 80, operatorId: 1, brand: "INTELBRAS", commandType: "arm", transportMode: "TEST_ONLY", status: "queued", reason: "Teste simulado", commandPayload: "SEM_QUADRO_FISICO" },
      { id: 902, alarmSystemId: 80, operatorId: 1, brand: "INTELBRAS", commandType: "arm", transportMode: "TEST_ONLY", status: "dispatching", updatedAt: new Date("2026-11-04T10:00:00Z"), reason: "Interrupção simulada", commandPayload: "SEM_QUADRO_FISICO" },
    ]);
    let writes = 0;
    const request = { alarmSystemId: 80, commandId: 901, expectedStatuses: ["queued"], unavailableStatus: "failed", sentResponsePayload: "Não confirmado", send: () => { writes++; throw new Error("Interrupção simulada"); } };
    expect((await dispatchAlarmRemoteCommand(request)).status).toBe("dispatch_unknown");
    expect((await dispatchAlarmRemoteCommand(request)).sent).toBe(false);
    expect(writes).toBe(1);
    expect(await expireStaleRemoteCommandDispatches(new Date("2026-11-04T10:03:00Z"))).toBe(1);
    expect(await expireStaleRemoteCommandDispatches(new Date("2026-11-04T10:04:00Z"))).toBe(0);
    expect((await orm.select().from(alarmRemoteCommands).where(eq(alarmRemoteCommands.id, 902)))[0].status).toBe("dispatch_unknown");
  });
});
