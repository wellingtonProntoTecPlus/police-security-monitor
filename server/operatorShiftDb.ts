import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import {
  authSessions, incidents, alarmEvents, incidentHistory, users,
  operatorAttendanceRecords, operatorShiftAssignments, operatorShiftExceptions,
  operatorShiftMessages, operatorShiftReminders,
} from "../drizzle/schema";
import { getDb } from "./db";
import { addCalendarDays, calendarDayDistance, getCurrentShiftWindow, getCurrentShiftWindows, getNextShiftWindow, getShiftAfter, getShiftReminderDueMinutes,
  localDateKey, resolveOperatorShift, type OperatorShiftCode,
} from "@shared/operatorShift";
import { OPERATIONAL_ROLES, listRosterForWindow, getUserShiftAttendanceWindow } from "./operatorShiftSchedule";
import { getConnectedOperatorSessionIds, isOperatorSessionSocketConnected } from "./_core/operatorShiftRuntime";
import { validateOperatorHandoffPlan } from "./operatorLogoutContract";
import { saveOperatorShiftAssignmentWithTransaction } from "./operatorShiftPersistence";
import { buildOperatorMonthlyPlan } from "@shared/operatorMonthlyPlan";

const OPEN_STATUSES = ["waiting", "attending", "observing", "dispatched", "maintenance"] as const;
type DbLike = any;

async function ensureSessionAttendance(tx: DbLike, userId: number, authSessionId: number, sessionCreatedAt: Date, now: Date) {
  const [existing] = await tx.select().from(operatorAttendanceRecords).where(and(
    eq(operatorAttendanceRecords.authSessionId, authSessionId), eq(operatorAttendanceRecords.userId, userId),
  )).for("update").limit(1);
  if (existing) return existing;
  const [person] = await tx.select({ name: users.name, role: users.role, loginMethod: users.loginMethod }).from(users).where(eq(users.id, userId)).limit(1);
  if (!person || !OPERATIONAL_ROLES.includes(person.role)) throw new Error("Usuário operacional não encontrado");
  const window = await getUserShiftAttendanceWindow(tx, userId, now);
  const values = {
    authSessionId, userId, operatorName: person.name || `Operador ${userId}`, role: person.role, loginMethod: person.loginMethod,
    loginAt: sessionCreatedAt, shiftCode: window?.shiftCode || null, workDate: window?.workDate || null,
    scheduledStartAt: window?.startAt || null, scheduledEndAt: window?.endAt || null,
  };
  const result = await tx.insert(operatorAttendanceRecords).values(values);
  return { ...values, id: Number(result[0].insertId), logoutAt: null };
}

export async function listOperatorShiftAssignments() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const people = await db.select({ id: users.id, name: users.name, role: users.role }).from(users)
    .where(inArray(users.role, [...OPERATIONAL_ROLES]));
  const ids = people.map((person: any) => Number(person.id));
  const today = localDateKey(new Date());
  if (ids.length === 0) return [];
  const rows = await db.select().from(operatorShiftAssignments).where(and(
    inArray(operatorShiftAssignments.userId, ids),
    eq(operatorShiftAssignments.isActive, true),
    or(isNull(operatorShiftAssignments.effectiveUntilDate), gte(operatorShiftAssignments.effectiveUntilDate, today)),
  )).orderBy(desc(operatorShiftAssignments.effectiveFromDate), desc(operatorShiftAssignments.id));
  const latestByUser = new Map<number, any>();
  for (const row of rows) if (!latestByUser.has(Number(row.userId))) latestByUser.set(Number(row.userId), row);
  return people.map((person: any) => ({ ...person, shiftAssignment: latestByUser.get(Number(person.id)) || null }));
}

