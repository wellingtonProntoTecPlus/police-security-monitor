import { and, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { alarmEvents, alarmSystems, incidentHistory, incidents } from "../drizzle/schema";
import { assertActivePanelLease, clearPanelLease, lockPanelActorSession, readPanelLease, requireOperationalReason, type PanelActor } from "./incidentPanelLease";
import { isPanelLeaseActive } from "./incidentPanelLeasePolicy";

const OPEN = ["waiting", "attending", "observing", "dispatched", "maintenance"] as const;
export async function startSystemMaintenanceWithDb(db: any, input: { systemId: number; incidentId: number; startAt: Date; endAt: Date; notes: string }, actor: PanelActor, operationalNow: Date) {
  const reason = requireOperationalReason(input.notes);
  if (input.endAt <= input.startAt || input.endAt <= operationalNow) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um intervalo futuro válido para a manutenção." });
  return db.transaction(async (tx: any) => {
    await lockPanelActorSession(tx, actor);
    const rows = await tx.select().from(incidents).where(and(eq(incidents.alarmSystemId, input.systemId), eq(incidents.restorationWaitPending, false), inArray(incidents.status, [...OPEN]))).orderBy(incidents.id).for("update");
    const selected = rows.find((row: any) => row.id === input.incidentId);
    if (!selected) throw new TRPCError({ code: "NOT_FOUND", message: "Ocorrência aberta não pertence à central selecionada." });
    await assertActivePanelLease(tx, selected.id, actor);
    const [system] = await tx.select().from(alarmSystems).where(eq(alarmSystems.id, input.systemId)).for("update").limit(1);
    if (!system) throw new TRPCError({ code: "NOT_FOUND", message: "Central não encontrada." });
    const activeNow = input.startAt <= operationalNow;
    for (const row of rows) {
      const lease = await readPanelLease(tx, row.id);
      if (isPanelLeaseActive(lease) && row.id !== selected.id) throw new TRPCError({ code: "CONFLICT", message: `Ocorrência #${row.id} em atendimento por ${lease?.operatorName || "outro operador"}; não foi alterada a manutenção.` });
    }
    await tx.update(alarmSystems).set({ maintenanceStartAt: input.startAt, maintenanceEndAt: input.endAt, maintenanceNotes: reason, maintenanceOperatorId: actor.operatorId }).where(eq(alarmSystems.id, input.systemId));
    for (const row of activeNow ? rows : [selected]) {
      const status = activeNow ? "maintenance" : row.status;
      await tx.update(incidents).set({ status, observationUntil: activeNow ? null : row.observationUntil, pauseReason: reason, notes: [row.notes, reason].filter(Boolean).join("\n"), version: row.version + 1 }).where(eq(incidents.id, row.id));
      await tx.insert(incidentHistory).values({ incidentId: row.id, parentIncidentId: row.parentIncidentId, operatorId: actor.operatorId, operatorName: actor.operatorName.slice(0, 255), action: activeNow ? "maintenance" : "maintenance_scheduled", statusBefore: row.status, statusAfter: status, note: reason });
    }
    await clearPanelLease(tx, selected.id, actor);
    return { success: true, incidentId: selected.id, status: activeNow ? "maintenance" : selected.status, pauseReason: reason };
  }, { isolationLevel: "read committed" });
}

export async function endSystemMaintenanceWithDb(db: any, input: { systemId: number; incidentId: number }, actor: PanelActor) {
  return db.transaction(async (tx: any) => {
    await lockPanelActorSession(tx, actor);
    const rows = await tx.select().from(incidents).where(and(eq(incidents.alarmSystemId, input.systemId), eq(incidents.restorationWaitPending, false), inArray(incidents.status, [...OPEN]))).orderBy(incidents.id).for("update");
    const selected = rows.find((row: any) => row.id === input.incidentId);
    if (!selected) throw new TRPCError({ code: "NOT_FOUND", message: "Abra uma ocorrência da central antes de retirar a manutenção." });
    await assertActivePanelLease(tx, selected.id, actor);
    for (const row of rows) {
      const lease = await readPanelLease(tx, row.id);
      if (isPanelLeaseActive(lease)) {
        if (row.id !== input.incidentId) throw new TRPCError({ code: "CONFLICT", message: `Ocorrência #${row.id} possui um painel ativo. Não foi alterada a manutenção.` });
        await assertActivePanelLease(tx, row.id, actor);
      }
    }
    const [system] = await tx.select().from(alarmSystems).where(eq(alarmSystems.id, input.systemId)).for("update").limit(1);
    if (!system) throw new TRPCError({ code: "NOT_FOUND", message: "Central não encontrada." });
    await tx.update(alarmSystems).set({ maintenanceStartAt: null, maintenanceEndAt: null, maintenanceNotes: null, maintenanceOperatorId: null }).where(eq(alarmSystems.id, input.systemId));
    for (const row of rows.filter((row: any) => row.status === "maintenance")) {
      const note = "Manutenção retirada pelo operador; ocorrência retornada à fila de atendimento.";
      await tx.update(incidents).set({ status: "attending", observationUntil: null, notes: [row.notes, note].filter(Boolean).join("\n"), version: row.version + 1 }).where(eq(incidents.id, row.id));
      await tx.insert(incidentHistory).values({ incidentId: row.id, parentIncidentId: row.parentIncidentId, operatorId: actor.operatorId, operatorName: actor.operatorName.slice(0,255), action: "maintenance_released", statusBefore: row.status, statusAfter: "attending", note });
    }
    return { success: true };
  }, { isolationLevel: "read committed" });
}

/** Lock/recheck each window before expiry so extension and finalization cannot be overwritten. */
export async function reconcileOperationalIncidentWindowsWithDb(db: any, reference: Date) {
  const systems = await db.select({ id: alarmSystems.id }).from(alarmSystems).where(lte(alarmSystems.maintenanceEndAt, reference));
  for (const system of systems) await db.transaction(async (tx: any) => {
    const rows = await tx.select().from(incidents).where(and(eq(incidents.alarmSystemId, system.id), eq(incidents.status, "maintenance"))).orderBy(incidents.id).for("update");
    const [current] = await tx.select().from(alarmSystems).where(eq(alarmSystems.id, system.id)).for("update").limit(1);
    if (!current?.maintenanceEndAt || current.maintenanceEndAt > reference) return;
    await tx.update(alarmSystems).set({ maintenanceStartAt: null, maintenanceEndAt: null, maintenanceNotes: null, maintenanceOperatorId: null }).where(eq(alarmSystems.id, system.id));
    for (const row of rows) {
      const note = "Período de manutenção encerrado. Ocorrência retornada à fila de atendimento.";
      await tx.update(incidents).set({ status: "attending", notes: [row.notes, note].filter(Boolean).join("\n"), version: row.version + 1 }).where(eq(incidents.id, row.id));
      await tx.insert(incidentHistory).values({ incidentId: row.id, parentIncidentId: row.parentIncidentId, operatorName: "Sistema", action: "maintenance_expired", statusBefore: "maintenance", statusAfter: "attending", note });
    }
  }, { isolationLevel: "read committed" });
  const candidates = await db.select({ id: incidents.id }).from(incidents).where(and(eq(incidents.status, "observing"), eq(incidents.restorationWaitPending, false), lte(incidents.observationUntil, reference)));
  for (const candidate of candidates) await db.transaction(async (tx: any) => {
    const [current] = await tx.select().from(incidents).where(eq(incidents.id, candidate.id)).for("update").limit(1);
    if (!current || current.restorationWaitPending || current.status !== "observing" || !current.observationUntil || current.observationUntil > reference) return;
    const [event] = await tx.select({ brand: alarmEvents.brand, qualifier: alarmEvents.qualifier, eventCode: alarmEvents.eventCode }).from(alarmEvents).where(eq(alarmEvents.id, current.eventId)).limit(1);
    if (event?.brand === "RADIOENGE" && event.qualifier === "E" && event.eventCode === "361") return;
    const note = "Prazo de observação encerrado. Ocorrência retornada à fila de atendimento.";
    await tx.update(incidents).set({ status: "attending", observationUntil: null, notes: [current.notes, note].filter(Boolean).join("\n"), version: current.version + 1 }).where(eq(incidents.id, current.id));
    await tx.insert(incidentHistory).values({ incidentId: current.id, parentIncidentId: current.parentIncidentId, operatorName: "Sistema", action: "observation_expired", statusBefore: "observing", statusAfter: "attending", note });
  });
  // Activate only existing open incidents for a scheduled window. Never create a new
  // Contact ID/incident during a queue read, especially after manual finalization.
  const active = await db.select({ id: alarmSystems.id }).from(alarmSystems).where(and(lte(alarmSystems.maintenanceStartAt, reference), sql`${alarmSystems.maintenanceEndAt} > ${reference}`));
  for (const system of active) await db.transaction(async (tx: any) => {
    const rows = await tx.select().from(incidents).where(and(eq(incidents.alarmSystemId, system.id), eq(incidents.restorationWaitPending, false), inArray(incidents.status, ["waiting", "attending", "observing", "dispatched"]))).orderBy(incidents.id).for("update");
    const [current] = await tx.select().from(alarmSystems).where(eq(alarmSystems.id, system.id)).for("update").limit(1);
    if (!current?.maintenanceStartAt || !current.maintenanceEndAt || current.maintenanceStartAt > reference || current.maintenanceEndAt <= reference) return;
    for (const row of rows) {
      if (isPanelLeaseActive(await readPanelLease(tx, row.id))) continue;
      const note = current.maintenanceNotes || "Janela de manutenção agendada ativada.";
      await tx.update(incidents).set({ status: "maintenance", observationUntil: null, pauseReason: current.maintenanceNotes, notes: [row.notes, note].filter(Boolean).join("\n"), version: row.version + 1 }).where(eq(incidents.id, row.id));
      await tx.insert(incidentHistory).values({ incidentId: row.id, parentIncidentId: row.parentIncidentId, operatorName: "Sistema", action: "maintenance", statusBefore: row.status, statusAfter: "maintenance", note });
    }
  }, { isolationLevel: "read committed" });
}
