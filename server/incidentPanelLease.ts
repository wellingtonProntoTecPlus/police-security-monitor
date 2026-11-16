import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { authSessions, incidentHistory, incidentPanelLeases, incidents, operatorShiftMessages, users } from "../drizzle/schema";
import { canAcquirePanelLease, isPanelLeaseActive, ownsActivePanelLease, type PanelLeaseActor, type PanelLeaseSnapshot } from "./incidentPanelLeasePolicy";

export const PANEL_LEASE_TTL_MS = 90_000;
const OPEN_STATUSES = ["waiting", "attending", "observing", "dispatched", "maintenance"] as const;
export type PanelActor = PanelLeaseActor & { operatorName: string };

export function requireOperationalReason(value: string | null | undefined) {
  const reason = value?.trim() || "";
  if (reason.length < 5 || reason.length > 2000) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o motivo operacional (5 a 2000 caracteres)." });
  return reason;
}

/** Same lock order as incident mutations and logoff: user, session, incident, lease. */
export async function lockPanelActorSession(tx: any, actor: Pick<PanelActor, "operatorId" | "authSessionId">, now = new Date()) {
  if (!actor.authSessionId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão operacional não identificada." });
  await tx.select({ id: users.id }).from(users).where(eq(users.id, actor.operatorId)).for("update").limit(1);
  const [session] = await tx.select().from(authSessions).where(and(eq(authSessions.id, actor.authSessionId), eq(authSessions.userId, actor.operatorId), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now))).for("update").limit(1);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sua sessão foi encerrada ou substituída; atualize a fila antes de continuar." });
  return session;
}

/** Caller locks incident row first; never lock the other operator's session. */
export async function readPanelLease(tx: any, incidentId: number): Promise<(PanelLeaseSnapshot & { operatorName: string | null }) | undefined> {
  const [row] = await tx.select({ lease: incidentPanelLeases, sessionRevokedAt: authSessions.revokedAt, sessionExpiresAt: authSessions.expiresAt, operatorName: users.name })
    .from(incidentPanelLeases).leftJoin(authSessions, and(eq(authSessions.id, incidentPanelLeases.authSessionId), eq(authSessions.userId, incidentPanelLeases.operatorId)))
    .leftJoin(users, eq(users.id, incidentPanelLeases.operatorId)).where(eq(incidentPanelLeases.incidentId, incidentId)).limit(1);
  return row ? { ...row.lease, sessionRevokedAt: row.sessionRevokedAt, sessionExpiresAt: row.sessionExpiresAt, operatorName: row.operatorName } : undefined;
}
export async function assertActivePanelLease(tx: any, incidentId: number, actor: PanelLeaseActor, now = new Date()) {
  const lease = await readPanelLease(tx, incidentId);
  if (!ownsActivePanelLease(lease, actor, now)) throw new TRPCError({ code: "CONFLICT", message: "O painel não está mais reservado a esta tela. Atualize a fila e abra/assuma o atendimento novamente." });
  return lease!;
}
export async function clearPanelLease(tx: any, incidentId: number, actor: PanelLeaseActor) {
  await tx.delete(incidentPanelLeases).where(and(eq(incidentPanelLeases.incidentId, incidentId), eq(incidentPanelLeases.authSessionId, actor.authSessionId), eq(incidentPanelLeases.leaseToken, actor.leaseToken)));
}