export async function saveOperatorShiftAssignment(input: {
  userId: number; shiftCode: OperatorShiftCode; effectiveFromDate: string; cycleAnchorDate: string;
  changeReason: string; changedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.transaction((tx) => saveOperatorShiftAssignmentWithTransaction(tx, input));
}

export async function createOperatorShiftExceptionSwap(input: {
  firstUserId: number; firstWorkDate: string; secondUserId: number; secondWorkDate: string;
  shiftOnFirstDate: OperatorShiftCode; shiftOnSecondDate: OperatorShiftCode;
  reason: string; createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (input.firstUserId === input.secondUserId) throw new Error("Selecione dois operadores diferentes para a troca");
  if (input.firstWorkDate === input.secondWorkDate) throw new Error("A troca pontual precisa envolver duas datas diferentes");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.firstWorkDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.secondWorkDate)) throw new Error("Informe datas válidas");
  addCalendarDays(input.firstWorkDate, 0); addCalendarDays(input.secondWorkDate, 0);
  if (input.firstWorkDate < localDateKey(new Date()) || input.secondWorkDate < localDateKey(new Date())) throw new Error("Não é possível criar troca operacional retroativa");
  const reason = input.reason.trim();
  if (reason.length < 5) throw new Error("Informe o motivo da troca");
  return db.transaction(async (tx: DbLike) => {
    const locked = await tx.select({ id: users.id, name: users.name, role: users.role }).from(users)
      .where(inArray(users.id, [input.firstUserId, input.secondUserId].sort((a, b) => a - b))).orderBy(users.id).for("update");
    if (locked.length !== 2 || locked.some((row: any) => !OPERATIONAL_ROLES.includes(row.role))) throw new Error("Os dois usuários precisam estar ativos no perfil operacional");
    const byId = new Map(locked.map((row: any) => [Number(row.id), row]));
    const first: any = byId.get(input.firstUserId)!;
    const second: any = byId.get(input.secondUserId)!;
    const pairs = [
      { userId: input.firstUserId, date: input.firstWorkDate },
      { userId: input.secondUserId, date: input.firstWorkDate },
      { userId: input.secondUserId, date: input.secondWorkDate },
      { userId: input.firstUserId, date: input.secondWorkDate },
    ];
    for (const pair of pairs) {
      await tx.update(operatorShiftExceptions).set({ isActive: false, cancelledAt: new Date(), cancelledBy: input.createdBy })
        .where(and(eq(operatorShiftExceptions.userId, pair.userId), eq(operatorShiftExceptions.workDate, pair.date), eq(operatorShiftExceptions.isActive, true)));
    }
    const additions = [
      { userId: input.firstUserId, operatorName: first.name || `Operador ${input.firstUserId}`, workDate: input.firstWorkDate, kind: "off", shiftCode: null, pairedUserId: input.secondUserId, pairedOperatorName: second.name || `Operador ${input.secondUserId}` },
      { userId: input.secondUserId, operatorName: second.name || `Operador ${input.secondUserId}`, workDate: input.firstWorkDate, kind: "work", shiftCode: input.shiftOnFirstDate, pairedUserId: input.firstUserId, pairedOperatorName: first.name || `Operador ${input.firstUserId}` },
      { userId: input.secondUserId, operatorName: second.name || `Operador ${input.secondUserId}`, workDate: input.secondWorkDate, kind: "off", shiftCode: null, pairedUserId: input.firstUserId, pairedOperatorName: first.name || `Operador ${input.firstUserId}` },
      { userId: input.firstUserId, operatorName: first.name || `Operador ${input.firstUserId}`, workDate: input.secondWorkDate, kind: "work", shiftCode: input.shiftOnSecondDate, pairedUserId: input.secondUserId, pairedOperatorName: second.name || `Operador ${input.secondUserId}` },
    ];
    await tx.insert(operatorShiftExceptions).values(additions.map((row) => ({ ...row, reason, createdBy: input.createdBy, isActive: true })) as any);
    return { success: true, affectedDates: [input.firstWorkDate, input.secondWorkDate], exceptionsCreated: additions.length };
  });
}