export async function openIncidentPanelWithDb(db: any, input: { incidentId: number; assume?: boolean }, actor: PanelActor, now = new Date()) {
  return db.transaction(async (tx: any) => {
    await lockPanelActorSession(tx, actor, now);
    const [current] = await tx.select().from(incidents).where(eq(incidents.id, input.incidentId)).for("update").limit(1);
    if (!current || !OPEN_STATUSES.includes(current.status)) throw new TRPCError({ code: "NOT_FOUND", message: "Ocorrência aberta não encontrada." });
    const lease = await readPanelLease(tx, current.id);
    if (!canAcquirePanelLease(lease, actor, now)) throw new TRPCError({ code: "CONFLICT", message: `Ocorrência em atendimento por ${lease?.operatorName || "outro operador"}.` });
    if (ownsActivePanelLease(lease, actor, now)) {
      const expiresAt = new Date(now.getTime() + PANEL_LEASE_TTL_MS);
      await tx.update(incidentPanelLeases).set({ expiresAt }).where(eq(incidentPanelLeases.incidentId, current.id));
      return { id: current.id, parentIncidentId: current.parentIncidentId, status: current.status, operatorId: current.operatorId, operatorName: actor.operatorName, notes: current.notes, pauseReason: current.pauseReason, leaseToken: actor.leaseToken, leaseExpiresAt: expiresAt };
    }
    const transferring = current.operatorId != null && current.operatorId !== actor.operatorId;
    if (transferring && !input.assume) throw new TRPCError({ code: "CONFLICT", message: "Ocorrência pausada. Use Assumir atendimento para registrar a transferência." });
    const [legacyChild] = await tx.select({ id: incidents.id }).from(incidents).where(and(eq(incidents.parentIncidentId, current.id), inArray(incidents.status, [...OPEN_STATUSES]))).limit(1);
    if (legacyChild) throw new TRPCError({ code: "CONFLICT", message: `Atendimento legado #${legacyChild.id} ainda aberto; resolva esse registro antes de assumir o principal.` });
    const previousOperatorName = current.operatorId ? (await tx.select({ name: users.name }).from(users).where(eq(users.id, current.operatorId)).limit(1))[0]?.name || `Operador ${current.operatorId}` : null;
    const status = current.status === "waiting" ? "attending" : current.status;
    const note = transferring ? `Assumiu atendimento pausado de ${previousOperatorName}; situação ${current.status} e histórico preservados.` : "Abriu o painel de atendimento; exclusividade temporária desta tela.";
    const expiresAt = new Date(now.getTime() + PANEL_LEASE_TTL_MS);
    const changed = await tx.update(incidents).set({ status, operatorId: actor.operatorId, claimedAt: current.claimedAt || now, version: (current.version || 0) + 1 }).where(and(eq(incidents.id, current.id), eq(incidents.version, current.version || 0)));
    if (Number(changed[0]?.affectedRows) !== 1) throw new TRPCError({ code: "CONFLICT", message: "Atendimento mudou; atualize a fila." });
    await tx.insert(incidentPanelLeases).values({ incidentId: current.id, operatorId: actor.operatorId, authSessionId: actor.authSessionId, leaseToken: actor.leaseToken, expiresAt }).onDuplicateKeyUpdate({ set: { operatorId: actor.operatorId, authSessionId: actor.authSessionId, leaseToken: actor.leaseToken, expiresAt } });
    await tx.insert(incidentHistory).values({ incidentId: current.id, parentIncidentId: current.parentIncidentId, operatorId: actor.operatorId, operatorName: actor.operatorName.slice(0, 255), action: transferring ? "assumed" : "attendance_opened", statusBefore: current.status, statusAfter: status, note });
    let forwardedMessage = null;
    if (transferring) {
      const [message] = await tx.select().from(operatorShiftMessages).where(and(eq(operatorShiftMessages.incidentId, current.id), eq(operatorShiftMessages.isCurrent, true))).orderBy(desc(operatorShiftMessages.createdAt), desc(operatorShiftMessages.id)).for("update").limit(1);
      if (message && message.toUserId !== actor.operatorId) {
        await tx.update(operatorShiftMessages).set({ isCurrent: false }).where(eq(operatorShiftMessages.id, message.id));
        const inserted = await tx.insert(operatorShiftMessages).values({ fromUserId: message.fromUserId, fromOperatorName: message.fromOperatorName, fromAttendanceId: message.fromAttendanceId, toUserId: actor.operatorId, toOperatorName: actor.operatorName.slice(0,255), incidentId: current.id, account: message.account, message: message.message, isCurrent: true, readAt: null, createdAt: now });
        forwardedMessage = { id: Number(inserted[0].insertId), fromOperatorName: message.fromOperatorName, toUserId: actor.operatorId, toOperatorName: actor.operatorName, incidentId: current.id, account: message.account };
      }
    }
    return { id: current.id, parentIncidentId: current.parentIncidentId, status, operatorId: actor.operatorId, operatorName: actor.operatorName, notes: current.notes, pauseReason: current.pauseReason, leaseToken: actor.leaseToken, leaseExpiresAt: expiresAt, previousOperatorName, forwardedMessage };
  });
}

export async function renewIncidentPanelWithDb(db: any, incidentId: number, actor: PanelActor, now = new Date()) {
  return db.transaction(async (tx: any) => {
    await lockPanelActorSession(tx, actor, now);
    const [current] = await tx.select().from(incidents).where(eq(incidents.id, incidentId)).for("update").limit(1);
    if (!current || current.status === "closed") throw new TRPCError({ code: "NOT_FOUND", message: "Ocorrência não está mais aberta." });
    await assertActivePanelLease(tx, incidentId, actor, now);
    const leaseExpiresAt = new Date(now.getTime() + PANEL_LEASE_TTL_MS);
    await tx.update(incidentPanelLeases).set({ expiresAt: leaseExpiresAt }).where(and(eq(incidentPanelLeases.incidentId, incidentId), eq(incidentPanelLeases.leaseToken, actor.leaseToken)));
    return { leaseExpiresAt };
  });
}

export async function pauseIncidentPanelWithDb(db: any, incidentId: number, reasonValue: string, actor: PanelActor, now = new Date()) {
  const reason = requireOperationalReason(reasonValue);
  return db.transaction(async (tx: any) => {
    await lockPanelActorSession(tx, actor, now);
    const [current] = await tx.select().from(incidents).where(eq(incidents.id, incidentId)).for("update").limit(1);
    if (!current || current.status === "closed") throw new TRPCError({ code: "NOT_FOUND", message: "Ocorrência não está mais aberta." });
    const lease = await readPanelLease(tx, incidentId);
    if (!lease && current.operatorId === actor.operatorId && current.pauseReason === reason) return { id: incidentId, status: current.status, pauseReason: reason };
    await assertActivePanelLease(tx, incidentId, actor, now);
    await tx.update(incidents).set({ pauseReason: reason, notes: [current.notes, reason].filter(Boolean).join("\n"), version: (current.version || 0) + 1 }).where(eq(incidents.id, incidentId));
    await tx.insert(incidentHistory).values({ incidentId, parentIncidentId: current.parentIncidentId, operatorId: actor.operatorId, operatorName: actor.operatorName.slice(0, 255), action: "paused", statusBefore: current.status, statusAfter: current.status, note: reason });
    await clearPanelLease(tx, incidentId, actor);
    return { id: incidentId, status: current.status, pauseReason: reason };
  });
}