export async function getOperatorShiftReport(input: { fromDate: string; toDate: string; userId?: number; now?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.toDate) || input.fromDate > input.toDate) throw new Error("Informe um período de relatório válido");
  if (calendarDayDistance(input.fromDate, input.toDate) > 92) throw new Error("Consulte até 93 dias de escala por vez");
  const now = input.now || new Date();
  const current = getCurrentShiftWindow(now);
  const currentWindows = getCurrentShiftWindows(now);
  const currentShifts = await Promise.all(currentWindows.map(async (window) => ({
    ...window,
    expectedOperators: await listRosterForWindow(db, window.workDate, window.shiftCode),
  })));
  const roster = currentShifts.find((window) => window.shiftCode === current.shiftCode)?.expectedOperators || [];
  const fromAt = new Date(`${input.fromDate}T00:00:00-03:00`);
  const toAt = new Date(`${input.toDate}T23:59:59.999-03:00`);
  const where = [gte(operatorAttendanceRecords.loginAt, fromAt), lte(operatorAttendanceRecords.loginAt, toAt)];
  if (input.userId) where.push(eq(operatorAttendanceRecords.userId, input.userId) as any);
  const attendanceRows = await db.select({ attendance: operatorAttendanceRecords, sessionLastSeenAt: authSessions.lastSeenAt, sessionExpiresAt: authSessions.expiresAt })
    .from(operatorAttendanceRecords).leftJoin(authSessions, eq(operatorAttendanceRecords.authSessionId, authSessions.id))
    .where(and(...where)).orderBy(desc(operatorAttendanceRecords.loginAt)).limit(2000);
  const activeWhere = [isNull(operatorAttendanceRecords.logoutAt), gt(authSessions.expiresAt, now), isNull(authSessions.revokedAt)];
  if (input.userId) activeWhere.push(eq(operatorAttendanceRecords.userId, input.userId) as any);
  const activeRows = await db.select({ attendance: operatorAttendanceRecords, sessionLastSeenAt: authSessions.lastSeenAt, sessionExpiresAt: authSessions.expiresAt })
    .from(operatorAttendanceRecords).innerJoin(authSessions, eq(operatorAttendanceRecords.authSessionId, authSessions.id))
    .where(and(...activeWhere)).orderBy(desc(operatorAttendanceRecords.loginAt)).limit(500);
  const connectedSessions = getConnectedOperatorSessionIds();
  const people = await db.select({ id: users.id, name: users.name }).from(users).where(and(
    inArray(users.role, [...OPERATIONAL_ROLES]), input.userId ? eq(users.id, input.userId) : undefined,
  ));
  const plannedIds = people.map((person) => person.id);
  const assignments = plannedIds.length ? await db.select().from(operatorShiftAssignments).where(and(
    inArray(operatorShiftAssignments.userId, plannedIds), lte(operatorShiftAssignments.effectiveFromDate, input.toDate),
    or(isNull(operatorShiftAssignments.effectiveUntilDate), gte(operatorShiftAssignments.effectiveUntilDate, input.fromDate)), eq(operatorShiftAssignments.isActive, true),
  )) : [];
  const exceptions = plannedIds.length ? await db.select().from(operatorShiftExceptions).where(and(
    inArray(operatorShiftExceptions.userId, plannedIds), gte(operatorShiftExceptions.workDate, input.fromDate), lte(operatorShiftExceptions.workDate, input.toDate), eq(operatorShiftExceptions.isActive, true),
  )) : [];
  const monthlyPlan = buildOperatorMonthlyPlan({ fromDate: input.fromDate, toDate: input.toDate, people, assignments, exceptions });
  return {
    currentShift: { ...current, expectedOperators: roster },
    currentShifts,
    monthlyPlan,
    resultLimitReached: attendanceRows.length === 2000,
    activeOperators: activeRows.map((row: any) => ({
      attendanceId: Number(row.attendance.id), userId: row.attendance.userId, operatorName: row.attendance.operatorName,
      role: row.attendance.role, loginAt: row.attendance.loginAt, lastSeenAt: row.sessionLastSeenAt,
      shiftCode: row.attendance.shiftCode, workDate: row.attendance.workDate,
      scheduledStartAt: row.attendance.scheduledStartAt, scheduledEndAt: row.attendance.scheduledEndAt,
      socketConnected: connectedSessions.has(Number(row.attendance.authSessionId)) && isOperatorSessionSocketConnected(Number(row.attendance.authSessionId)),
      isScheduledNow: Boolean(row.attendance.scheduledStartAt && row.attendance.scheduledEndAt && new Date(row.attendance.scheduledStartAt) <= now && new Date(row.attendance.scheduledEndAt) > now),
    })),
    attendance: attendanceRows.map((row: any) => ({ ...row.attendance, authSessionId: undefined, sessionLastSeenAt: row.sessionLastSeenAt })),
  };
}

export async function listOperatorShiftExceptions(fromDate: string, toDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate) || fromDate > toDate) throw new Error("Período de trocas inválido");
  return db.select().from(operatorShiftExceptions).where(and(
    gte(operatorShiftExceptions.workDate, fromDate), lte(operatorShiftExceptions.workDate, toDate),
  )).orderBy(desc(operatorShiftExceptions.createdAt)).limit(500);
}

export async function getOperatorLogoutPreview(input: { userId: number; authSessionId: number; now?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const now = input.now || new Date();
  const [attendance] = await db.select({ id: operatorAttendanceRecords.id, shiftCode: operatorAttendanceRecords.shiftCode, scheduledEndAt: operatorAttendanceRecords.scheduledEndAt, workDate: operatorAttendanceRecords.workDate })
    .from(operatorAttendanceRecords).where(and(eq(operatorAttendanceRecords.authSessionId, input.authSessionId), eq(operatorAttendanceRecords.userId, input.userId), isNull(operatorAttendanceRecords.logoutAt))).limit(1);
  const next = attendance?.shiftCode && attendance.workDate ? getShiftAfter(attendance.workDate, attendance.shiftCode) : getNextShiftWindow(now);
  const recipients = await listRosterForWindow(db, next.workDate, next.shiftCode, input.userId);
  const availableRecipients = recipients.length ? recipients : (await db.select({ id: users.id, name: users.name, role: users.role }).from(users)
    .where(and(inArray(users.role, [...OPERATIONAL_ROLES]), sql`${users.id} <> ${input.userId}`))).map((row: any) => ({ userId: Number(row.id), name: row.name || `Operador ${row.id}`, role: row.role, shiftCode: null, isException: false, exceptionReason: null }));
  const rows = await db.select({
    incident: incidents,
    account: alarmEvents.account,
    eventCode: alarmEvents.eventCode,
    description: alarmEvents.description,
  }).from(incidents).innerJoin(alarmEvents, eq(incidents.eventId, alarmEvents.id)).where(and(
    eq(incidents.operatorId, input.userId), inArray(incidents.status, [...OPEN_STATUSES]),
  )).orderBy(desc(alarmEvents.receivedAt));
  return {
    pendingIncidents: rows.map((row: any) => ({
      incidentId: row.incident.id, status: row.incident.status, version: row.incident.version,
      account: row.account, eventCode: row.eventCode, description: row.description,
      observationUntil: row.incident.observationUntil, notes: row.incident.notes,
    })),
    nextShift: { shiftCode: next.shiftCode, workDate: next.workDate, startAt: next.startAt, endAt: next.endAt },
    nextOperators: recipients,
    availableRecipients,
    fallbackRecipients: recipients.length === 0,
    attendance: attendance || null,
  };
}

export async function endOperatorSessionWithHandoff(input: {
  userId: number; authSessionId: number; operatorName: string;
  handoffs: Array<{ incidentId: number; toUserId: number; message: string; observationUntil?: Date }>;
  now?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const now = input.now || new Date();
  return db.transaction(async (tx: DbLike) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).for("update").limit(1);
    const [session] = await tx.select().from(authSessions).where(and(eq(authSessions.id, input.authSessionId), eq(authSessions.userId, input.userId))).for("update").limit(1);
    if (!session) return { success: true, revokedSessionIds: [], messages: [] as any[] };
    if (session.revokedAt) return { success: true, revokedSessionIds: [], messages: [] as any[] };
    if (new Date(session.expiresAt) <= now) {
      await tx.update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.id, input.authSessionId), isNull(authSessions.revokedAt)));
      await tx.update(operatorAttendanceRecords).set({ logoutAt: new Date(session.expiresAt), logoutReason: "session_expired" })
        .where(and(eq(operatorAttendanceRecords.authSessionId, input.authSessionId), isNull(operatorAttendanceRecords.logoutAt)));
      return { success: true, revokedSessionIds: [input.authSessionId], messages: [] as any[] };
    }
    const attendance = await ensureSessionAttendance(tx, input.userId, input.authSessionId, session.createdAt, now);
    if (attendance.logoutAt) throw new Error("Esta sessão já foi encerrada. Atualize a tela.");
    const nextWindow = attendance?.shiftCode && attendance.workDate ? getShiftAfter(attendance.workDate, attendance.shiftCode) : getNextShiftWindow(now);
    const incidentsOpen = await tx.select({
      incident: incidents, account: alarmEvents.account, eventCode: alarmEvents.eventCode, description: alarmEvents.description,
    }).from(incidents).innerJoin(alarmEvents, eq(incidents.eventId, alarmEvents.id)).where(and(
      eq(incidents.operatorId, input.userId), inArray(incidents.status, [...OPEN_STATUSES]),
    )).orderBy(incidents.id).for("update");
    const scheduledRecipients = await listRosterForWindow(tx, nextWindow.workDate, nextWindow.shiftCode, input.userId);
    const fallbackRecipients = scheduledRecipients.length === 0
      ? await tx.select({ id: users.id, name: users.name, role: users.role }).from(users).where(and(inArray(users.role, [...OPERATIONAL_ROLES]), sql`${users.id} <> ${input.userId}`))
      : [];
    const allowedRecipientIds = new Set<number>((scheduledRecipients.length ? scheduledRecipients.map((person: any) => Number(person.userId)) : fallbackRecipients.map((person: any) => Number(person.id))));
    const handoffPlan = validateOperatorHandoffPlan({
      openIncidents: incidentsOpen.map((row: any) => ({ incidentId: Number(row.incident.id), status: row.incident.status, account: row.account })),
      handoffs: input.handoffs, allowedRecipientIds,
    });
    const messages: Array<{ id: number; toUserId: number; toOperatorName: string; fromOperatorName: string; incidentId: number; account: string }> = [];
    for (const { incident: plannedIncident, handoff } of handoffPlan) {
      const row = incidentsOpen.find((candidate: any) => Number(candidate.incident.id) === plannedIncident.incidentId)!;
      const incidentId = Number(row.incident.id);
      const message = handoff.message.trim();
      const recipient = scheduledRecipients.length
        ? scheduledRecipients.find((person: any) => person.userId === handoff.toUserId)
        : fallbackRecipients.find((person: any) => Number(person.id) === handoff.toUserId);
      if (!recipient) throw new Error(`Operador destinatário da ocorrência #${incidentId} não está disponível.`);
      const nextName = recipient.name || `Operador ${handoff.toUserId}`;
      const stampedNote = `[Passagem ${now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · para ${nextName}] ${message}`;
      const previousNotes = row.incident.notes?.trim();
      const combinedNotes = [previousNotes, stampedNote].filter(Boolean).join("\n");
      if (Buffer.byteLength(combinedNotes, "utf8") > 60000) throw new Error(`As anotações da ocorrência #${incidentId} excedem o limite do registro. Peça ao supervisor para revisar o histórico antes da passagem.`);
      const statusBefore = row.incident.status;
      const nextStatus = "observing" as const;
      const selectedHandoff = input.handoffs.find((item) => item.incidentId === incidentId)!;
      const existingUntil = selectedHandoff.observationUntil ? new Date(selectedHandoff.observationUntil)
        : row.incident.observationUntil && new Date(row.incident.observationUntil) > now ? new Date(row.incident.observationUntil) : null;
      if (!existingUntil || Number.isNaN(existingUntil.getTime()) || existingUntil <= now) throw new Error(`Informe uma data e hora futura de observação para a ocorrência #${incidentId}.`);
      const changed = await tx.update(incidents).set({
        status: nextStatus, notes: combinedNotes, observationUntil: existingUntil,
        claimedAt: row.incident.claimedAt || now, version: (row.incident.version || 0) + 1,
      }).where(and(eq(incidents.id, incidentId), eq(incidents.version, row.incident.version || 0)));
      if (Number(changed[0]?.affectedRows) !== 1) throw new Error(`A ocorrência #${incidentId} mudou durante a passagem. Nenhuma alteração foi confirmada.`);
      await tx.insert(incidentHistory).values({
        incidentId, parentIncidentId: row.incident.parentIncidentId, operatorId: input.userId,
        operatorName: input.operatorName.slice(0, 255), action: "shift_handoff",
        statusBefore, statusAfter: nextStatus, note: stampedNote,
      });
      const inserted = await tx.insert(operatorShiftMessages).values({
        fromUserId: input.userId, fromOperatorName: input.operatorName.slice(0, 255),
        fromAttendanceId: Number(attendance.id), toUserId: handoff.toUserId, toOperatorName: nextName.slice(0, 255),
        incidentId, account: row.account, message,
      });
      messages.push({ id: Number(inserted[0]?.insertId || 0), toUserId: handoff.toUserId, toOperatorName: nextName, fromOperatorName: input.operatorName, incidentId, account: row.account });
    }
    const closedAt = now;
    const attendanceUpdate = await tx.update(operatorAttendanceRecords).set({ logoutAt: closedAt, logoutReason: "logout" })
      .where(and(eq(operatorAttendanceRecords.authSessionId, input.authSessionId), isNull(operatorAttendanceRecords.logoutAt)));
    const authUpdate = await tx.update(authSessions).set({ revokedAt: closedAt })
      .where(and(eq(authSessions.id, input.authSessionId), eq(authSessions.userId, input.userId), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now)));
    if (Number(authUpdate[0]?.affectedRows) !== 1) throw new Error("A sessão foi substituída ou expirou. Atualize a tela antes de sair.");
    if (attendance && Number(attendanceUpdate[0]?.affectedRows) !== 1) throw new Error("O registro de presença mudou. Atualize a tela antes de sair.");
    return { success: true, revokedSessionIds: [input.authSessionId], messages };
  });
}

export async function listOperatorMessageRecipients(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.select({ id: users.id, name: users.name }).from(users).where(and(
    inArray(users.role, [...OPERATIONAL_ROLES]), sql`${users.id} <> ${userId}`,
  )).orderBy(users.name);
}

export async function sendOperatorShiftMessage(input: { userId: number; authSessionId: number; toUserId: number; message: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (input.toUserId === input.userId) throw new Error("Selecione outro operador para receber a mensagem");
  const message = input.message.trim();
  if (message.length < 10 || message.length > 4000) throw new Error("Escreva uma mensagem de 10 a 4000 caracteres");
  return db.transaction(async (tx: DbLike) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).for("update").limit(1);
    const [session] = await tx.select().from(authSessions).where(and(
      eq(authSessions.id, input.authSessionId), eq(authSessions.userId, input.userId), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, new Date()),
    )).for("update").limit(1);
    if (!session) throw new Error("A sessão foi encerrada ou substituída; faça login novamente");
    const [recipient] = await tx.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.id, input.toUserId)).limit(1);
    if (!recipient || !OPERATIONAL_ROLES.includes(recipient.role)) throw new Error("Destinatário operacional não encontrado");
    const attendance = await ensureSessionAttendance(tx, input.userId, input.authSessionId, session.createdAt, new Date());
    const values = { fromUserId: input.userId, fromOperatorName: attendance.operatorName, fromAttendanceId: attendance.id,
      toUserId: recipient.id, toOperatorName: recipient.name || `Operador ${recipient.id}`, message };
    const inserted = await tx.insert(operatorShiftMessages).values(values);
    return { id: Number(inserted[0].insertId), ...values };
  });
}

export async function listOperatorShiftInbox(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(operatorShiftMessages).where(and(eq(operatorShiftMessages.toUserId, userId), isNull(operatorShiftMessages.readAt)))
    .orderBy(desc(operatorShiftMessages.createdAt), desc(operatorShiftMessages.id)).limit(50);
}

export async function markOperatorShiftMessageRead(input: { messageId: number; userId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const [message] = await db.select({ id: operatorShiftMessages.id }).from(operatorShiftMessages).where(and(eq(operatorShiftMessages.id, input.messageId), eq(operatorShiftMessages.toUserId, input.userId))).limit(1);
  if (!message) throw new Error("Mensagem não encontrada para este operador");
  await db.update(operatorShiftMessages).set({ readAt: new Date() }).where(and(
    eq(operatorShiftMessages.id, input.messageId), eq(operatorShiftMessages.toUserId, input.userId), isNull(operatorShiftMessages.readAt),
  ));
  return { success: true };
}

export async function acknowledgeOperatorShiftReminder(input: { reminderId: number; userId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const [reminder] = await db.select({ id: operatorShiftReminders.id }).from(operatorShiftReminders).where(and(eq(operatorShiftReminders.id, input.reminderId), eq(operatorShiftReminders.userId, input.userId))).limit(1);
  if (!reminder) throw new Error("Aviso não encontrado para este operador");
  await db.update(operatorShiftReminders).set({ acknowledgedAt: new Date() }).where(and(
    eq(operatorShiftReminders.id, input.reminderId), eq(operatorShiftReminders.userId, input.userId), isNull(operatorShiftReminders.acknowledgedAt),
  ));
  return { success: true };
}

export async function listPendingOperatorShiftReminders(input: { userId: number; authSessionId: number }) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ reminder: operatorShiftReminders }).from(operatorShiftReminders)
    .innerJoin(operatorAttendanceRecords, eq(operatorShiftReminders.attendanceId, operatorAttendanceRecords.id))
    .where(and(
      eq(operatorShiftReminders.userId, input.userId),
      eq(operatorAttendanceRecords.authSessionId, input.authSessionId),
      isNull(operatorShiftReminders.acknowledgedAt),
    )).orderBy(operatorShiftReminders.minutesBefore).limit(10);
}

export async function sweepOperatorShiftOperations(now = new Date()) {
  const db = await getDb();
  if (!db) return { remindersSent: [] as any[], sessionsClosed: 0 };
  const expiredRows = await db.select({ attendanceId: operatorAttendanceRecords.id, attendanceSessionId: operatorAttendanceRecords.authSessionId, expiresAt: authSessions.expiresAt })
    .from(operatorAttendanceRecords).innerJoin(authSessions, eq(operatorAttendanceRecords.authSessionId, authSessions.id))
    .where(and(isNull(operatorAttendanceRecords.logoutAt), lte(authSessions.expiresAt, now))).limit(500);
  let sessionsClosed = 0;
  for (const row of expiredRows) {
    const updated = await db.update(operatorAttendanceRecords).set({ logoutAt: row.expiresAt, logoutReason: "session_expired" })
      .where(and(eq(operatorAttendanceRecords.id, row.attendanceId), isNull(operatorAttendanceRecords.logoutAt)));
    sessionsClosed += Number(updated[0]?.affectedRows || 0);
  }
  const candidates = await db.select({ attendance: operatorAttendanceRecords, sessionExpiresAt: authSessions.expiresAt, sessionRevokedAt: authSessions.revokedAt })
    .from(operatorAttendanceRecords).innerJoin(authSessions, eq(operatorAttendanceRecords.authSessionId, authSessions.id))
    .where(and(isNull(operatorAttendanceRecords.logoutAt), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now), isNotNull(operatorAttendanceRecords.scheduledEndAt))).limit(500);
  const remindersSent: any[] = [];
  for (const candidate of candidates) {
    const attendance = candidate.attendance;
    const minutesBefore = getShiftReminderDueMinutes(now, new Date(attendance.scheduledEndAt!));
    if (!minutesBefore || !attendance.shiftCode || !attendance.workDate) continue;
    const endAt = new Date(attendance.scheduledEndAt!).toISOString().replace("T", " ").slice(0, 19);
    const inserted = await db.execute(sql`INSERT IGNORE INTO ${operatorShiftReminders}
      (attendanceId, userId, operatorName, shiftCode, workDate, minutesBefore, shiftEndsAt)
      VALUES (${Number(attendance.id)}, ${attendance.userId}, ${attendance.operatorName}, ${attendance.shiftCode}, ${attendance.workDate}, ${minutesBefore}, ${endAt})`);
    if (Number(inserted[0]?.affectedRows || 0) > 0) remindersSent.push({
      reminderId: Number(inserted[0].insertId), authSessionId: Number(attendance.authSessionId), userId: attendance.userId,
      operatorName: attendance.operatorName, shiftCode: attendance.shiftCode, minutesBefore, shiftEndsAt: attendance.scheduledEndAt,
    });
  }
  return { remindersSent, sessionsClosed };
}
